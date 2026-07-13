# Testing

Test strategy for the Manual Evidence SPA. Read this before adding or changing tests.
[WORKFLOW.md](WORKFLOW.md) owns the full change loop; this doc is the testing detail it links to.

## Toolchain

- **Runner:** [Vitest](https://vitest.dev) (`vitest run`). Config is inherited from
  [`vite.config.ts`](../vite.config.ts) — there is no separate `vitest.config.ts` and no custom test
  block, so tests run in Vitest's **default Node environment** (no jsdom). The `@/…` path alias
  resolves in tests because Vitest reuses the Vite `resolve.alias`.
- **No coverage config**, no coverage gate, no threshold. `vitest run --coverage` works ad hoc but
  nothing enforces a floor.
- **No Playwright, no `@testing-library/react`, no jsdom** installed. There are currently **no
  component/DOM tests** and no end-to-end browser tests. UI is verified manually in a real browser —
  see [WORKFLOW.md → Verify in a browser](WORKFLOW.md#5-verify-in-a-browser-ui-changes).

## Commands

```bash
npm run test              # vitest run — one-shot, what you run before pushing
npx vitest                # watch mode during development
npx vitest run <path>     # a single file, e.g. src/lib/verification/canonical.test.ts
npx vitest run --coverage # ad-hoc coverage (no config, no threshold)
```

`npm run test` is one of the four local gates in [WORKFLOW.md § 4](WORKFLOW.md#4-verify-locally-the-real-gate)
(`lint`, `test`, `tsc -b`, `build`). CI does **not** run it — local is the gate.

## Layout

Tests are **colocated** next to the code they cover: `foo.ts` → `foo.test.ts` in the same directory.
Test fixtures live in a sibling `__fixtures__/` directory.

```
src/lib/verification/
  canonical.ts            canonical.test.ts
  verify.ts               verify.test.ts
  __fixtures__/
    sample-envelope-v1.json              ← CLI-produced envelope (automated flow)
    sample-envelope-v1-manual.json       ← CLI-produced envelope (manual flow)
    sample-envelope-v1.canonical.txt     ← CLI reference canonical bytes (the contract)
```

## Current coverage (and the gap)

Today the suite covers **only the `/verify` crypto path** — `src/lib/verification/{canonical,verify}.ts`
(21 tests across 2 files). Everything else has **zero tests**, including:

- the entire **form → PDF** app (`useEvidenceForm`, `renderEvidencePdf`, the PDF components),
- period math (`src/lib/period.ts`), upload-path building (`src/lib/storage-path.ts`), PDF metadata
  strings (`src/lib/pdf/metadata.ts`),
- all React components, hooks, and pages.

This is a known gap, not a decision that these don't need tests. **The expectation going forward: new
or changed logic ships with tests in the same commit** (see [WORKFLOW.md § 2](WORKFLOW.md#2-write-tests-first)).
The cheap, high-value targets are the **pure functions** in `src/lib/` — canonicalization, period
boundaries, path templates, metadata key=value strings. Prefer testing those over the React shell.

## The crypto contract tests (don't break these)

The two verification files carry the **cross-repo signing contract** with the CLI and are the most
load-bearing tests in the repo:

- **`canonical.test.ts`** asserts the SPA's `canonicalJSON()` matches the CLI's RFC 8785-style
  canonicalization — sorted keys at every level, no insignificant whitespace, `\u` escapes for
  control characters only, **no** HTML-escaping of `<`/`>`/`&` (the CLI disables `encoding/json`'s
  HTML escaping; the SPA must too), U+2028/U+2029 escaped like Go. Its final test compares SPA output
  byte-for-byte against `__fixtures__/sample-envelope-v1.canonical.txt`, which was produced by the Go
  signer. **This byte-equality is the contract.** If canonicalization drifts on either side, `/verify`
  silently rejects valid signatures — keep `canonical.ts` and the CLI's `internal/sign` in lockstep
  (see [CLAUDE.md → Contracts](../CLAUDE.md#contracts-with-sibling-repos)).
- **`verify.test.ts`** exercises `verifyEnvelopeSignature()` against real CLI-written envelope
  fixtures (both automated and manual flows) and tampered clones (flipped signature, mutated records)
  to confirm valid→valid and tampered→invalid, and that the signed bytes never include the `signature`
  block (only the three signed fields `format_version`, `produced_at`, `records`).

**Web Crypto note:** `verify.ts` uses `crypto.subtle` with the `Ed25519` algorithm. This works in the
Node version the tests run under (Node 22, pinned in CI) without any polyfill — do **not** add
`tweetnacl`/`noble-ed25519` to make tests pass. Browser-support gating lives in `verify.ts`
(`WebCryptoUnsupportedError`); in the test environment Ed25519 is present, so the graceful-degradation
path is not exercised by the current suite.

## Testing PDF generation

`@react-pdf/renderer` is heavy and lazy-imported. If you add tests for PDF output, prefer testing the
**inputs** — the pure functions that build the PDF input shape and metadata (`metadataKeywords()`,
the `PdfInput` mapping) — rather than rendering and byte-diffing a PDF, which is slow and brittle. The
CLI does not parse PDF contents in v1 (presence + hash only), so the metadata *strings* are the
contract worth pinning, not the rendered layout.

## Adding component/DOM tests (if a change ever needs them)

Not currently possible out of the box — jsdom and `@testing-library/react` are not installed. If a
component genuinely needs a rendering test, that's a real dependency addition (`jsdom` +
`@testing-library/react` + a `test.environment: "jsdom"` block in `vite.config.ts`): flag it, add it
deliberately, and update this doc. Don't add it silently. Most logic can and should be extracted into
a testable pure function in `src/lib/` instead, keeping the React shell thin.
