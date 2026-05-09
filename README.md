# sigcomply-evidence-spa

Static React SPA that helps users produce **manual compliance evidence PDFs** — the human-input half of [SigComply](https://github.com/SigComply). For catalog entries that are user attestations (single-statement `declaration` or multi-step `checklist`), the SPA renders a form, generates an `evidence.pdf` via `@react-pdf/renderer`, and the user uploads it to their own storage bucket. The SigComply CLI picks it up on the next run.

The SPA is a *utility*, not the only path. Manual evidence sourced externally (HR exports, training certificates, scanned documents — catalog `type: document_upload`) is produced by the user themselves and uploaded directly to the same path; the SPA does not render forms for those.

There is no backend. Nothing is sent to a server. The browser only reads a pre-built catalog and triggers a file download.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

`npm run dev` uses the catalog JSONs committed under `src/data/catalogs/`. To regenerate them from a local `sigcomply` CLI:

```bash
npm run fetch-catalogs
```

## Build

```bash
npm run build     # prebuild (fetch-catalogs) + tsc -b + vite build
npm run preview   # serve dist/
```

The prebuild step calls `sigcomply evidence catalog --framework <fw>`, so the CLI must be on `PATH` when building from scratch. CI should either install the CLI first or commit the catalog JSONs and skip the prebuild.

Set `VITE_BASE_PATH` if deploying to a subpath.

## Runtime config

Edit `public/config.json` to change the frameworks shown or the storage prefix:

```json
{
  "frameworks": ["soc2"],
  "storage": { "show_upload_path": true, "prefix": "manual-evidence" }
}
```

Deploys can override `config.json` in the hosting bucket without rebuilding.

## How it fits

```
User attestation (declaration / checklist)
  └─ fills form ──▶ SPA renders evidence.pdf via @react-pdf/renderer
                          │
                          ▼
                Customer's S3 / GCS / local at:
                {prefix}/{framework}/{evidence_id}/{period}/evidence.pdf
                          ▲
                          │  (or: customer uploads own PDF directly for
                          │   externally-sourced evidence — type: document_upload)
                          │
                          ▼
                  sigcomply CLI (CI/CD)
                  reads, hashes, mirrors, evaluates,
                  attests, submits results
```

See `CLAUDE.md` in this repo for development conventions and the cross-repo contracts.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui · React Router v7 · `@react-pdf/renderer`
