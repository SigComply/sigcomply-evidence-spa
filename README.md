# sigcomply-evidence-spa

Static React SPA for collecting **manual compliance evidence** — the human-input half of [SigComply](https://github.com/SigComply). Renders forms for checklists, declarations, and document uploads; produces an `evidence.json` the user uploads to their own storage bucket, where the SigComply CLI picks it up on the next run.

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
User ── fills form ──▶ SPA ── downloads evidence.json ──▶ Customer's S3/GCS/local
                                                                  │
                                                                  ▼
                                                         sigcomply CLI (CI/CD)
                                                         reads, hashes, evaluates,
                                                         attests, submits results
```

See the design doc at `../PLAN-manual-evidence.md` for the full pipeline and `CLAUDE.md` in this repo for development conventions.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui · React Router v7
