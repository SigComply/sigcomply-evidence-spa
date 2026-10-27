# Workflow: sigcomply-evidence-spa

This file binds the shared `task-workflow` skill (`.claude/skills/task-workflow/SKILL.md`) to this
repo. Read it with `AGENTS.md` before step 1 of every task.

## What a push to main triggers

A push to `main` that changes more than docs updates the live public site. There is no staging
environment.

- `.github/workflows/deploy.yml` (Build & Deploy to GitHub Pages) runs on every push to `main`
  except pushes that change only Markdown, `docs/`, `.claude/` or Vale files (`paths-ignore`). It
  also has `workflow_dispatch`. Steps: `npm ci`, `npm audit --audit-level=high` (hard gate),
  install the latest `sigcomply` CLI release (resolved from `releases/latest` at run time),
  `npm run build` with `VITE_BASE_PATH=/<repo-name>/`, copy `index.html` to `404.html` for
  client-side routes, deploy `dist/` to GitHub Pages.
- `.github/workflows/security.yml` runs on push to `main`, on pull requests and weekly: npm-audit,
  OSV, CodeQL, Semgrep, Trivy, Retire.js, secret scan, ZAP, SBOM. The `npm-audit` and
  `secret-scan` jobs are hard gates; the rest are advisory. It has no `paths-ignore`, so docs-only
  pushes run it too.
- `.github/workflows/docs-lint.yml` runs Vale at error level on `README.md`, `SECURITY.md` and
  `CONTRIBUTING.md`. A push or pull request that changes `.vale.ini`, `.vale/**` or the workflow
  itself lints all three. Otherwise it lints only the ones that changed.
- No workflow runs ESLint or Vitest. The local gate below is the only place they run.

Deploy facts that matter when you change the build:

- `prebuild` (`fetch-catalogs`) regenerates `public/data/catalogs/*.json` from the CLI on every
  deploy and fails the deploy on any error. A CLI catalog change reaches the live site on the next
  deploy without a commit here. To ship it without a code change, run the deploy workflow by hand
  (`workflow_dispatch`); a docs-only push doesn't deploy.
- The deploy job has `contents: read` and never commits the regenerated catalogs. The committed
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
npm run lint && npx tsc -b && npm run test && npm run build
```

- `npm run lint`: `eslint .`. There is no formatter; don't add Prettier or Biome.
- `npx tsc -b`: the standalone typecheck. Faster than a build during the inner loop.
- `npm run test`: the Vitest suite.
- `npm run build`: `prebuild` (`fetch-catalogs`, needs `sigcomply` on `PATH`) then
  `tsc -b && vite build`. It catches what the dev server's on-demand transpile hides.

Without the CLI on `PATH`, `npm run build` fails at `prebuild` by design: it never falls back to
the committed JSON, because a silent fallback is how stale catalogs once reached production. Run
`npx tsc -b && npx vite build` instead and state in your report that the catalog refresh was not
exercised. Any change to `scripts/fetch-catalogs.ts` or `public/config.json` needs the CLI and the
full `npm run build`.

When you change `README.md`, `SECURITY.md` or `CONTRIBUTING.md`, also run
`vale --minAlertLevel=error <files>`, the check `docs-lint.yml` enforces.

No git hook runs this gate (see "Commands" in `AGENTS.md`). Running it is your job.

## Test layers

| Layer | Where | Run | Add one when |
|---|---|---|---|
| Unit | Colocated `*.test.ts` next to the code (`foo.ts` → `foo.test.ts`), mostly `src/lib/` | `npm run test`, one file: `npx vitest run <path>` | Any logic change. Extract logic from React components into pure functions in `src/lib/` so it can be tested. |
| Crypto contract | `src/lib/verification/{canonical,verify}.test.ts` with CLI-produced fixtures in `src/lib/verification/__fixtures__/` | `npm run test` | Any change to canonicalization, signature verification or the envelope type. Refresh fixtures from the CLI, never by hand. |
| End-to-end | None automated | Agent-driven browser check (next section) | Any change that can alter what the app renders or does |

Tests run in Vitest's Node environment. jsdom, `@testing-library/react` and Playwright are not
installed, so there are no component or browser tests. Adding one of them is a deliberate
dependency change: put it in the plan. `docs/TESTING.md` has the fixture rules, the coverage gap
and the Web Crypto and PDF specifics.

## Verify in the real product

Every change that can alter what the app renders or does is verified by driving the app in a real
browser. That covers more than components: `src/lib/` code a page calls, catalogs, runtime config,
routing, styles, PDF generation and verification all reach the screen. Drive it at task-workflow
step 9, again after every review fix that touches it, and to reproduce a review finding about app
behaviour.

The browser is the cmux in-terminal browser. Run the setup check in
[CMUX_BROWSER.md](CMUX_BROWSER.md) first; that file also has the rules, the commands and the
browser's quirks.

1. Start the app in the background and wait until it answers:

   ```bash
   PORT=5173   # taken by another session's server? leave it running and pick a free port
   npm run dev -- --strictPort --port $PORT > /tmp/spa_dev.$PORT.log 2>&1 & echo $! > /tmp/spa_dev.$PORT.pid
   for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:$PORT/ && { echo ready; break; }; sleep 1; done
   BASE=http://localhost:$PORT
   ```

   `npm run dev` serves the committed catalogs. `--strictPort` makes Vite fail when the port is
   taken instead of moving to the next one, so the loop can't report another session's server as
   yours. For a change to bundling, lazy loading, routing or the base path, run `npm run build`
   (or the CLI-free build) and `npm run preview -- --strictPort --port $PORT` instead; that serves
   the shipped `dist/` bundle.
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

Only code whose output no page uses (lint config, test helpers) is covered by the unit suite
alone; say so in the report. A refactor of code a page uses still gets driven, and so does a
change to the build or to `scripts/fetch-catalogs.ts`.

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
on a `fetch-catalogs` error.

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
