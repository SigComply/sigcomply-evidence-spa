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

## Documentation Map

This file is the lean, always-loaded index. It carries the **context** ("what the system is") and
points to focused **guideline** docs ("how we work") that load just-in-time. Read the guideline doc
for your task before starting.

| Doc | Family | Read it when |
|-----|--------|-------------|
| **CLAUDE.md** (this file) | Context — role, stack, directory map, data flows, PDF layout, cross-repo contracts, conventions, gotchas | Always loaded; the baseline |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Guideline — the agent-driven loop (plan → test → implement → verify → docs → ship), the local verification gate, browser verification, the GitHub Pages deploy model | Before **any** feature or fix |
| [docs/TESTING.md](docs/TESTING.md) | Guideline — Vitest layout, the current coverage gap, the crypto contract tests, Web-Crypto/PDF specifics | Before adding or changing tests |

Full product architecture (engine, dashboard, two evidence flows, privacy invariants) lives in the
[parent CLAUDE.md](../CLAUDE.md).

---

## Development Rules

This SDLC is run almost entirely by **Claude Code agents** in the cmux terminal — planning, code,
tests, browser verification, debugging. The human directs, monitors, verifies. The full step-by-step
loop is [docs/WORKFLOW.md](docs/WORKFLOW.md); the summary:

- **Ship working code.** Tested code is the measure of progress.
- **TDD.** Colocated `*.test.ts` first → minimum code to pass → **local gate green** → browser-verify
  UI changes → **update the docs your change touched** → commit. See [TESTING.md](docs/TESTING.md).
- **Local is the gate — CI does not lint/test/typecheck.** Before every push run **all four** clean:
  `npm run lint`, `npm run test`, `npx tsc -b`, `npm run build`. `deploy.yml` only runs `vite build`
  (+ `npm audit`); it never runs the suite, ESLint, or the typechecker.
- **Docs are part of "done".** Every change updates the focused doc it affects (this file, WORKFLOW,
  or TESTING) in the **same commit** — not "only when architecture moves".
