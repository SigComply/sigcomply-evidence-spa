# SigComply Evidence SPA — Claude Context

Static React SPA that renders manual-evidence forms. Users fill in a checklist / declaration / document-upload form, download an `evidence.json`, and upload it (plus any supporting files) to their own storage bucket. The CLI picks it up on the next run.

This app has **no backend** — it only reads a pre-built catalog JSON and writes JSON files to the user's disk via browser download.

Parent context: [../CLAUDE.md](../CLAUDE.md) — product overview and cross-repo contracts.

---

## Stack

- React 19 + TypeScript, Vite 8
- React Router v7 (BrowserRouter)
- Tailwind v4 + shadcn/ui (Base UI primitives, `base-nova` style)
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
    useEvidenceForm.ts     ← form state + validation + JSON download
  lib/
    period.ts              ← currentPeriod(frequency) → { key, start, end }
    storage-path.ts        ← computeUploadPath(prefix, fw, id, period)
    download.ts            ← downloadJson(data, filename)
    utils.ts               ← cn() (clsx + tailwind-merge)
  pages/
    Dashboard.tsx          ← catalog list, filters, framework picker
    EvidenceForm.tsx       ← per-entry form + download-success screen
    NotFound.tsx
  components/
    layout/                ← AppLayout, Header
    dashboard/             ← EvidenceList, FrameworkSelector, FrameworkPickerDialog, StatusBadge
    forms/                 ← DocumentUploadForm, ChecklistForm, DeclarationForm
    common/LoadingSpinner.tsx
    ui/                    ← shadcn primitives — do NOT hand-edit; regenerate via `npx shadcn add <name>`
  types/
    catalog.ts             ← CatalogEntry, ChecklistItem, EvidenceType, Frequency
    submitted.ts           ← SubmittedEvidence (the JSON we download)
    config.ts              ← RuntimeConfig
```

---

## How Data Flows

1. **Build time** — `prebuild` runs `scripts/fetch-catalogs.ts`, which shells out to `sigcomply evidence catalog --framework <fw>` and writes `src/data/catalogs/{fw}.json`. Also fetches `schema.json` via `sigcomply evidence schema`. Vite then emits these into `dist/data/catalogs/`.
2. **App start** — `main.tsx` calls `loadConfig()` which fetches `/config.json` (frameworks available, storage prefix). Cached on module.
3. **Dashboard** — reads `getConfig().frameworks`, picks one (from localStorage or picker dialog), calls `useCatalog(framework)` which `fetch`es `/data/catalogs/{fw}.json`.
4. **Evidence form** — `useEvidenceForm` manages form state, validates on submit, calls `downloadJson()` to trigger a browser download of `evidence.json`, then shows the upload-path instructions screen.

Flow is one-way: catalog → form → downloaded JSON. **Nothing is ever uploaded from the browser.** The user moves the file to their own bucket manually (or via any tool they like).

---

## Contracts with Sibling Repos

These are the only cross-repo contracts. Break them at your peril.

| What | Shape | Producer | Consumer |
|------|-------|----------|----------|
| Catalog JSON | `Catalog` in `src/types/catalog.ts` | `sigcomply-cli` (`evidence catalog`) | this SPA |
| Submitted evidence JSON | `SubmittedEvidence` in `src/types/submitted.ts` | this SPA | `sigcomply-cli` reader |
| Storage path | `{prefix}/{framework}/{evidenceId}/{period}/evidence.json` | `src/lib/storage-path.ts` | CLI `internal/data_sources/manual/reader.go` |
| Period key format | `2026`, `2026-Q1`, `2026-03`, `2026-W14`, `2026-04-18` | `src/lib/period.ts` | CLI period package |

If `CatalogEntry` or `SubmittedEvidence` changes, update the Go types in `sigcomply-cli` in the same PR.

The ground-truth design doc is `../PLAN-manual-evidence.md` — Phase 1 (catalog types) and Phase 9 (SPA) are the sections that apply here.

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
- **Add a new form type** → add component under `src/components/forms/`, wire it in `pages/EvidenceForm.tsx`'s type switch, extend `useEvidenceForm` state + validate + submit branches, update `SubmittedEvidence` type if the output shape changes.
- **Add a new framework** → list it in `public/config.json` `frameworks` and in `scripts/fetch-catalogs.ts`. Catalog JSON is sourced from the CLI, not hand-written.
- **localStorage keys** — namespaced `sigcomply:*` (e.g. `sigcomply:framework`, `sigcomply:completed-by`). Keep that prefix.
- **Imports** — use `@/…` not relative `../../`.
- **No data fetching libraries** — plain `fetch` + `useEffect` is enough here; don't introduce React Query / SWR for two endpoints.

---

## Gotchas

- `useCatalog` resets `catalog` to `null` in its effect cleanup. Components must handle the loading state even on framework switch — don't assume catalog persists.
- `currentPeriod()` uses local time, not UTC. Period boundaries are the browser's midnight. This matches CLI behaviour as long as the CI runner's timezone matches the user's — revisit if we hit drift.
- Catalog fetch is cached in `catalogCache` Map (module-level). Hard refresh clears it.
- `prebuild` will fail the whole build if `sigcomply` is not on PATH. For CI, install the CLI before `npm run build`, or pre-commit the catalog JSONs and skip the prebuild.
- The shadcn `ui/` folder is generated — don't refactor it, and don't lint-fix it by hand.
