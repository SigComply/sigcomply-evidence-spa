# Security policy

## Report a vulnerability

Report a vulnerability in the SigComply Evidence SPA privately through
[GitHub Security Advisories](https://github.com/SigComply/sigcomply-evidence-spa/security/advisories/new).
Don't open a public issue. Include the steps to reproduce and the affected route (`/`,
`/evidence/...` or `/verify`).

## Supported versions

Before 1.0, only the latest deployed build receives security fixes.

## Scope

The app is a static single-page app with no backend. It reads a catalog JSON and `config.json`
from its own host, renders PDFs in the browser and verifies signed `EvidenceEnvelope` files
locally. It uploads nothing and never handles credentials.

In scope:

- Ed25519 signature verification on `/verify` (`src/lib/verification/`), including the canonical
  JSON in `src/lib/verification/canonical.ts`, which must match the CLI's signing bytes exactly.
- PDF generation in the browser (`src/lib/pdf/`).
- Runtime config and catalog loading (`src/config/`, `src/data/`).
- Any path by which an envelope, PDF or form value leaves the browser. The app must make no
  network call other than fetching its own static files.
- The Content-Security-Policy the built `index.html` carries (`CONTENT_SECURITY_POLICY` in
  `vite.config.ts`). It allows scripts, styles, fonts and fetches from the app's own origin only,
  so the browser itself blocks a request to anywhere else.

Out of scope:

- Vulnerabilities in npm dependencies: report them to the upstream project.
- Vulnerabilities in the browser's Web Crypto (`crypto.subtle`): report them to the browser
  vendor.
- The CLI's signing scheme: report it to
  [sigcomply-cli](https://github.com/SigComply/sigcomply-cli/security/advisories/new).

## What `/verify` proves (and does not)

- A valid result proves the envelope's records match the Ed25519 public key embedded in the same
  envelope. Anyone can sign an envelope with their own key, so it does not prove who signed them.
  The CLI generates a new key for every evidence file, so there is no long-lived key to compare
  against; write-once storage of the vault is what keeps a run from being rewritten and
  re-signed.
- For a single-folder manual record, `/verify` shows the result fields the CLI signed: file
  present, uploaded within the period or its grace window, passed the CLI's file checks, any
  validation failures and the files in the folder. A check the CLI never ran (no file, or no file
  it could turn into a PDF) shows as "not checked". It displays them; it doesn't re-check the
  folder.
- The recorded results (single-folder and per vendor) and the PDF check appear only when the
  signature is valid, since an unverified record vouches for nothing. It compares the SHA-256 of the PDF you supply with the envelope's
  `file_hash`. The CLI computes `file_hash` over the PDF it merges from every file in the evidence
  folder and stores that merged PDF in the run folder under `policies/<policy_id>/attachments/`.
  Supply that file. A folder that held exactly one PDF also matches the original upload, which the CLI uses
  unchanged.
- Fan-out envelopes (one folder per vendor) carry a result and a `file_hash` per vendor under
  `instances`, and no top-level `file_hash`. `/verify` lists each vendor's result as the CLI
  signed it and compares a PDF you supply with every vendor's `file_hash`, naming the vendor it
  matches. The per-vendor limits are the same as above. The results are the CLI's; `/verify`
  doesn't re-check the folders.
- `/verify` checks one envelope at a time. It does not verify the per-run signed `manifest.json`,
  so it can't tell you whether a run's files are complete.
