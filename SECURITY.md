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

Out of scope:

- Vulnerabilities in npm dependencies: report them to the upstream project.
- Vulnerabilities in the browser's Web Crypto (`crypto.subtle`): report them to the browser
  vendor.
- The CLI's signing scheme: report it to
  [sigcomply-cli](https://github.com/SigComply/sigcomply-cli/security/advisories/new).

## What `/verify` proves (and does not)

- A valid result proves the envelope's records match the Ed25519 public key embedded in the same
  envelope. Anyone can sign an envelope with their own key, so it does not prove who signed them.
- The PDF check compares the SHA-256 of the PDF you supply with the envelope's `file_hash`. The
  CLI computes `file_hash` over the PDF it merges from every file in the evidence folder, and it
  does not store that merged PDF. The check can pass only when the folder held exactly one PDF,
  which the CLI uses unchanged. For a folder with several files or with images, no file you can
  supply matches.
- Fan-out envelopes (one folder per vendor) carry their hashes per vendor and no top-level
  `file_hash`. `/verify` checks their signature only.
- `/verify` checks one envelope at a time. It does not verify the per-run signed `manifest.json`,
  so it can't tell you whether a run's files are complete.
