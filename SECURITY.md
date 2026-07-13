# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the SigComply Evidence SPA,
please report it privately via
[GitHub Security Advisories](https://github.com/SigComply/sigcomply-evidence-spa/security/advisories/new)
rather than opening a public issue.

We take security reports seriously and will acknowledge receipt within
48 hours and provide an estimated timeline for a fix.

## Supported Versions

Pre-1.0: the latest deployed build receives security fixes. Older
builds are not supported.

## Scope

This app is a **static, backend-free single-page application**. It reads
a pre-built catalog JSON, generates PDFs in the browser, and verifies
signed `EvidenceEnvelope` files locally. It never uploads anything to a
server and never handles customer credentials.

In scope:
- The `/verify` Ed25519 signature verification path
  (`src/lib/verification/`) — canonicalization and Web Crypto
  signature checking.
- The RFC 8785-style canonical-JSON implementation
  (`src/lib/verification/canonical.ts`), which must match the CLI's
  signing canonicalization byte-for-byte.
- Client-side PDF generation (`src/lib/pdf/`).
- Runtime config and catalog loading (`src/config/`, `src/data/`).

Out of scope (report upstream):
- Vulnerabilities in transitive npm dependencies — open a Dependabot PR
  or report to the upstream project.
- Vulnerabilities in the browser's Web Crypto (`crypto.subtle`)
  implementation — report to the browser vendor.
- Vulnerabilities in the SigComply CLI's signing scheme itself — report
  to [sigcomply-cli](https://github.com/SigComply/sigcomply-cli/security/advisories/new).

## What `/verify` proves (and does not)

The verifier re-checks that an envelope's records match the Ed25519
public key **embedded in that same envelope**. A valid result proves the
records were not altered relative to that key; it does not prove
provenance on its own — the auditor must independently confirm the
public key belongs to the expected signer. Whole-run integrity
(verifying the per-run signed `manifest.json` Merkle root) is out of
scope for the current `envelope.v1` verifier and remains future work.

The verifier runs entirely client-side and makes no network calls, so
no envelope, PDF, or PII ever leaves the auditor's browser. A bug that
caused any of this data to be transmitted off-device would be treated as
critical.
