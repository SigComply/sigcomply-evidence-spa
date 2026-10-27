# Workflow: sigcomply-evidence-spa

This file binds the shared `task-workflow` skill (`.claude/skills/task-workflow/SKILL.md`) to this
repo. Read it with `AGENTS.md` before step 1 of every task.

## What a push to main triggers

A push to `main` that changes more than docs updates the live public site. There is no staging
environment.

- `.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, `npm run lint`,
  `npx tsc -b`, `npm run test:coverage`, `npx vite build` (committed catalogs) and
  `npm run test:e2e` (Playwright, Chromium and WebKit).
- `.github/workflows/deploy.yml` (Build & Deploy to GitHub Pages) runs on every push to `main`
  except pushes that change only Markdown, `docs/`, `.claude/` or Vale files (`paths-ignore`),
  daily at 07:00 UTC, and on `workflow_dispatch`. Three jobs:
  - `build` (`contents: read`, checkout without persisted credentials): `npm ci`,
    `npm audit --audit-level=high` (hard gate), install the latest `sigcomply` CLI release
    (resolved from `releases/latest` at run time; the tarball's SHA-256 must match the release's
    `checksums.txt` before it is extracted), `npm run build` with `VITE_BASE_PATH=/<repo-name>/`,
    copy `index.html` to `404.html` for client-side routes, then the gate on that build: lint,
    `npm run test:coverage` and Playwright against the `dist/` about to ship (`E2E_DIST=dist`).
    Only then does it upload `dist/` as the Pages artifact.
  - `deploy` (`pages: write`, `id-token: write`): publishes that artifact. It checks out nothing
    and runs no repo code.
  - `smoke`: runs `e2e/smoke.live.spec.ts` against the live URL (home loads a catalog, `/verify`
    verifies a CLI envelope).

  Two causes of a red or missing daily deploy that have nothing to do with a commit: a new
  high or critical advisory makes `npm audit` fail the `build` job, and GitHub disables
  scheduled workflows after 60 days without activity in the repo (re-enable it in the Actions
  tab, or push).
- `.github/workflows/security.yml` runs on push to `main`, on pull requests and weekly: npm-audit,
  OSV, CodeQL, Semgrep, Trivy, Retire.js, secret scan, ZAP, SBOM. The `npm-audit` and
  `secret-scan` jobs are hard gates; the rest are advisory. It has no `paths-ignore`, so docs-only
  pushes run it too.
- `.github/workflows/docs-lint.yml` runs Vale at error level on `README.md`, `SECURITY.md` and
  `CONTRIBUTING.md`. A push or pull request that changes `.vale.ini`, `.vale/**` or the workflow
  itself lints all three. Otherwise it lints only the ones that changed.

Deploy facts that matter when you change the build:

- `prebuild` (`fetch-catalogs`) regenerates `public/data/catalogs/*.json` from the CLI on every
  deploy and fails the deploy on any error, including output that doesn't match
  `src/types/catalog.ts`. A CLI catalog change reaches the live site on the next deploy without a
  commit here: at the latest the daily run, sooner with `workflow_dispatch`.
- Tests that name catalog entries use the pinned copies in `e2e/fixtures/catalogs/`, never
  `public/data/catalogs/`, which `npm run build` overwrites in deploy. Playwright specs serve them
  with `pinCatalogs` (`e2e/fixtures.ts`); `catalog-validate.test.ts` and
  `render-evidence-pdf.test.ts` read them. A new CLI catalog can't fail those tests. The other
  specs use the built catalogs, and `fetch-catalogs.test.ts` checks that the fresh ones pass the
  validator unchanged.
- No job in `deploy.yml` can push, so the regenerated catalogs are never committed. The committed
  copies are the dev and offline fallback and can lag the CLI without affecting production.
  Refresh them with `npm run fetch-catalogs`.
- A framework in `public/config.json` that the released CLI can't serve fails the deploy.

Watch the run to the end after every push:

```bash
gh run list --branch main --limit 5
gh run watch <run-id> --exit-status
```

Which `gh` account to use on this machine is in `AGENTS.local.md` (if present). A red deploy
affects the live site: fix forward before anything else.

## Gate: run before every commit

```bash
npm run lint && npx tsc -b && npm run test:coverage && npm run build && npm run test:e2e
```

- `npm run lint`: `eslint .`. There is no formatter; don't add Prettier or Biome.
- `npx tsc -b`: the standalone typecheck. Faster than a build during the inner loop.
- `npm run test:coverage`: the Vitest suite with the coverage floors.
- `npm run build`: `prebuild` (`fetch-catalogs`, needs `sigcomply` on `PATH`) then
  `tsc -b && vite build`. It catches what the dev server's on-demand transpile hides.
- `npm run test:e2e`: builds `dist-e2e/` with the Pages base path and runs Playwright on it
  (Chromium and WebKit). Install the browsers once with `npx playwright install chromium webkit`.

Without the CLI on `PATH`, `npm run build` fails at `prebuild` by design: it never falls back to
the committed JSON, because a silent fallback is how stale catalogs once reached production. Run
`npx tsc -b && npx vite build` instead and state in your report that the catalog refresh was not
exercised. Any change to `scripts/fetch-catalogs.ts` or `public/config.json` needs the CLI and the
full `npm run build`.

When you change `README.md`, `SECURITY.md` or `CONTRIBUTING.md`, also run
`vale --minAlertLevel=error <files>`, the check `docs-lint.yml` enforces.

No git hook runs this gate (see "Commands" in `AGENTS.md`). CI runs it again (`ci.yml`, and
`deploy.yml` before upload), but run it locally before every commit.

## Test layers

| Layer | Where | Run | Add one when |
|---|---|---|---|
| Unit (Vitest, Node) | Colocated `*.test.ts` next to the code (`foo.ts` → `foo.test.ts`), mostly `src/lib/`; `scripts/*.test.ts` | `npm run test:coverage`, one file: `npx vitest run <path>` | Any logic change. Extract logic from React components into pure functions in `src/lib/` so it can be tested. Coverage floors on `src/lib`, `src/config`, `src/hooks`. |
| CLI contract | `src/lib/verification/{canonical,verify,golden}.test.ts`, `src/lib/period-golden.test.ts`, `scripts/fetch-catalogs.test.ts`, with CLI-produced fixtures and goldens (`__fixtures__/`, `__fixtures__/golden/`) | `npm run test`; `npm run check:goldens` for drift from the CLI | Any change to canonicalization, signature verification, the envelope type, periods, the upload folder or the catalog types. Never edit the fixtures by hand; refresh goldens as in `docs/TESTING.md` "CLI golden fixtures". |
| Component (testing-library, jsdom) | `src/pages/*.test.tsx`, `src/hooks/*.test.ts`, first line `// @vitest-environment jsdom` | `npm run test` | A change to page state, validation messages or what a component renders for given data. |
| E2E (Playwright, Pages-like `dist`) | `e2e/*.spec.ts`, Chromium and WebKit, served by `e2e/pages-server.ts` | `npm run test:e2e` | **Required for every user-visible flow**: a new or changed route, form, download, verdict, config option or catalog behaviour gets a spec in the same commit. |
| Post-deploy smoke | `e2e/smoke.live.spec.ts`, run by `deploy.yml` after each deploy | `npm run test:e2e:live` | A new page or flow whose absence on the live site would go unnoticed. Keep it small. |
| Node entry points | `scripts/verify-envelopes.ts`, `scripts/render-evidence-pdf.ts` and their tests | `npm run test` | Any change to them or to the `src/lib/` modules they import; the E2E repos depend on their output and exit codes. |

`docs/TESTING.md` has the fixture rules, the coverage floors, the Playwright conventions and the
Web Crypto and PDF specifics. The automated layers are the proof that a flow works; the browser
check below is for what a test can't judge.

## Verify in the real product

Playwright proves the flows work (see Test layers). The cmux browser check is for visual and UX
judgement a test can't make: layout, copy, spacing, focus order, how a state reads to a person.
Do it for every change that can alter what the app looks like or how it feels, at task-workflow
step 9 and again after a review fix that touches it, and to reproduce a review finding about app
behaviour. It never replaces a missing Playwright spec.

The browser is the cmux in-terminal browser. Run the setup check in
[CMUX_BROWSER.md](CMUX_BROWSER.md) first; that file also has the rules, the commands and the
browser's quirks.

1. Start the app in the background and wait until it answers:

   ```bash
   PORT=5173   # taken by another session's server? leave it running and pick a free port
   if lsof -ti :$PORT >/dev/null; then echo "port $PORT is taken: pick another"; else
     rm -f /tmp/spa_dev.$PORT.log
     NO_COLOR=1 npm run dev -- --strictPort --port $PORT > /tmp/spa_dev.$PORT.log 2>&1 &
     echo $! > /tmp/spa_dev.$PORT.pid
     for i in $(seq 1 30); do
       grep -q "Local:" /tmp/spa_dev.$PORT.log && { echo ready; break; }
       kill -0 "$(cat /tmp/spa_dev.$PORT.pid)" 2>/dev/null || { echo "vite exited: see the log"; break; }
       sleep 1
     done
   fi
   BASE=http://localhost:$PORT
   ```

   `npm run dev` serves the committed catalogs. The port check runs first, so the log and pid
   files for a free port can only be stale ones. `--strictPort` makes Vite exit rather than move
   to another port, and the loop waits for your Vite's own `Local:` line, not for the port to
   answer. If nothing prints after 30 seconds, read the log. For a change to bundling, lazy
   loading, routing or the base path, run `npm run build` (or the CLI-free build), then the same
   block with `npm run preview` in place of `npm run dev`; that serves the shipped `dist/` bundle.
2. Drive the flow the change touches:
   - **Form → PDF** (`/`, `/evidence/:framework/:evidenceId`): pick a declaration and a checklist
     entry, fill the form, submit. Confirm `evidence.pdf` downloads (`download list --json` shows
     where the browser saved it, normally `~/Downloads`; delete it when done) and the upload-path
     screen shows `{prefix}{evidence_id}/{period}/evidence.pdf` with the default prefix `manual/`.
     Open the PDF and check the header block and metadata.
   - **Verify** (`/verify`): load `src/lib/verification/__fixtures__/sample-envelope-v1.json`
     (`set-input-files --selector "input[type=file]" --file <absolute path>`). The verdict must
     show pass ("Signature valid") with no button press. Change one character inside `records` and
     confirm the verdict flips to fail. For manual-flow changes, use
     `sample-envelope-v1-manual.json`; for fan-out changes, `sample-envelope-v1-fanout.json` and
     its two `sample-envelope-v1-fanout.<vendor>.pdf` files.
3. Confirm route changes from the rendered page, not the address bar.
4. For a change near data handling, check what the page requested. After a fresh `goto` and the
   flow, this must print `[]` (no request left the app's own origin):

   ```bash
   cmux browser --surface $S eval "performance.getEntriesByType('resource').map(e => e.name).filter(n => !n.startsWith(location.origin))"
   ```

   Drop the filter to see the full list: the app's own static assets (Vite modules under
   `npm run dev`), `config.json` and `data/catalogs/*.json`.
5. Tear down: `cmux close-surface --surface $S`, then `kill "$(cat /tmp/spa_dev.$PORT.pid)"`.

Code whose output no page uses (lint config, test helpers) needs no browser check; say so in the
report. A change to the build or to `scripts/fetch-catalogs.ts` is covered by the full gate
(`npm run build`, then `npm run test:e2e`, which builds and serves the Pages bundle).

## Docs routing

| Change | Agent-internal docs | Customer-facing docs |
|---|---|---|
| New or changed npm script, gate step or CI workflow | `AGENTS.md` Commands, this file | `CONTRIBUTING.md`, `README.md` (Build, Deployment) |
| Envelope, canonical JSON or signature verification | `AGENTS.md` Contracts and Verifier limits, `docs/TESTING.md` | `SECURITY.md` ("What `/verify` proves"), `README.md` ("What `/verify` can and can't check"), `/verify` verdict copy |
| Catalog shape, evidence types, frequencies, period keys | `AGENTS.md` Contracts | `README.md` if user-visible |
| Upload path, prefix, PDF filename, PDF layout or metadata | `AGENTS.md` Contracts and Conventions | `README.md` ("Check the upload path", Self-host), upload-path screen copy |
| Runtime config or frameworks list | `AGENTS.md` Runtime config | `README.md` (Self-host) |
| New form, page or UI flow | `AGENTS.md` Role and scope, Conventions | In-app copy, `README.md` if it changes what users do |
| Test layout, fixtures, test tooling | `docs/TESTING.md`, this file | none |
| Dependency or toolchain change | `AGENTS.md` Gotchas | `CONTRIBUTING.md` if setup changes |
| Scope of the SPA | `AGENTS.md` Role and scope | `README.md`, `.github/ISSUE_TEMPLATE/feature_request.md` |
| How users fill forms or verify envelopes | none | `sigcomply-cli` `docs/guides/manual-evidence.md` and `docs/guides/verify-evidence.md` (they own the how-to) |

A contract change also needs the matching doc change in `sigcomply-cli`.

## Repo-specific review lenses

The self-review "contracts and invariants" lens checks these against `AGENTS.md`:

- **Crypto and verification correctness**: Ed25519 through Web Crypto only (no JS crypto
  library); `canonical.ts` byte-equal to the CLI's `internal/sign`; signed bytes are exactly
  `{format_version, produced_at, records}`; large integers survive (raw text reaches
  `verifyEnvelopeSignature`); unknown `format_version` majors are refused; verdict copy claims
  integrity relative to the embedded key, not provenance. See "Contracts with sigcomply-cli" and
  "Verifier limits".
- **Nothing leaves the browser**: no new network call, upload, telemetry or third-party script;
  `localStorage` stays a non-authoritative `sigcomply:*` breadcrumb. See "Role and scope".
- **PDF output contract**: upload path matches the CLI folder scheme (default prefix `manual/`, no
  framework segment, period keyed off the entry's frequency); the PDF Info `keywords` string from
  `metadataKeywords()` stays stable. See "Contracts with sigcomply-cli".
- **Catalog contract**: types in `src/types/catalog.ts` match the output of
  `sigcomply evidence catalog`; only `declaration` and `checklist` reach the browser;
  `public/config.json` stays the single framework list.
- **Scope guardrails and bundle discipline**: no form type for evidence that exists as a file;
  `@react-pdf/renderer` stays lazy-loaded; `/verify` stays button-free, dependency-free and never
  gated on a framework; `src/components/ui/` untouched by hand. See "Conventions".

For a change to any workflow under `.github/workflows/`, check that `actionlint` reports no new
findings on the changed file. For a change to `deploy.yml`, also check that the deploy still fails
on a `fetch-catalogs` error, that the gate steps still run before the upload, and that only the
`deploy` job holds `pages: write` and `id-token: write`.

## Pre-launch rules

- For internal work, commit and push straight to `main`. No PRs, no branch protection. This flips to a PR and review
  flow at public launch; revise this file then.
- No backward-compat shims or backfills: there is no install base and no server state. The
  exception is the CLI contracts, which change in lockstep with `sigcomply-cli`.
- Commit messages follow the `task-workflow` skill. End each with the attribution trailer your
  harness provides.
- `main` is the live site. Never push with a red gate.

## Debugging

There is no server, no log store and no error tracker. Errors show up in three places:

- **Unit-level bugs** (canonicalization, period math, upload path, metadata strings): reproduce as
  a failing `*.test.ts` case first. `/verify` failures on a valid envelope usually mean
  canonicalization drift: compare `canonicalJSON()` output with the CLI reference fixture.
- **UI and runtime bugs**: reproduce with `npm run dev` and read the browser console. A render
  error shows the `ErrorBoundary` fallback instead of a blank page; the stack is in the console.
- **Deploy failures**: `gh run view <run-id> --log-failed`. Reproduce with `npm run build` and the
  CLI on `PATH`; without the CLI, `npx tsc -b && npx vite build` covers everything but the catalog
  refresh.