- **Architecture-first.** If a change feels overly complex, **stop and ask** — difficulty is a signal
  to pause, not push through. Respect the scope guardrails in [Conventions](#conventions).
- **Pre-launch: commit directly to `main`.** No users yet. Push to `main` → GitHub Pages
  auto-deploys; no PRs, no reviews for internal work (flips to a PR + review flow at public launch).
  No backfills / backward-compat burden — **except** the CLI cross-repo contracts
  ([Contracts with Sibling Repos](#contracts-with-sibling-repos)) stay in lockstep.
- **Small atomic commits.** One logical change. Format `<type>: <description>`
  (`feat`/`fix`/`refactor`/`test`/`docs`/`chore`) with a
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer.
- **Never break `main`.** Direct-to-main means a red Pages build is live-affecting — confirm CI green
  after pushing (`gh run watch`) and fix forward.

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
- `@react-pdf/renderer` for PDF generation (the heaviest dependency in the bundle, lazy-imported inside the form-submit handler so the dashboard and `/verify` chunks stay light)
- Web Crypto API (`crypto.subtle`) for Ed25519 envelope verification — no JS crypto library
- `date-fns` for ISO week math
- `lucide-react` for icons
- Geist variable font (`@fontsource-variable/geist`)
- Path alias: `@/*` → `src/*`

---

## Directory Map

```
public/
  config.json              ← runtime config (frameworks list, storage prefix)
  data/catalogs/{fw}.json  ← pre-built catalog JSONs, committed to git; served as static assets (currently soc2.json)
scripts/
  fetch-catalogs.ts        ← shells out to `sigcomply evidence catalog`, filters to declaration+checklist, writes public/data/catalogs/{fw}.json. Reads the framework list from `public/config.json` (`frameworksFromConfig()`) — that file is the single source of truth, so the prefetched catalogs can't drift from what the UI exposes. Adding a framework means editing only `public/config.json`.
src/
  main.tsx                 ← loads config.json, mounts <App>
  App.tsx                  ← routes: "/", "/evidence/:framework/:evidenceId", "/verify"
  config/runtime.ts        ← loadConfig() / getConfig() singleton
  data/index.ts            ← fetchCatalog(framework) — fetch()es /data/catalogs/{fw}.json from public/
  hooks/
    useCatalog.ts          ← fetches catalog, returns { catalog, loading, error }
    useEvidenceForm.ts     ← form state + validation + lazy PDF render + download
  lib/
    period.ts              ← currentPeriod(frequency) → { key, start, end } + formatPeriodRange()
    storage-path.ts        ← computeUploadPath() + EVIDENCE_PDF_FILENAME ("evidence.pdf")
    download.ts            ← downloadBlob(blob, filename)
    clipboard.ts           ← copyText() — copy upload path to clipboard (async API + legacy fallback)
    device-memory.ts       ← local-only, NON-authoritative per-browser breadcrumb (markGenerated / setUploadedAck), keyed framework|evidence_id|period. Never compliance status.
    severity.ts            ← severity + TSC → Tailwind badge / accent-rail color classes
    utils.ts               ← cn() (clsx + tailwind-merge)
    pdf/
      render.tsx           ← renderEvidencePdf(input) → Promise<Blob> (lazy-loaded entry point)
      DeclarationPdf.tsx   ← <Document> for declaration entries
      ChecklistPdf.tsx     ← <Document> for checklist entries
      shared.tsx           ← <Header> (title + subtitle + metadata table) and <Footer>
      metadata.ts          ← metadataKeywords() — fixed "key=value; …" PDF Info string
      styles.ts            ← StyleSheet.create({...})
    verification/
      verify.ts            ← verifyEnvelopeSignature() + sha256Hex() (Web Crypto Ed25519)
      canonical.ts         ← canonicalJSON() — sorted keys, no whitespace, control/LS/PS \u-escapes, HTML chars verbatim; matches CLI byte-for-byte
      {canonical,verify}.test.ts + __fixtures__/  ← crypto contract tests + sample envelopes
  pages/
    Dashboard.tsx          ← attestation list (declaration + checklist), filters, framework picker
    EvidenceForm.tsx       ← per-entry form + download-success screen
    Verify.tsx             ← public auditor-facing envelope verifier (drag-drop JSON + optional PDF)
    NotFound.tsx
  components/
    layout/                ← AppLayout, Header
    dashboard/             ← EvidenceList, FrameworkSelector, FrameworkPickerDialog, StatusBadge, PeriodOverview
    forms/                 ← DeclarationForm, ChecklistForm
    common/ErrorBoundary.tsx  ← top-level render-error fallback (mounted in main.tsx)
    ui/                    ← shadcn primitives — do NOT hand-edit; regenerate via `npx shadcn add <name>`
  types/
    catalog.ts             ← Catalog, CatalogEntry, ChecklistItem, EvidenceType, Frequency, TemporalRule
    pdf-input.ts           ← PdfInput (input shape for renderEvidencePdf)
    envelope.ts            ← EvidenceEnvelope, EvidenceRecord, EnvelopeSignature, ManualDocumentPayload + isEvidenceEnvelope()/getManualDocumentPayload() guards (mirrors CLI internal/core/envelope.go)
    config.ts              ← RuntimeConfig, StorageConfig
```

---

## How Data Flows

### Form → PDF flow

1. **Catalog source-of-truth** — catalog JSONs are committed at `public/data/catalogs/{fw}.json` and served as static assets. To regenerate them, run `npm run fetch-catalogs` (which shells out to `sigcomply evidence catalog --framework <fw> -o json` once per framework listed in `public/config.json`). The CLI's `evidence` command group takes a persistent `-f`/`--framework` flag; when the flag is omitted it falls back to `$SIGCOMPLY_FRAMEWORK` then `soc2`, but `fetch-catalogs` always passes `--framework` explicitly. `fetch-catalogs` filters the CLI output down to the SPA-renderable types (`declaration` + `checklist`) before writing — `document_upload` entries are dropped at build time and never reach the browser. The committed JSONs therefore contain only renderable entries. There is no schema fetch — the SPA does not consume a JSON Schema for evidence anymore.
2. **App start** — `main.tsx` calls `loadConfig()` which fetches `config.json` relative to `import.meta.env.BASE_URL` (so it resolves under a sub-path deploy, not just at the domain root) for the frameworks available + storage prefix. The result is normalized field-by-field against a built-in default, so a missing/unreachable/malformed `config.json` falls back rather than crashing. Cached on module. A top-level `ErrorBoundary` (see `src/components/common/ErrorBoundary.tsx`) catches any render-time error so a hiccup shows a recoverable message, never a blank page.
3. **Dashboard** — reads `getConfig().frameworks` and defaults to the stored framework (`sigcomply:framework`) or `frameworks[0]`. `FrameworkPickerDialog` only auto-opens when there is a genuine choice (`frameworks.length > 1` *and* nothing stored) and is dismissible (Esc / backdrop / close keeps the current default and persists it). With today's single-framework config it never appears. The framework prompt is **attestation-only by design and must never gate `/verify`**, which is framework-agnostic and reachable from the same header. Then it calls `useCatalog(framework)` which `fetch`es `/data/catalogs/{fw}.json`. The fetched catalog already contains only `declaration` + `checklist` entries (filtered at build time by `fetch-catalogs`). `useCatalog` re-applies the same type filter as a defensive backstop — it's a no-op against correctly-built catalogs, but keeps the dashboard correct if a hand-edited or stale catalog ever carries `document_upload` entries.
4. **Evidence form** — for `declaration` and `checklist` entries, `useEvidenceForm` manages form state, validates on submit, lazy-imports `@/lib/pdf/render`, calls `renderEvidencePdf(input)` to produce a `Blob`, calls `downloadBlob(blob, "evidence.pdf")`, then shows the upload-path instructions screen. For any other type, `EvidenceForm` shows a "uploaded directly to your bucket" message instead of rendering a form.

Flow is one-way: catalog → form → downloaded PDF. **Nothing is ever uploaded from the browser.** The user moves the file to their own bucket manually (or via any tool they like).

### Verify flow (`/verify`)

Independent of the form generator. The user (typically an auditor) supplies an `EvidenceEnvelope` JSON file and optionally the matching `evidence.pdf`:

1. `Verify.tsx` parses the JSON, calls `isEvidenceEnvelope()` to type-guard it (expects `format_version: "envelope.v1"`), then `verifyEnvelopeSignature()` from `lib/verification/verify.ts`.
2. The signed bytes are `canonicalJSON({ format_version, produced_at, records })` — the envelope's three content fields, no signature sentinel. Canonical-JSON rules per RFC 8785: sorted keys at every nesting, `\u` escapes only for control characters, no whitespace. Must match the CLI's canonicalization in `internal/sign` byte-for-byte. The envelope on disk is a flat object (`format_version`, `produced_at`, `records`, `signature`); there is no `signed` wrapper, and there are no `context` or `attachments` fields — context that earlier drafts carried inside the envelope lives in the file path, and attachments are referenced by individual records' payloads (the CLI's manual source emits a record of `type: "signed_document"` whose payload carries the merged-PDF hash).
3. `crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, …)` then `crypto.subtle.verify` validates the 64-byte signature against those bytes. Browser support is determined at runtime via feature detection — the verifier checks for `crypto.subtle.verify` with the `Ed25519` algorithm and surfaces `WebCryptoUnsupportedError` if unavailable. Concrete browser-version floors shift as Web Crypto's Ed25519 support rolls out.
4. For manual-flow envelopes, `getManualDocumentPayload()` returns the first `type: "signed_document"` record's payload — its **presence** (not `file_hash`) is what marks the envelope manual-flow, so an empty-folder period still reads as "manual". The SPA's `ManualDocumentPayload` type mirrors the CLI's `manualManifest` (`period_id`, `file_hash`, `file_present`, `file_size`, `in_temporal_window`, `file_valid`, `expected_uri`, `source_files`, …; all optional to tolerate `omitempty`). The verifier consumes only `file_hash` (re-hashes a dropped PDF via SHA-256 and compares — after a light "looks like a PDF" guard so a wrong file reads as "wrong file", not "tampered") and surfaces `expected_uri`. v1 scope: per-envelope verification only — whole-run integrity (verifying the per-run signed `manifest.json` Merkle root over all sibling files) is future work. Note the verdict copy is deliberately integrity-scoped ("records match the public key in this file; confirm that key to prove who signed it") — the public key ships inside the envelope, so a valid signature proves the records weren't altered relative to that key, not provenance.

UX contract (verdict-first — don't regress): the page is a single column, not a numbered card wizard. Signature verification runs **automatically** the instant a valid envelope is parsed — there is no "Verify" button; the `"verifying"` transition is set in `handleParse` (not the effect) so it stays out of the effect body. On a valid envelope the input collapses to a one-line source bar (`Verify another` resets) and a large pass/fail/error `VerdictBanner` takes over, with envelope details and canonical bytes behind `<details>`. Pasting or loading a file pretty-prints the JSON (`handleParse(..., { reformat: true })`); typing does not (would jump the caret). Reformatting is cosmetic only — signed bytes are always re-derived via `canonicalJSON({format_version, produced_at, records})`, independent of pasted whitespace. Parse errors carry a line/column locus (`describeJsonError`).

No network calls. No PII leaves the browser.

---

## PDF Layout & Metadata

Every generated PDF carries the same metadata in three redundant places so a future text-extractor can find it deterministically:

1. **PDF Info dictionary** — `title` (entry name), `subject` (= `evidence_id`), `author` (= `completed_by`, falling back to `SigComply Evidence SPA`), `keywords` (a fixed `; `-joined string from `src/lib/pdf/metadata.ts`: `evidence_id=…; framework=…; control=…; period=…; type=…; completed_by=…; completed_at=…[; accepted=…]`), `producer` / `creator` set to `SigComply Evidence SPA`.
2. **Visible header block** — title, then a `FRAMEWORK · control · severity` subtitle, then a metadata table: Evidence ID, Period, Frequency, Completed by, Completed at. (A fixed footer repeats `evidence_id — period` + page number.)
3. **Body** — type-specific:
   - **Declaration** — declaration text in a bordered block, "Accepted: YES/NO" line, signature line with `completed_by` + ISO `completed_at`.
   - **Checklist** — each catalog item with a drawn checkbox (`X` for checked, blank for not), item text, optional notes line, required-marker asterisk. Same signature line.

The CLI does not parse PDF contents in v1 — it only checks presence and hashes the bytes. The metadata redundancy is for the auditor (visible) and for future text-extraction policies (PDF Info dict and the `keywords` string).

---

## Contracts with Sibling Repos

These are the only cross-repo contracts. Break them at your peril.

| What | Shape | Producer | Consumer |
|------|-------|----------|----------|
| Catalog JSON | `Catalog` in `src/types/catalog.ts` ↔ `Catalog` in CLI `internal/manualcatalog/catalog.go` | CLI `evidence catalog` subcommand | this SPA |
| Evidence types | `declaration` \| `checklist` \| `document_upload` (field `type`) | CLI catalog | `fetch-catalogs` drops `document_upload` at build time; SPA only ever sees declaration + checklist |
| Frequency values | `daily` \| `weekly` \| `monthly` \| `quarterly` \| `yearly` (field name is `frequency`, NOT `cadence`; the CLI maps its internal `annual` cadence → `yearly` on export) | CLI catalog | both, drives `currentPeriod(frequency)` |
| PDF filename | The SPA names its download `evidence.pdf` (`EVIDENCE_PDF_FILENAME` in `storage-path.ts`) as a **convention only**. This is NOT enforced cross-repo: the CLI is filename-agnostic — its manual reader globs the whole period folder and merges every supported file, regardless of name (the catalog's `Filename` field is dead/compat-only in `internal/sources/manual/manual.go`). | this SPA | CLI ignores the name |
| Path template | The SPA displays `{config.storage.prefix}/{evidence_id}/{period}/evidence.pdf` (`computeUploadPath`), matching the CLI's folder scheme `{prefix}{evidence_id}/{period_id}/` (default `prefix = "manual/"`, **no `framework` segment**) in `internal/sources/manual/manual.go`. The `manual` source is a **project-level singleton** (one bucket per project, not per framework). The trailing `evidence.pdf` is a suggested download name only — the CLI globs the folder and is filename-agnostic. | this SPA (display) / CLI (lookup) | aligned |
| Period key format | `2026`, `2026-Q1`, `2026-03`, `2026-W14`, `2026-04-18` | `src/lib/period.ts` ↔ CLI manual period logic | mutual |
| PDF metadata anchors | `keywords` Info field as `key=value; …` (see `metadataKeywords()`) | this SPA | future CLI text-extraction policies (CLI v1 doesn't parse PDF contents) |
| EvidenceEnvelope shape | `src/types/envelope.ts` ↔ CLI `internal/core/envelope.go` (`format_version`, `produced_at`, `records`, `signature`) | CLI signing | this SPA's `/verify` |
| Canonical JSON for signing | RFC 8785-style: UTF-8, sorted keys at every level, no insignificant whitespace, `\u` escapes only for control characters, shortest round-trippable number form. The signature is over canonical JSON of `{format_version, produced_at, records}` — three fields, no signature sentinel | CLI `internal/sign` | `src/lib/verification/canonical.ts` must match byte-for-byte |
| Signature scheme | Ed25519 (RFC 8032), 32-byte raw public key + 64-byte signature, both base64-encoded; `signature.algorithm: "ed25519"` | CLI `internal/sign` | this SPA's `verifyEnvelopeSignature` (Web Crypto) |

If the `Catalog` shape changes, update the Go types in `sigcomply-cli` in the same PR. The catalog still carries `type`, `items`, `declaration_text`, `accepted_formats` (plus `frequency`, `temporal_rule`, `grace_period`, `severity`, `category`, `tsc`, `optional`) — those drive how this SPA renders the form (or whether it can render at all). The CLI ignores them at evaluation time. If the envelope shape or canonicalization changes on either side, the verify page silently breaks — keep `canonical.ts` and `canonical.go` in lockstep.

**Cross-repo alignment:** the upload-path and `ManualDocumentPayload` drifts noted in earlier drafts were reconciled in commit `430d350` — the SPA now mirrors the CLI's folder scheme (`{prefix}{evidence_id}/{period_id}/`, no `framework` segment) and its `manualManifest` shape (`period_id`/`expected_uri`, no `framework`/`file_path`). The `evidence.pdf` filename remains a deliberate convention (see the PDF-filename row), not a drift.

---

## Runtime Config (`public/config.json`)

Loaded once at startup. Shape:

```json
{
  "frameworks": ["soc2"],
  "storage": { "show_upload_path": true, "prefix": "manual-evidence" }
}
```

Missing, unreachable, or malformed `config.json` → falls back to the default in `src/config/runtime.ts` (also `["soc2"]`), normalized field-by-field so a partial/wrong-shape file can't crash the app. `config.json` is fetched relative to `import.meta.env.BASE_URL`, so a sub-path deploy loads its own config (not the domain root's). Deploys override by replacing `config.json` in the hosting bucket — no rebuild needed.

`public/config.json` is the **single source of truth** for the framework list. `scripts/fetch-catalogs.ts` derives its prefetch list from it (`frameworksFromConfig()`), so the shipped catalogs under `public/data/catalogs/` can't drift from what the UI exposes — today just `soc2.json`. The CLI itself ships both `soc2` and `iso27001` catalogs; to expose `iso27001` here, add it to `public/config.json` and run `npm run fetch-catalogs`.

---

## Commands

```bash
npm run dev              # vite dev server — uses the committed public/data/catalogs/*.json
npm run fetch-catalogs   # regenerate public/data/catalogs/*.json from the local sigcomply CLI
npm run build            # prebuild (fetch-catalogs) + tsc -b + vite build
npm run lint             # eslint . — the only style gate (no Prettier/Biome, no `format` script)
npm run test             # vitest run — the colocated *.test.ts suite
npx tsc -b               # typecheck (strict project refs); there is no `typecheck` npm script
npm run preview          # serve dist/ — closest local approximation to the GitHub Pages deploy
```

**Local verification gate** (CI does not lint/test/typecheck — see [WORKFLOW.md](docs/WORKFLOW.md)):
before every push, `npm run lint`, `npm run test`, `npx tsc -b`, and `npm run build` must all be
clean.

`fetch-catalogs` (and therefore `prebuild`/`npm run build`) requires `sigcomply` on PATH. If
unavailable, the committed `public/data/catalogs/*.json` files are sufficient for `dev`, `preview`,
and a `npx tsc -b && npx vite build` (the prebuild-free path CI's `deploy.yml` uses).

Base path: `VITE_BASE_PATH` env var (defaults to `/`). Set when deploying to a subpath.

---

## Conventions

- **Add a UI primitive** → `npx shadcn add <name>` (writes to `src/components/ui/`). Do not hand-author.
- **Add a new evidence template** → add a `<Foo>Pdf.tsx` component under `src/lib/pdf/`, wire it in `renderEvidencePdf`'s switch on catalog `type`. Declaration and checklist already share `useEvidenceForm`; new template variants would extend that hook similarly.
- **Need a new evidence-input flow that isn't a user attestation?** → first ask whether the evidence already exists as a file (PDF/screenshot). If yes, the customer should upload it directly to the bucket — do NOT add a new form type to this SPA. The SPA is intentionally scoped to user attestations (declarations + checklists) only.
- **Add a new framework** → add it to the `frameworks` array in `public/config.json` (the single source of truth), then run `npm run fetch-catalogs` to prefetch its catalog. `scripts/fetch-catalogs.ts` reads that same list, so there is no second list to keep in sync. Catalog JSON is sourced from the CLI, not hand-written.
- **localStorage keys** — namespaced `sigcomply:*` (e.g. `sigcomply:framework`, `sigcomply:completed-by`). Keep that prefix.
- **Imports** — use `@/…` not relative `../../`.
- **No data fetching libraries** — plain `fetch` + `useEffect` is enough here; don't introduce React Query / SWR for two endpoints.
- **Lazy-load `@react-pdf/renderer`** — it's the heaviest dependency in the bundle. Always import the renderer dynamically inside the submit handler (see `useEvidenceForm.submit`), not at module top, so neither the dashboard nor the `/verify` route pay for it. Vite splits it into its own chunk automatically.
- **Verifier crypto stays in Web Crypto** — don't pull in `noble-ed25519`, `tweetnacl`, or any JS Ed25519 implementation. The verifier must use `crypto.subtle` so the canonicalization + signature path is browser-native (and minimal in code surface). Browser support gating belongs in `verify.ts`, not in a polyfill.
- **Framework picker must stay non-blocking** — never make `FrameworkPickerDialog` a hard modal or a route guard, and never gate `/verify` on a framework. Prompt only when there's a real choice (`frameworks.length > 1` and nothing stored); a single-framework config must reach the dashboard (and Verify) with zero clicks.
- **Verify stays button-free and dep-free** — keep the verdict-first auto-verify (parse → verdict, no "Verify" button). Don't add a JSON editor/viewer library (Monaco/CodeMirror) for the paste box: the input is machine output the auditor doesn't edit, it collapses on a valid parse, and a heavy dep on the `/verify` chunk contradicts the lazy-load discipline above. Prettify/locus stay zero-dep (`JSON.stringify` + `describeJsonError`).

---

## Gotchas

- `useCatalog` resets `catalog` to `null` in its effect cleanup. Components must handle the loading state even on framework switch — don't assume catalog persists.
- `currentPeriod()` uses local time, not UTC. Period boundaries are the browser's midnight. This matches CLI behaviour as long as the CI runner's timezone matches the user's — revisit if we hit drift.
- Catalog fetch is cached in `catalogCache` Map (module-level). Hard refresh clears it.
- `prebuild` will fail the whole build if `sigcomply` is not on PATH. For CI, install the CLI before `npm run build`, or rely on the pre-committed `public/data/catalogs/*.json` and skip the prebuild.
- `scripts/fetch-catalogs.ts` derives its prefetch list from `public/config.json` (`frameworksFromConfig()`), so the frameworks the app *shows* and the catalogs it *prefetches* can't diverge. `public/config.json` is the single source of truth — see Runtime Config.
- `computeUploadPath` (`storage-path.ts`) matches the CLI folder scheme `{prefix}{evidence_id}/{period_id}/` (no `framework` segment, `prefix` default `manual/`). The trailing `evidence.pdf` filename is a suggested download name only — the CLI globs the folder and is filename-agnostic. See the Path template / PDF filename rows in Contracts.
- The shadcn `ui/` folder is generated — don't refactor it, and don't lint-fix it by hand.
- `@react-pdf/renderer` bundles `pdfkit` + `fontkit` and is large. Always lazy-load.
- `crypto.subtle.importKey("Ed25519")` is the browser-support choke point for `/verify`. Older Chrome/Safari/Firefox throw `NotSupportedError`. `WebCryptoUnsupportedError` in `verify.ts` surfaces this; the page renders a graceful "upgrade your browser" message rather than a crash.
- The verifier's `canonical.ts` mirrors the CLI's RFC 8785-style canonicalization (sorted keys, no whitespace, `\u` escapes for control characters only — NOT Go's `json.Marshal` HTML-escaping). Any drift between `canonical.ts` and `internal/sign` silently breaks signature verification. Keep the two implementations in sync.
- The verifier ships at `envelope.v1`. `src/types/envelope.ts` and `src/lib/verification/{canonical,verify}.ts` mirror the CLI's `internal/core/envelope.go` + `internal/sign/{canonical,envelope}.go` (M5/M6) — three signed fields (`format_version`, `produced_at`, `records`), `signature` block alongside. Future major envelope revisions become `envelope.v2`: the parser checks `format_version` and refuses unknown majors rather than guessing.
