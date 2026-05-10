# SigComply Evidence SPA — Claude Context

## Sibling Repos

Full product architecture (engine, dashboard, two flows, privacy invariants) lives in the [parent CLAUDE.md](../CLAUDE.md). Don't repeat it here.

The five SigComply repos are cloned as siblings under the same parent directory:

| Repo | Goal | Local | Origin |
|------|------|-------|--------|
| Engine (Go CLI) | Runs OPA/Rego policies locally in customer CI/CD; signs evidence to the customer's own bucket — raw evidence never leaves their environment. | `../sigcomply-cli/` | `git@github.com:SigComply/sigcomply-cli.git` |
| Compliance Dashboard (Rails) | Receives only aggregated counts/scores from the CLI; powers customer & auditor dashboards. No raw evidence, no PII. | `../sigcomply/` | `git@github.com:SigComply/sigcomply.git` |
| Manual Evidence SPA (this repo) | Static helper that turns declaration/checklist forms into PDFs and verifies CLI-signed envelopes in-browser. No backend. | `./` | `git@github.com:SigComply/sigcomply-evidence-spa.git` |
| E2E — GitHub | Simulated customer repo that runs the full CLI pipeline in GitHub Actions against test-org credentials. | `../sigcomply-cli-testing-project-github/` | `git@github.com:SigComply/sigcomply-cli-testing-project-github.git` |
| E2E — GitLab | Simulated customer repo that runs the full CLI pipeline in GitLab CI against test-org credentials. | `../sigcomply-cli-testing-project-gitlab/` | `git@gitlab-personal:sigcomply/sigcomply-cli-testing-project-gitlab.git` |

---

## This Repo's Role

This SPA is a **purely optional helper utility**. The CLI does not talk to it, depend on it, or require it — every piece of manual evidence can be produced and uploaded without this app ever being opened. It is off the end-to-end compliance pipeline; it just makes a subset of manual entries (the click-through ones) easier to fill in a browser.

Two unrelated, fully client-side features served from the same Vite SPA:

1. **Evidence form → PDF** (`/`, `/evidence/:framework/:evidenceId`) — for catalog entries that are user attestations, the user fills a form, the SPA renders a PDF in the browser via `@react-pdf/renderer`, and the user downloads `evidence.pdf` and uploads it to their storage bucket. The CLI picks it up on the next run as it would any other manual PDF.
2. **Public envelope verifier** (`/verify`) — drops in a CLI-signed `EvidenceEnvelope` JSON (and optionally the matching `evidence.pdf`), verifies the Ed25519 signature with Web Crypto, and re-hashes the PDF to confirm `file_hash`. Auditor-facing; intentionally has no auth and never phones home.

This app has **no backend**. It reads a pre-built catalog JSON, writes a PDF to the user's disk via browser download, and verifies envelopes locally. Nothing is ever uploaded to a server.

**Scope of the form generator** — only catalog entries that are user attestations: a single statement (`type: declaration`) or a multi-step sign-off (`type: checklist`). A checklist is conceptually a multi-point declaration; both flow through the same form pipeline and produce the same shape of PDF. For evidence sourced externally (HR exports, training certificates, scanned documents, signed NDAs from a counterparty — catalog `type: document_upload`) the user produces the PDF themselves and uploads it directly to the storage path; the SPA is not involved and hides those entries from the dashboard. From the CLI's perspective both arrive as the same kind of file at the same path — at evaluator level the only types are `automated` and `manual`, and for manual entries the CLI only checks presence + temporal window. The catalog `type` distinction is a SPA-side template hint, not something the CLI evaluator branches on.

---

## Stack

- React 19 + TypeScript, Vite 8
- React Router v7 (BrowserRouter)
- Tailwind v4 + shadcn/ui (Base UI primitives, `base-nova` style)
- `@react-pdf/renderer` for PDF generation (~400 KB gz, lazy-imported inside the form-submit handler so the dashboard and `/verify` chunks stay light)
- Web Crypto API (`crypto.subtle`) for Ed25519 envelope verification — no JS crypto library
- `date-fns` for ISO week math
- `lucide-react` for icons
- Path alias: `@/*` → `src/*`

---

## Directory Map

