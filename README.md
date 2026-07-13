# sigcomply-evidence-spa

Static React SPA that ships two unrelated, fully client-side features for [SigComply](https://github.com/SigComply):

1. **Evidence form → PDF** — for catalog entries that are user attestations (single-statement `declaration` or multi-step `checklist`), the SPA renders a form, generates an `evidence.pdf` via `@react-pdf/renderer`, and the user uploads it to their own storage bucket. The SigComply CLI picks it up on the next run.
2. **Public envelope verifier** at `/verify` — drop in a CLI-signed `EvidenceEnvelope` JSON (and optionally the matching PDF) to verify the Ed25519 signature and re-hash the file via Web Crypto. Auditor-facing; no auth, no network calls.

The form generator is a *purely optional utility*, not part of the CLI's end-to-end workflow. The SigComply CLI never talks to this SPA. Users can collect every piece of manual evidence — including declarations and checklists — without ever opening this app, by producing the PDF themselves and uploading it directly to the storage path. The SPA simply makes declaration- and checklist-style entries clickable in a browser. Manual evidence sourced externally (HR exports, training certificates, scanned documents, signed NDAs, etc.) is always produced by the user themselves and uploaded directly to the same path; the SPA does not render forms for those.

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

The prebuild step calls `sigcomply evidence catalog --framework <fw> -o json` for each framework listed in `public/config.json` (the single source of truth — `scripts/fetch-catalogs.ts` reads that list), so the CLI must be on `PATH` when building from scratch. (The `evidence` command group's `-f`/`--framework` flag falls back to `$SIGCOMPLY_FRAMEWORK` then `soc2` when omitted, but the script always passes it explicitly.) CI should either install the CLI first or commit the catalog JSONs and skip the prebuild.

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

## Deployment

This is a fully static SPA — the build output in `dist/` is plain HTML, JS, and
CSS with no server component, so it can be served from any static host (GitHub
Pages, an S3/GCS bucket + CDN, Netlify, etc.). The repo ships a GitHub Pages
workflow (`.github/workflows/deploy.yml`) that, on push to `main`, runs
`npx vite build` (relying on the committed `public/data/catalogs/*.json`, so the
CLI is not required at deploy time), sets `VITE_BASE_PATH=/<repo>/` for the
sub-path deploy, copies `index.html` to `404.html` so client-side routes like
`/verify` resolve, and publishes to Pages. Set `VITE_BASE_PATH` yourself when
hosting under a different sub-path.

## How it fits

This SPA is an optional helper, off the CLI's critical path. When a user *chooses* to use it for a declaration or checklist entry: they fill the form here → SPA renders `evidence.pdf` → the SPA shows the upload path `{prefix}/{evidence_id}/{period}/evidence.pdf` (matching the CLI's manual-reader folder layout) and the user uploads the file to the manual-evidence folder in their own bucket → the [SigComply CLI](https://github.com/SigComply/sigcomply-cli) picks it up on the next run (presence + temporal-window check), hashes it, and submits aggregated results to the Compliance Dashboard. The CLI reads every supported file in the period folder regardless of name, so users who skip the SPA can upload their own PDF to the same folder; the CLI sees no difference.

See [`CLAUDE.md`](CLAUDE.md) for development conventions, cross-repo contracts, and the wider product architecture.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind v4 · shadcn/ui · React Router v7 · `@react-pdf/renderer`

## Contributing & security

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the local verification gate and
conventions, and [`SECURITY.md`](SECURITY.md) to report a vulnerability
privately (do not open a public issue for security bugs).

## License

[Apache-2.0](LICENSE).
