# SigComply Evidence SPA — Claude Context

Static React SPA that helps users produce **manual-evidence PDFs** for catalog entries that are user attestations. The user fills in a declaration or a checklist form, the SPA renders a PDF in the browser via `@react-pdf/renderer`, and the user downloads `evidence.pdf` and uploads it to their storage bucket. The CLI picks it up on the next run.

This app has **no backend** — it only reads a pre-built catalog JSON and writes PDF files to the user's disk via browser download.

**Scope** — the SPA is a *utility* for user-attestation entries: anything where the user's contribution is a sign-off (single statement → catalog `type: declaration`) or a multi-step sign-off (catalog `type: checklist`). A checklist is conceptually a multi-point declaration; both flow through the same form pipeline and produce the same shape of PDF. For evidence sourced externally (HR exports, training certificates, scanned documents, anything with `type: document_upload`) the user produces the PDF themselves; the SPA does not render a form — those entries are filtered out of the dashboard.

Parent context: [../CLAUDE.md](../CLAUDE.md) — product overview and cross-repo contracts.

---

## Stack

- React 19 + TypeScript, Vite 8
- React Router v7 (BrowserRouter)
- Tailwind v4 + shadcn/ui (Base UI primitives, `base-nova` style)
- `@react-pdf/renderer` for PDF generation (lazy-loaded behind `/evidence/*` route — ~480 KB gz, kept out of the dashboard bundle)
- `date-fns` for ISO week math
- `lucide-react` for icons
- Path alias: `@/*` → `src/*`

---

## Directory Map

```
public/
  config.json              ← runtime config (frameworks list, storage prefix)
  data/catalogs/           ← pre-built catalog JSONs (committed, regenerated at build)
scripts/
  fetch-catalogs.ts        ← prebuild: shells out to `sigcomply evidence catalog`
src/
  main.tsx                 ← loads config.json, mounts <App>
  App.tsx                  ← routes: "/", "/evidence/:framework/:evidenceId"
  config/runtime.ts        ← loadConfig() / getConfig() singleton
  data/index.ts            ← fetchCatalog(framework) — reads /data/catalogs/{fw}.json
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
  pages/
    Dashboard.tsx          ← attestation list (declaration + checklist), filters, framework picker
    EvidenceForm.tsx       ← per-entry form + download-success screen
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
    config.ts              ← RuntimeConfig
```

---

## How Data Flows

1. **Build time** — `prebuild` runs `scripts/fetch-catalogs.ts`, which shells out to `sigcomply evidence catalog --framework <fw>` and writes `src/data/catalogs/{fw}.json`. Vite then emits these into `dist/data/catalogs/`. There is no schema fetch — the SPA does not consume a JSON Schema for evidence anymore.
2. **App start** — `main.tsx` calls `loadConfig()` which fetches `/config.json` (frameworks available, storage prefix). Cached on module.
3. **Dashboard** — reads `getConfig().frameworks`, picks one (from localStorage or picker dialog), calls `useCatalog(framework)` which `fetch`es `/data/catalogs/{fw}.json`, then **filters the catalog to the SPA-renderable types** (`declaration` and `checklist`). `document_upload` entries are hidden — the customer produces those PDFs externally.
4. **Evidence form** — for `declaration` and `checklist` entries, `useEvidenceForm` manages form state, validates on submit, lazy-imports `@/lib/pdf/render`, calls `renderEvidencePdf(input)` to produce a `Blob`, calls `downloadBlob(blob, "evidence.pdf")`, then shows the upload-path instructions screen. For any other type, `EvidenceForm` shows a "uploaded directly to your bucket" message instead of rendering a form.

Flow is one-way: catalog → form → downloaded PDF. **Nothing is ever uploaded from the browser.** The user moves the file to their own bucket manually (or via any tool they like).

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
| Catalog JSON | `Catalog` in `src/types/catalog.ts` | `sigcomply-cli` (`evidence catalog`) | this SPA |
| PDF filename | `evidence.pdf` (strict lowercase, fixed; see `EVIDENCE_PDF_FILENAME`) | this SPA | CLI `internal/data_sources/manual/reader.go` |
| Storage path | `{prefix}/{framework}/{evidenceId}/{period}/evidence.pdf` | `src/lib/storage-path.ts` | CLI `internal/data_sources/manual/reader.go` |
| Period key format | `2026`, `2026-Q1`, `2026-03`, `2026-W14`, `2026-04-18` | `src/lib/period.ts` | CLI `internal/core/manual/period.go` |
| PDF metadata anchors | `keywords` Info field as `key=value; …` (see `metadataKeywords()`) | this SPA | future CLI text-extraction policies |

If the catalog `Catalog` shape changes, update the Go types in `sigcomply-cli` in the same PR. The catalog still carries `type`, `items`, `declaration_text`, `accepted_formats` — those drive how this SPA renders the form (or whether it can render at all). The CLI ignores them at evaluation time.

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
npm run dev              # vite dev server (no prebuild — uses committed catalogs)
npm run fetch-catalogs   # regenerate src/data/catalogs/*.json from local sigcomply CLI
npm run build            # prebuild (fetch-catalogs) + tsc -b + vite build
npm run lint             # eslint
npm run preview          # serve dist/
```

`fetch-catalogs` requires `sigcomply` on PATH. If unavailable, use the pre-committed JSONs in `src/data/catalogs/`.

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
- **Lazy-load `@react-pdf/renderer`** — it's the heaviest dependency (~480 KB gz). Always import the renderer dynamically inside the submit handler (see `useEvidenceForm.submit`), not at module top, so the dashboard route stays light. Vite splits it into its own chunk automatically.

---

## Gotchas

- `useCatalog` resets `catalog` to `null` in its effect cleanup. Components must handle the loading state even on framework switch — don't assume catalog persists.
- `currentPeriod()` uses local time, not UTC. Period boundaries are the browser's midnight. This matches CLI behaviour as long as the CI runner's timezone matches the user's — revisit if we hit drift.
- Catalog fetch is cached in `catalogCache` Map (module-level). Hard refresh clears it.
- `prebuild` will fail the whole build if `sigcomply` is not on PATH. For CI, install the CLI before `npm run build`, or pre-commit the catalog JSONs and skip the prebuild.
- The shadcn `ui/` folder is generated — don't refactor it, and don't lint-fix it by hand.
- `@react-pdf/renderer` bundles `pdfkit` + `fontkit` and is large. Always lazy-load.