```
public/
  config.json              ← runtime config (frameworks list, storage prefix)
  data/catalogs/{fw}.json  ← pre-built catalog JSONs, committed to git; served as static assets
scripts/
  fetch-catalogs.ts        ← shells out to `sigcomply evidence catalog`, writes public/data/catalogs/{fw}.json
src/
  main.tsx                 ← loads config.json, mounts <App>
  App.tsx                  ← routes: "/", "/evidence/:framework/:evidenceId", "/verify"
  config/runtime.ts        ← loadConfig() / getConfig() singleton
  data/index.ts            ← fetchCatalog(framework) — fetch()es /data/catalogs/{fw}.json from public/
  hooks/
    useCatalog.ts          ← fetches catalog, returns { catalog, loading, error }
    useEvidenceForm.ts     ← form state + validation + lazy PDF render + download
  lib/
    period.ts              ← currentPeriod(frequency) → { key, start, end }
    storage-path.ts        ← computeUploadPath() + EVIDENCE_PDF_FILENAME
    download.ts            ← downloadBlob(blob, filename)
    utils.ts               ← cn() (clsx + tailwind-merge)
    pdf/
      render.tsx           ← renderEvidencePdf(input) → Promise<Blob> (lazy-loaded entry point)
      DeclarationPdf.tsx   ← <Document> for declaration entries
      ChecklistPdf.tsx     ← <Document> for checklist entries
      shared.tsx           ← <Header>, <Footer>, <MetadataBlock>
      metadata.ts          ← metadataKeywords() — fixed key=value; PDF Info string
      styles.ts            ← StyleSheet.create({...})
    verification/
      verify.ts            ← verifyEnvelopeSignature() + sha256Hex() (Web Crypto Ed25519)
      canonical.ts         ← canonicalJSON() — sorted keys, HTML-safe escapes, matches CLI exactly
  pages/
    Dashboard.tsx          ← attestation list (declaration + checklist), filters, framework picker
    EvidenceForm.tsx       ← per-entry form + download-success screen
    Verify.tsx             ← public auditor-facing envelope verifier (drag-drop JSON + optional PDF)
    NotFound.tsx
  components/
    layout/                ← AppLayout, Header
    dashboard/             ← EvidenceList, FrameworkSelector, FrameworkPickerDialog, StatusBadge
    forms/                 ← DeclarationForm, ChecklistForm
    common/LoadingSpinner.tsx
    ui/                    ← shadcn primitives — do NOT hand-edit; regenerate via `npx shadcn add <name>`
  types/
    catalog.ts             ← CatalogEntry, ChecklistItem, EvidenceType, Frequency
    pdf-input.ts           ← PdfInput (input shape for renderEvidencePdf)
    envelope.ts            ← EvidenceEnvelope, SignedPayload, Signature, ManualManifest (mirrors CLI)
    config.ts              ← RuntimeConfig
```

---

## How Data Flows

### Form → PDF flow

1. **Catalog source-of-truth** — catalog JSONs are committed at `public/data/catalogs/{fw}.json` and served as static assets. To regenerate them, run `npm run fetch-catalogs` (which shells out to `sigcomply evidence catalog --framework <fw>`). There is no schema fetch — the SPA does not consume a JSON Schema for evidence anymore.
2. **App start** — `main.tsx` calls `loadConfig()` which fetches `/config.json` (frameworks available, storage prefix). Cached on module.
3. **Dashboard** — reads `getConfig().frameworks`, picks one (from localStorage or picker dialog), calls `useCatalog(framework)` which `fetch`es `/data/catalogs/{fw}.json`, then **filters the catalog to the SPA-renderable types** (`declaration` and `checklist`). `document_upload` entries are hidden — the customer produces those PDFs externally.
4. **Evidence form** — for `declaration` and `checklist` entries, `useEvidenceForm` manages form state, validates on submit, lazy-imports `@/lib/pdf/render`, calls `renderEvidencePdf(input)` to produce a `Blob`, calls `downloadBlob(blob, "evidence.pdf")`, then shows the upload-path instructions screen. For any other type, `EvidenceForm` shows a "uploaded directly to your bucket" message instead of rendering a form.

Flow is one-way: catalog → form → downloaded PDF. **Nothing is ever uploaded from the browser.** The user moves the file to their own bucket manually (or via any tool they like).

### Verify flow (`/verify`)

Independent of the form generator. The user (typically an auditor) supplies an `EvidenceEnvelope` JSON file and optionally the matching `evidence.pdf`:

