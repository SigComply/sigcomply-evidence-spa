# Testing

Test strategy for the Manual Evidence SPA. Read this before adding or changing tests.
[WORKFLOW.md](WORKFLOW.md) owns the gate and the test layers; this doc is the testing detail it links to.

## Toolchain

- **Runner:** [Vitest](https://vitest.dev) (`vitest run`). Config is the `test` block in
  [`vite.config.ts`](../vite.config.ts). Tests run in Vitest's **Node environment**; a component
  test opts into jsdom with `// @vitest-environment jsdom` as its first line. The `@/…` path alias
  resolves in tests because Vitest reuses the Vite `resolve.alias`.
- **Coverage:** `@vitest/coverage-v8`. `npm run test:coverage` fails when `src/lib/**`,
  `src/config/**` or `src/hooks/**` drop below the floors in `vite.config.ts`. Raise a floor when
  coverage goes up; never lower one to get green.
- **Component tests:** `jsdom`, `@testing-library/react` and `@testing-library/user-event`.
- **E2E:** `@playwright/test`, Chromium and WebKit projects (`playwright.config.ts`).
- **Node:** 24 (`.nvmrc`, `engines`; `.npmrc` `engine-strict=true` makes `npm ci` fail on an
  older Node). Vitest 5 does not support Node 23: two `/verify` component tests fail there with
  misleading "element not found" errors. So Vitest's `globalSetup`
  (`scripts/vitest-node-check.ts`) stops any run on a Node older than `.nvmrc` with
  `Node >=24 required (see .nvmrc)`.

## Commands

```bash
npm run test              # vitest run, one-shot
npx vitest                # watch mode during development
npx vitest run <path>     # a single file, e.g. src/lib/verification/canonical.test.ts
npm run test:coverage     # coverage with the floors enforced (what the gate and CI run)
npm run test:e2e          # Playwright on a Pages-like build (Chromium and WebKit)
npx playwright test e2e/verify.spec.ts --project=chromium   # one spec, one browser
```

`npm run test:coverage` and `npm run test:e2e` are part of the gate in
[WORKFLOW.md → Gate](WORKFLOW.md#gate-run-before-every-commit). CI runs them on every push
(`ci.yml`) and again before every deploy (`deploy.yml`).

## Layout

Tests are **colocated** next to the code they cover: `foo.ts` → `foo.test.ts` (`Foo.tsx` →
`Foo.test.tsx`) in the same directory. Test fixtures live in a sibling `__fixtures__/` directory.
Shared component-test helpers live in `src/test/`.

```
scripts/
  fetch-catalogs.ts       fetch-catalogs.test.ts   ← validate + filter, fixed point on public/data/catalogs, CLI catalog goldens
  check-goldens.sh                                 ← diffs the CLI goldens against a sigcomply-cli checkout
src/config/
  runtime.ts              runtime.test.ts   ← CLI default prefix, config.json fallback matrix
src/hooks/
  useCatalog.ts           useCatalog.test.ts      (jsdom)
src/pages/                                        (jsdom, testing-library)
  Dashboard.tsx           Dashboard.test.tsx      ← picker, stored framework, storage that throws
  EvidenceForm.tsx        EvidenceForm.test.tsx   ← submit flow, validation, upload path
  Verify.tsx              Verify.test.tsx         ← valid / tampered / bignum / PDF match verdicts
src/types/
  envelope.ts             envelope.test.ts        ← isEvidenceEnvelope negatives
src/lib/
  catalog-validate.ts     catalog-validate.test.ts ← catalog shape, run by fetch-catalogs (pinned catalogs)
  evidence-form.ts        evidence-form.test.ts   ← validation and form → PdfInput mapping
  local-prefs.ts          local-prefs.test.ts     ← localStorage that throws or is missing
  device-memory.ts        device-memory.test.ts
  period.ts               period.test.ts
  storage-path.ts         storage-path.test.ts
                          period-golden.test.ts   ← period.ts + storage-path.ts against the CLI periods golden
  __fixtures__/golden/                            ← CLI goldens: periods.json, <framework>_golden.json
  pdf/
    metadata.ts           metadata.test.ts        ← the keywords contract string
    render.tsx            render.test.tsx         ← real PDF in Node: Info keywords, body text, checkbox marks
    pdf-info.ts           pdf-info.test.ts        ← reads Info strings and body text runs for the tests
  verification/
    canonical.ts          canonical.test.ts
    verify.ts             verify.test.ts    ← plus bad base64, key/signature length, no Ed25519
    manual.ts             manual.test.ts    ← manual-record hashes and fan-out member verdicts
    parse-envelope.ts     parse-envelope.test.ts ← JSON errors, shape, format_version, raw text kept
                          golden.test.ts    ← every CLI golden envelope and manual PDF
    __fixtures__/
      golden/                                 ← CLI golden envelopes, canonical bytes and PDFs
      sample-envelope-v1.json                 ← CLI-produced envelope (automated flow)
      sample-envelope-v1-manual.json          ← CLI-produced envelope (manual flow)
      sample-envelope-v1-fanout.json          ← CLI-produced fan-out envelope (4 vendors under `instances`)
      sample-envelope-v1-fanout.<vendor>.pdf  ← the PDFs uploaded to two of those vendors' folders
      sample-envelope-v1.canonical.txt        ← CLI reference canonical bytes (the contract)
      sample-envelope-v1-bignum.json          ← CLI-produced envelope, payload carries int64-max + epoch-nanos
      sample-envelope-v1-bignum.canonical.txt ← CLI reference canonical bytes for the bignum envelope
      cli-run/                                ← run folder with a manifest.json written by the CLI's Go code
```

The `-bignum` fixtures pin the **large-integer contract**: import them with `?raw` (never as a
JSON module — that would round the 64-bit ints through float64 before the test sees them), parse via
`parseJSONPreservingNumbers`, and assert byte-equality against the CLI reference. `verify.test.ts`
also asserts the bignum envelope verifies **only** when the raw text is passed to
`verifyEnvelopeSignature` — the object path (rounded) must fail, which is exactly why `Verify.tsx`
keeps the original source text.

## CLI golden fixtures

The CLI generates golden files for the contracts this app shares with it, and this repo keeps
byte-for-byte copies. The README in each `golden/` folder names the CLI source.

| Golden | Here | Test |
|---|---|---|
| Envelopes `basic`, `bignum`, `manual`, `fanout`, their `.canonical.txt` and manual PDFs | `src/lib/verification/__fixtures__/golden/` | `golden.test.ts`: each envelope verifies, its signed bytes equal `.canonical.txt`, the file is the canonical JSON of the whole envelope plus a newline, each PDF matches its record's (or fan-out member's) hash, and a one-byte change to the envelope or the PDF fails |
| `periods.json`: UTC instants × cadences → period ID, window, folder; prefix table | `src/lib/__fixtures__/golden/` | `period-golden.test.ts`: `currentPeriod` and `computeUploadPath` give the same period ID, window and folder for every row, and the same folder for every prefix |
| `soc2_golden.json`, `iso27001_golden.json`: `sigcomply evidence catalog -o json` | `src/lib/__fixtures__/golden/` | `fetch-catalogs.test.ts`: no validator errors or warnings, and `prepareCatalog` keeps every renderable entry |

The CLI works in UTC; `currentPeriod` uses the local clock. `period-golden.test.ts` hands each
instant to the SPA as the same wall-clock time in the local zone (what a browser in UTC sees), so
it passes in any `TZ`. The window check compares the CLI's inclusive `period_end` with the SPA's
exclusive `end` minus 1 ms.

Refresh, in the same task as the CLI change:

1. In `sigcomply-cli`, regenerate with `-update` (the commands are in each README).
2. Here, `npm run check:goldens -- --copy`. It copies every golden from `CLI_REPO` (default
   `../sigcomply-cli`) and deletes a copy whose source is gone.
3. Run the gate.

`npm run check:goldens` without `--copy` only compares: exit 0 when every copy matches, 1 on a
changed, missing or extra file, 2 when `CLI_REPO` is not a CLI checkout. CI has no CLI checkout and
doesn't run it; run it locally whenever a contract changes on either side.

## Pinned catalogs

`e2e/fixtures/catalogs/*.json` are copies of `public/data/catalogs/` that only a person changes.
Tests that name catalog entries use them: Playwright specs through `pinCatalogs`
(`e2e/fixtures.ts`), `catalog-validate.test.ts` and `render-evidence-pdf.test.ts`. They exist
because deploy.yml's `npm run build` overwrites `public/data/catalogs/` with the latest CLI's
catalogs before the tests run; a test that read those would turn the deploy red on any catalog
change. The deploy-time check of the fresh catalogs is `fetch-catalogs.test.ts` (validator
fixed point), plus `fetch-catalogs` itself.

To refresh them, for example when a spec needs a new entry: `npm run fetch-catalogs` (CLI on
`PATH`), then `cp public/data/catalogs/*.json e2e/fixtures/catalogs/`, update the specs that name
entries, and run the gate.

## Coverage

`npm run test:coverage` enforces floors on `src/lib/**`, `src/config/**` and `src/hooks/**`
(`vite.config.ts`). Pages and components are covered by the jsdom tests in `src/pages/` and by the
Playwright suite, without a floor. New or changed logic ships with tests in the same commit. Put
logic in a pure function in `src/lib/` and test it there; keep the React shell thin.

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
  (see [AGENTS.md → Contracts](../AGENTS.md#contracts-with-sigcomply-cli)).
- **`verify.test.ts`** exercises `verifyEnvelopeSignature()` against real CLI-written envelope
  fixtures (both automated and manual flows) and tampered clones (flipped signature, mutated records)
  to confirm valid→valid and tampered→invalid, and that the signed bytes never include the `signature`
  block (only the three signed fields `format_version`, `produced_at`, `records`).

**Web Crypto note:** `verify.ts` uses `crypto.subtle` with the `Ed25519` algorithm. This works in the
Node version the tests run under without any polyfill — do **not** add
`tweetnacl`/`noble-ed25519` to make tests pass. Browser-support gating lives in `verify.ts`
(`WebCryptoUnsupportedError`); `verify.test.ts` covers it by stubbing `crypto` and `importKey`.

## Testing PDF generation

`@react-pdf/renderer` runs in Node, so `render.test.tsx` renders real PDFs (about 50 ms each) and
checks the `%PDF` header and the Info `Keywords` string with `readPdfInfoString`. It also reads
the body with `readPdfTextRuns` (one string per text object, in drawing order) and checks what an
auditor reads: the declaration text, `Accepted: YES`/`NO`, `Signed by <name> on <time>`, and for
each checklist item its box (`X` or blank, the run before the item text) and the required ` *`
(the run after it). `e2e/form.spec.ts` does the same on the downloaded file. `readPdfTextRuns`
only understands the standard fonts the templates use; an embedded font would make these tests
fail, not pass. Don't byte-diff PDFs or assert layout: the CLI only hashes the file. Test the inputs
(`buildPdfInput`, `metadataKeywords`) for everything else.

## Node entry points for the E2E repos

`scripts/verify-envelopes.ts` and `scripts/render-evidence-pdf.ts` let the E2E repos run this
app's verifier and PDF renderer on a real CLI run, without a browser. They import the same
`src/lib/` modules the pages use; keep it that way, or the E2E check stops proving what `/verify`
and the form do. Run them through the npm scripts (or `npx tsx --tsconfig tsconfig.app.json …`):
`tsx` needs that file for the `@/` alias and JSX. Relative paths resolve against the caller's
directory, so `npm --prefix <spa> run verify-envelopes -- ./vault` works from another checkout.

`verify-envelopes <dir> [--require-attachments] [--no-manifest] [--public-key <base64>]` checks
a vault the way the CLI's `05-vault-layout.md` "Verification" defines it:

- Each run folder's `manifest.json`: the Ed25519 signature over the canonical JSON of the
  manifest minus `signature` (as `sign.VerifyManifest`), then `file_hashes` against the disk. A
  listed file that is missing, a file not listed, a hash that differs or an unsafe path fails.
- Each envelope: any JSON under an `envelopes/` folder (a broken one fails) and any other JSON
  that passes `isEvidenceEnvelope`. Signature, manual PDF hashes against `attachments/`, and
  (unless `--no-manifest`) that a manifest covers it.
- Symlinks fail and are not followed. Other JSON (`summary.json`, `result.json`, state shards)
  is listed as `SKIP`.
- `--public-key`: every envelope and manifest must carry exactly that key. The CLI's built-in
  signer uses a fresh key per file, so this fits only a long-lived (HSM/KMS) signer; a "same key
  across the run" check would fail every real run. Without it, each manifest line shows its key
  fingerprint (first 16 hex of SHA-256 of the raw key).
- Exit 0: every check passed and at least one envelope was found. Exit 1: any `FAIL`, or no
  envelope. Exit 2: bad arguments.

A pass proves that no file in a run changed, appeared or went missing since the manifest was
signed, and that each envelope is intact. It does not prove the CLI signed anything: the keys
travel in the files, so whoever can write the vault can rewrite a run and re-sign it.
Write-once storage is what stops that (CLI `SECURITY.md`).

`render-evidence-pdf` takes the period from `completed_at` in the machine's local time zone, like
the form; CI runs in UTC. It rejects input with an unknown field or a wrong type, a `framework`
that isn't `[a-z0-9_]+` or (without `catalog`) isn't in `public/config.json`, notes for items the
entry doesn't have, and a `period` that doesn't match the entry's frequency (`2026-05-15`,
`2026-W20`, `2026-05`, `2026-Q2`, `2026`).

Their tests (`scripts/*.test.ts`) build a CLI-shaped run folder from the `__fixtures__` envelopes,
sign a manifest over it with a fresh `node:crypto` key, and tamper with copies (deleted, added or
re-signed files, edited `file_hashes`, other keys, symlinks). `__fixtures__/cli-run/` is a run
folder whose `manifest.json` came from the CLI's own `sign.Manifest` and `json.Marshal`, written
by a throwaway Go test run with `go test -overlay` in `sigcomply-cli`; it pins the on-disk
manifest format (HTML characters escaped, U+2028, non-UTC times). The CLI has no golden manifest
vector yet; when it gets one, replace this fixture with it.

## E2E (Playwright)

`npm run test:e2e` builds `dist-e2e/` with the GitHub Pages base path (`npm run build:e2e`, which
also copies `index.html` to `404.html` as `deploy.yml` does) and serves it with
`e2e/pages-server.ts`. That server behaves like Pages, not like `vite preview`: a missing path
answers `404.html` with status 404, so deep links boot the app through the 404 page and a missing
catalog is a real 404. Set `E2E_DIST=dist` to test an existing Pages build instead (deploy does,
after `npm run build`). Port 4791 (`E2E_PORT`); the server is never reused, so a port held by
another session fails fast instead of testing someone else's build.

- Specs: `e2e/form.spec.ts` (form → `evidence.pdf` download, keywords, PDF body and checkbox
  marks, upload path, config overrides), `e2e/verify.spec.ts` (valid, tampered, bignum, fan-out PDF match, wrong file,
  no Web Crypto), `e2e/routing.spec.ts` (deep links, in-app 404, picker, missing catalog, missing
  `config.json`).
- `e2e/fixtures.ts` exports `test` with an automatic check that no request leaves the app's
  origin. Import `test` from there, never from `@playwright/test`.
- Time: `page.clock.setFixedTime(...)` with `timezoneId: "UTC"` (set in the config) pins the
  period. No sleeps: wait on locators, `waitForEvent("download")` or `waitForResponse`.
- Config overrides: `page.route("**/config.json", ...)`.
- `e2e/smoke.live.spec.ts` runs only under `playwright.live.config.ts`, against the live site.
- Failures keep a trace in `test-results/`: `npx playwright show-trace <zip>`.

## Component tests

Start the file with `// @vitest-environment jsdom`. Serve `config.json` and catalogs with
`serveJson` from `src/test/component-env.ts`, call `loadConfig()` before rendering a page, and
`vi.resetModules()` after each test (config and catalogs are module-level caches). Mock
`@/lib/pdf/render` and `@/lib/download` in form tests; the real renderer is covered in Node.
`userEvent.setup({ applyAccept: false })` lets a test hand a file input a file its picker would
hide, as a drag-and-drop can.
