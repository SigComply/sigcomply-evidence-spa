# sigcomply-evidence-spa

Static React SPA that ships two unrelated, fully client-side features for [SigComply](https://github.com/SigComply):

1. **Evidence form → PDF** — for catalog entries that are user attestations (single-statement `declaration` or multi-step `checklist`), the SPA renders a form, generates an `evidence.pdf` via `@react-pdf/renderer`, and the user uploads it to their own storage bucket. The SigComply CLI picks it up on the next run.
2. **Public envelope verifier** at `/verify` — drop in a CLI-signed `EvidenceEnvelope` JSON (and optionally the matching PDF) to verify the Ed25519 signature and re-hash the file via Web Crypto. Auditor-facing; no auth, no network calls.

The form generator is a *utility*, not the only upload path. Manual evidence sourced externally (HR exports, training certificates, scanned documents — catalog `type: document_upload`) is produced by the user themselves and uploaded directly to the same path; the SPA does not render forms for those.

There is no backend. Nothing is sent to a server. The browser only reads a pre-built catalog, triggers a file download, and verifies envelopes locally.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

`npm run dev` uses the catalog JSONs committed under `public/data/catalogs/` (served as static assets by Vite). To regenerate them from a local `sigcomply` CLI:

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

The user fills a form here → SPA renders `evidence.pdf` → user uploads to `{prefix}/{framework}/{evidence_id}/{period}/evidence.pdf` in their own bucket → the [SigComply CLI](https://github.com/SigComply/sigcomply-cli) picks it up on the next run, hashes it, evaluates the policy, and submits aggregated results to the Compliance Dashboard.

See [`CLAUDE.md`](CLAUDE.md) for development conventions, cross-repo contracts, and the wider product architecture.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui · React Router v7 · `@react-pdf/renderer`