1. `Verify.tsx` parses the JSON, calls `isEvidenceEnvelope()` to type-guard it, then `verifyEnvelopeSignature()` from `lib/verification/verify.ts`.
2. `canonicalJSON(envelope.signed)` (sorted keys at every nesting, HTML-safe `<`/`>`/`&` escapes — matches the CLI's `internal/core/attestation/canonical.go` byte-for-byte) produces the bytes that were signed.
3. `crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, …)` then `crypto.subtle.verify` validates the 64-byte signature against those bytes. Requires Chrome 113+, Safari 17+, or Firefox 130+.
4. If `signed.evidence.file_hash` is present (manual flow), `getManualManifest()` extracts it; the user can then drop in the PDF and the page re-hashes it via SHA-256 and compares.

No network calls. No PII leaves the browser.

---

## PDF Layout & Metadata

Every generated PDF carries the same metadata in three redundant places so a future text-extractor can find it deterministically:

1. **PDF Info dictionary** — `title` (entry name), `subject` (= `evidence_id`), `keywords` (a fixed `key=value;` string from `src/lib/pdf/metadata.ts`: `evidence_id=…; framework=…; control=…; period=…; type=…; completed_by=…; completed_at=…[; accepted=…]`), `producer` / `creator` set to `SigComply Evidence SPA`.
2. **Visible header block** — title, control + framework + severity subtitle, then a metadata table: Evidence ID, Period, Frequency, Completed by, Completed at.
3. **Body** — type-specific:
   - **Declaration** — declaration text in a bordered block, "Accepted: YES/NO" line, signature line with `completed_by` + ISO `completed_at`.
   - **Checklist** — each catalog item with a drawn checkbox (`X` for checked, blank for not), item text, optional notes line, required-marker asterisk. Same signature line.

The CLI does not parse PDF contents in v1 — it only checks presence and hashes the bytes. The metadata redundancy is for the auditor (visible) and for future text-extraction policies (PDF Info dict and the `keywords` string).

---

## Contracts with Sibling Repos

These are the only cross-repo contracts. Break them at your peril.

| What | Shape | Producer | Consumer |
|------|-------|----------|----------|
| Catalog JSON | `Catalog` in `src/types/catalog.ts` ↔ `Catalog` in CLI `internal/core/manual/catalog.go` | CLI `evidence catalog` subcommand | this SPA |
| Evidence types | `declaration` \| `checklist` \| `document_upload` | CLI catalog | this SPA filters dashboard to declaration + checklist |
| Frequency values | `daily` \| `weekly` \| `monthly` \| `quarterly` \| `yearly` | CLI catalog | both, drives `currentPeriod()` |
| PDF filename | `evidence.pdf` (strict lowercase, fixed; `EVIDENCE_PDF_FILENAME`) ↔ CLI `EvidencePDFFilename` in `internal/core/manual/manual.go` | this SPA | CLI `internal/data_sources/manual/reader.go` |
| Path template | `{framework}/{evidence_id}/{period}/{filename}` (CLI default in `internal/core/manual/path.go`). The SPA additionally prepends `config.storage.prefix` when displaying the upload path; the CLI doesn't know about that prefix — it's resolved per-framework by the storage backend (`manual_evidence.frameworks.<framework>` config). | this SPA (display) / CLI (lookup) | mutual |
| Period key format | `2026`, `2026-Q1`, `2026-03`, `2026-W14`, `2026-04-18` | `src/lib/period.ts` ↔ CLI `internal/core/manual/period.go` | mutual |
| PDF metadata anchors | `keywords` Info field as `key=value; …` (see `metadataKeywords()`) | this SPA | future CLI text-extraction policies (CLI v1 doesn't parse PDF contents) |
| EvidenceEnvelope shape | `src/types/envelope.ts` ↔ CLI `internal/core/attestation/types.go` | CLI signing | this SPA's `/verify` |
| Canonical JSON for signing | sorted keys at every level; HTML-safe escapes (`<` → `<`, `>` → `>`, `&` → `&`, matching Go's default `json.Marshal`); no whitespace | CLI `internal/core/attestation/canonical.go` | `src/lib/verification/canonical.ts` must match byte-for-byte |
| Signature scheme | Ed25519 (RFC 8032), 32-byte raw public key + 64-byte signature, both base64-encoded; `signature.algorithm: "ed25519"` | CLI `internal/core/attestation/ed25519.go` | this SPA's `verifyEnvelopeSignature` (Web Crypto) |

If the `Catalog` shape changes, update the Go types in `sigcomply-cli` in the same PR. The catalog still carries `type`, `items`, `declaration_text`, `accepted_formats` — those drive how this SPA renders the form (or whether it can render at all). The CLI ignores them at evaluation time. If the envelope shape or canonicalization changes on either side, the verify page silently breaks — keep `canonical.ts` and `canonical.go` in lockstep.

---

## Runtime Config (`public/config.json`)

Loaded once at startup. Shape:

```json
{
  "frameworks": ["soc2"],
  "storage": { "show_upload_path": true, "prefix": "manual-evidence" }
}
```

Missing `config.json` → falls back to the default in `src/config/runtime.ts`. Deploys override by replacing `config.json` in the hosting bucket — no rebuild needed.

---

## Commands

```bash
npm run dev              # vite dev server — uses the committed public/data/catalogs/*.json
npm run fetch-catalogs   # regenerate public/data/catalogs/*.json from the local sigcomply CLI
npm run build            # prebuild (fetch-catalogs) + tsc -b + vite build
npm run lint             # eslint
npm run preview          # serve dist/
```

`fetch-catalogs` requires `sigcomply` on PATH. If unavailable, the committed `public/data/catalogs/*.json` files are sufficient for both `dev` and `preview`.

Base path: `VITE_BASE_PATH` env var (defaults to `/`). Set when deploying to a subpath.

---

## Conventions

- **Add a UI primitive** → `npx shadcn add <name>` (writes to `src/components/ui/`). Do not hand-author.
- **Add a new evidence template** → add a `<Foo>Pdf.tsx` component under `src/lib/pdf/`, wire it in `renderEvidencePdf`'s switch on catalog `type`. Declaration and checklist already share `useEvidenceForm`; new template variants would extend that hook similarly.
- **Need a new evidence-input flow that isn't a user attestation?** → first ask whether the evidence already exists as a file (PDF/screenshot). If yes, the customer should upload it directly to the bucket — do NOT add a new form type to this SPA. The SPA is intentionally scoped to user attestations (declarations + checklists) only.
- **Add a new framework** → list it in `public/config.json` `frameworks` and in `scripts/fetch-catalogs.ts`. Catalog JSON is sourced from the CLI, not hand-written.
- **localStorage keys** — namespaced `sigcomply:*` (e.g. `sigcomply:framework`, `sigcomply:completed-by`). Keep that prefix.
- **Imports** — use `@/…` not relative `../../`.
- **No data fetching libraries** — plain `fetch` + `useEffect` is enough here; don't introduce React Query / SWR for two endpoints.
- **Lazy-load `@react-pdf/renderer`** — it's the heaviest dependency (~400 KB gz). Always import the renderer dynamically inside the submit handler (see `useEvidenceForm.submit`), not at module top, so neither the dashboard nor the `/verify` route pay for it. Vite splits it into its own chunk automatically.
- **Verifier crypto stays in Web Crypto** — don't pull in `noble-ed25519`, `tweetnacl`, or any JS Ed25519 implementation. The verifier must use `crypto.subtle` so the canonicalization + signature path is browser-native (and minimal in code surface). Browser support gating belongs in `verify.ts`, not in a polyfill.

---

## Gotchas

- `useCatalog` resets `catalog` to `null` in its effect cleanup. Components must handle the loading state even on framework switch — don't assume catalog persists.
- `currentPeriod()` uses local time, not UTC. Period boundaries are the browser's midnight. This matches CLI behaviour as long as the CI runner's timezone matches the user's — revisit if we hit drift.
- Catalog fetch is cached in `catalogCache` Map (module-level). Hard refresh clears it.
- `prebuild` will fail the whole build if `sigcomply` is not on PATH. For CI, install the CLI before `npm run build`, or rely on the pre-committed `public/data/catalogs/*.json` and skip the prebuild.
- The shadcn `ui/` folder is generated — don't refactor it, and don't lint-fix it by hand.
- `@react-pdf/renderer` bundles `pdfkit` + `fontkit` and is large. Always lazy-load.
- `crypto.subtle.importKey("Ed25519")` is the browser-support choke point for `/verify`. Older Chrome/Safari/Firefox throw `NotSupportedError`. `WebCryptoUnsupportedError` in `verify.ts` surfaces this; the page renders a graceful "upgrade your browser" message rather than a crash.
- The verifier's `canonical.ts` mirrors Go's default `json.Marshal` HTML-escaping (`<` → `<`, `>` → `>`, `&` → `&`). If the CLI ever switches to `json.Encoder` with `SetEscapeHTML(false)`, signature verification will silently break for any payload containing `<`, `>`, or `&`. Keep the two implementations in sync.
