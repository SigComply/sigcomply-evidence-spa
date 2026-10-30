# SigComply Evidence SPA: agent instructions

Personal, machine-local instructions live in `AGENTS.local.md` (gitignored; may not exist). Read
it if it exists; it adds to and overrides this file. @AGENTS.local.md

SigComply runs in the customer's GitHub or GitLab pipeline (the `sigcomply-cli` repo), checks
cloud and SaaS configuration against SOC 2 and ISO 27001, and signs the evidence into storage the
customer owns. For the product and the other repos, read the workspace `../AGENTS.md` if it
exists (it is machine-local; this repo must not depend on it).

## How work happens here

- Agents do the whole SDLC: research, plan, tests, code, browser verification, docs, review and
  push. The human sets intent, approves plans and owns the decisions under "When to ask the human"
  in the `task-workflow` skill.
- Pre-launch, no users: commit and push internal work straight to `main`, no PRs. No backfills or
  backward-compat shims, except the CLI contracts below, which change in lockstep.
- Deploy model: a push to `main` that changes more than docs or agent files rebuilds and deploys
  the live public site (GitHub Pages). The build installs the latest released CLI and regenerates
  the catalogs. `docs/WORKFLOW.md` "What a push to main triggers" owns the details; don't restate
  them elsewhere.

## Every task

Run the `task-workflow` skill (`.claude/skills/task-workflow/SKILL.md`). This repo's bindings (gate,
test layers, browser verification, doc routing, review lenses) are in `docs/WORKFLOW.md`. Review
skills: `self-review`, `adversarial-review`; lenses `review-security`, `review-testing`,
`review-performance`; docs: `writing-docs`. The `.claude/` files are shared byte-for-byte with the
other four SigComply repos (`.claude/README.md`); put repo-specific rules here or in the workflow
doc.

## Always-on rules

1. Verify by running, not by reasoning. Report failures and skipped steps plainly.
2. Write tests first. Never weaken, skip or delete a test to get green.
3. Docs change with the code, agent-internal and customer-facing, in the same task.
4. Make the smallest change that fixes the root cause. Note unrelated problems instead of fixing
   them.
5. Never bypass hooks (`--no-verify`, `LEFTHOOK=0`), force-push, or rewrite pushed history.
6. No secrets or real customer data in code, fixtures, logs or docs.
7. Breaking an invariant below is a stop-and-ask. So is a change that turns out much more complex
   than planned.
8. Fan out subagents for wide research and parallel review. Keep the main context for decisions.
9. Comments explain why, not what.
10. Run the full local gate before every commit. CI (`ci.yml`) and the deploy run it again.
11. Nothing leaves the browser. Never add a backend, an upload, analytics, a third-party script or
    a network call that sends user data anywhere. The built `index.html` carries a strict
    Content-Security-Policy (`CONTENT_SECURITY_POLICY` in `vite.config.ts`, build only because
    the dev server injects inline scripts); never loosen it to make a feature work.
12. Change a CLI contract (table below) only together with the matching `sigcomply-cli` change.
13. Every user-visible flow has a Playwright spec in `e2e/`; a change to one updates or adds its
    spec in the same commit. That is the proof the flow works.
14. The code is source-available under the Elastic License 2.0 (`LICENSE`), like the CLI, not
    open source. Never call the SPA or the CLI "open source". `NOTICE` holds the copyright line,
    the Apache-2.0 cut-off and which files come from the CLI; keep `licenses/APACHE-2.0.txt`,
    which that cut-off refers to. The footer links to `LICENSE` so site visitors get the terms.
15. Also look at every change that can alter what the app looks like in a real browser, for visual
    and UX judgement only, again after review fixes (`docs/WORKFLOW.md` "Verify in the real
    product"). The browser is cmux (`docs/CMUX_BROWSER.md`). Run its setup check first; if you
    aren't inside cmux, ask the human to set it up rather than to click through the flow for you.

## Commands

| Purpose | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 24.22.2 (`.nvmrc`). `engine-strict` plus `engines` in `package.json` make npm refuse Node older than 24.22 or npm older than 11.18. See "Supply-chain controls". |
| Dev server | `npm run dev` | http://localhost:5173, uses the committed catalogs; no CLI needed. |
| Unit tests | `npm run test` | `vitest run`. Node environment; a component test opts into jsdom per file. |
| Coverage | `npm run test:coverage` | Fails below the floors in `vite.config.ts`. Report in `coverage/`. |
| E2E | `npm run test:e2e` (`npx playwright test`) | Playwright, Chromium and WebKit, on a fresh `dist-e2e/` build served like GitHub Pages (`e2e/pages-server.ts`). Browsers: `npx playwright install chromium webkit` once. |
| Live smoke | `npm run test:e2e:live` | `e2e/smoke.live.spec.ts` against the live site; deploy runs it after each deploy. |
| Lint | `npm run lint` | `eslint .`. No formatter. |
| Typecheck | `npx tsc -b` | No npm script. |
| Build | `npm run build` | `prebuild` runs `fetch-catalogs` (needs `sigcomply` on `PATH`, fatal on any error), then `tsc -b && vite build`. |
| Build without the CLI | `npx tsc -b && npx vite build` | Skips `prebuild`; bundles the committed catalogs. |
| Refresh catalogs | `npm run fetch-catalogs` | Rewrites `public/data/catalogs/*.json` from the local CLI. |
| Check CLI goldens | `npm run check:goldens` (`-- --copy` to refresh) | Diffs the copied CLI goldens against a `sigcomply-cli` checkout (`CLI_REPO`, default `../sigcomply-cli`). Exit 0 in sync, 1 drift, 2 no checkout. See "Contracts with sigcomply-cli". |
| Preview the bundle | `npm run preview` | Serves `dist/`. |
| Verify a vault | `npm run verify-envelopes -- <dir> [--require-attachments] [--no-manifest] [--public-key <b64>]` | Node entry point for the E2E repos: checks each run's signed `manifest.json` and its `file_hashes` against the disk, every envelope with the `/verify` code, and each manual PDF in `attachments/`. Exit 0 only if at least one envelope was found and every check passed; 1 on any failure; 2 on bad arguments. Details: `docs/TESTING.md`. |
| Render a PDF | `npm run render-evidence-pdf -- --input <json> --out <pdf>` | The form's PDF from JSON (`scripts/examples/`); prints the upload path. |
| Full gate | `npm run lint && npx tsc -b && npm run test:coverage && npm run build && npm run test:e2e` | Before every commit. |

`VITE_BASE_PATH` sets the base path (default `/`; the Pages build sets `/<repo-name>/`). No tracked
git hooks; machine-local ones are in `AGENTS.local.md`.

## Docs map

- `docs/WORKFLOW.md`: start of every task. Gate, CI and deploy, browser checks, doc routing.
- `docs/TESTING.md`: before adding or changing tests. Fixtures, crypto contract tests, gaps.
- `docs/CMUX_BROWSER.md`: the cmux browser: setup check, rules, commands, quirks. Shared
  byte-for-byte with the other SigComply web app repo.
- `README.md` (users and self-hosters), `SECURITY.md` (reporters and auditors; owns "What
  `/verify` proves"), `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*`: customer-facing.
- In-app copy (form labels, upload-path screen, `/verify` verdicts): customer-facing.
- How to use the SPA is owned by the CLI guides `docs/guides/manual-evidence.md` and
  `docs/guides/verify-evidence.md` in `sigcomply-cli`. The README links there; don't copy them.

## Role and scope

Two independent client-side tools in one Vite bundle. The CLI never calls this app.

1. Form to PDF (`/`, `/evidence/:framework/:evidenceId`): the user fills a form for a catalog
   entry of type `declaration` or `checklist`, downloads `evidence.pdf` and uploads it to the
   folder the CLI reads. Entries of type `document_upload` (training certificates, HR exports,
   scanned documents) are filtered out; the user uploads their own file. Never add a form type for
   evidence that already exists as a file.
2. Verifier (`/verify`): checks a CLI-signed `EvidenceEnvelope` against the Ed25519 public key
   embedded in it, and optionally re-hashes a PDF against the manual record's `file_hash` (or any
   fan-out member's). No auth.

Code map: routes in `src/App.tsx`; pages in `src/pages/`; pure logic in `src/lib/` (`period.ts`,
`storage-path.ts`, `pdf/`, `verification/`); shared types in `src/types/`; runtime config in
`src/config/runtime.ts`; catalog prefetch in `scripts/fetch-catalogs.ts`; Node entry points for the
E2E repos in `scripts/verify-envelopes.ts` and `scripts/render-evidence-pdf.ts`.

## Contracts with sigcomply-cli

| What | This repo | CLI side |
|---|---|---|
| Catalog JSON | `src/types/catalog.ts` (`Catalog`, `CatalogEntry`) | `internal/manualcatalog/catalog.go` (`Catalog`, `Entry`), output of `sigcomply evidence catalog --framework <fw> -o json` |
| Catalog `type` | `declaration` \| `checklist` \| `document_upload`; `fetch-catalogs` keeps only the first two | `manualcatalog.EvidenceType` |
| Catalog `frequency` | `daily` \| `weekly` \| `monthly` \| `quarterly` \| `yearly` | CLI cadence `annual` exports as `yearly` (`manualcatalog.FrequencyYearly`) |
| Upload folder | `computeUploadPath` in `src/lib/storage-path.ts`: `{prefix}{evidence_id}/{period}/evidence.pdf`, no framework segment | `FolderPrefix` in `internal/sources/manual/paths.go` |
| Default prefix | `storage.prefix` `manual/` in `public/config.json` and `DEFAULT_CONFIG` in `src/config/runtime.ts` | `defaultPrefix` in `internal/sources/manual/factory.go` |
| File name | `evidence.pdf` is a suggestion only | The CLI reads every supported file in the folder |
| Period key | `src/lib/period.ts`: `2026`, `2026-Q1`, `2026-03`, `2026-W14`, `2026-04-18`, from the entry's frequency | `planner.CadencePeriod` (`internal/planner/period.go`) |
| Envelope | `src/types/envelope.ts` (`format_version`, `produced_at`, `records`, `signature`) | `internal/core/envelope.go` |
| Manual record payload | `ManualDocumentPayload` and `ManualInstancePayload` in `src/types/envelope.ts` | `manualManifest` and `instanceManifest` in `internal/sources/manual/manual.go` |
| Canonical JSON | `src/lib/verification/canonical.ts` | `internal/sign/canonical.go`; byte-equal |
| Signature | Ed25519 via Web Crypto, base64 32-byte key and 64-byte signature | `internal/sign` |
| Run manifest | `verifyManifest` in `scripts/verify-envelopes.ts`: `run.v1`, signed object = manifest minus `signature`, `file_hashes` keyed by run-relative path, values `sha256:<hex>` | `internal/core/manifest.go`, `internal/sign/manifest.go`, `writeManifest` in `internal/orchestrator/orchestrator.go` |

Rules:

- `fetch-catalogs` checks the CLI output against `src/types/catalog.ts`
  (`src/lib/catalog-validate.ts`). On the entries the SPA renders (`declaration`, `checklist`), an
  unknown field, a missing required field or an unknown enum value fails the build; so does an
  unknown `type` or a bad `framework`, `version` or `entries`. Unknown top-level fields and
  anything on a dropped `document_upload` entry only print a warning, because the SPA never ships
  them. When the Go struct changes, update the types and the validator together (JSON tags and
  `omitempty` against optional `?`).
- The signed bytes are `canonicalJSON({format_version, produced_at, records})`: sorted keys, no
  whitespace, `\u` escapes for control characters, U+2028 and U+2029 only, no HTML escaping, and
  numbers kept as their source lexeme (`parseJSONPreservingNumbers`). Pass the original envelope
  text to `verifyEnvelopeSignature`, never a re-serialised copy, or integers above 2^53 break.
- Golden fixtures pin the envelope, period, folder and catalog contracts. The CLI's tests generate
  them with `-update`; this repo keeps byte-for-byte copies in
  `src/lib/verification/__fixtures__/golden/` (envelopes, canonical bytes, manual PDFs) and
  `src/lib/__fixtures__/golden/` (`periods.json`, `<framework>_golden.json`). The README in each
  folder names the CLI source and the test that reads it. Never edit them by hand. To refresh after
  a CLI change: run the generating test with `-update` in `sigcomply-cli`, then
  `npm run check:goldens -- --copy` here, then the gate, in the same task as the CLI change.
  `npm run check:goldens` alone exits 1 on drift. CI has no CLI checkout, so run it locally
  whenever either side changes a contract.
- The older crypto fixtures in `src/lib/verification/__fixtures__/` (`sample-envelope-v1*`,
  `cli-run/`) are also CLI output, from real runs; never edit them by hand either.
- `Verify.tsx` refuses any `format_version` other than `ENVELOPE_FORMAT_VERSION`.
- The period agreement holds only for the CLI's default `calendar_quarter` calendar. The SPA cannot
  see a project's `fiscal_year` or `custom` calendar; those users take the path from
  `sigcomply evidence due --all` (the form and README say so).
- The shown prefix comes from this deployment's `config.json`. It must equal the `prefix` of the
  project's `manual.pdf` source. Both sides collapse trailing slashes to one and add one when
  missing (`folders` in the periods golden).

## Verifier limits (keep the UI copy and SECURITY.md honest)

- A valid signature proves the records match the key embedded in the envelope, not who signed.
  The CLI makes a new key per file, so never tell users to check the key against a trusted one.
  Decision (2026-10-30): the valid verdict calls the file "self-consistent" and shows the key's
  SHA-256 fingerprint (`keyFingerprint` in `verify.ts`); no verdict state may say "intact",
  "authentic", "tamper-proof", "proves" or "guarantee". `VerdictBanner copy` in
  `src/pages/Verify.test.tsx` and its mirror in `e2e/verify.spec.ts` enforce the word list.
- A single-folder manual record shows its signed verdict fields (`recordedChecks` in
  `src/lib/verification/manual.ts`; a check the CLI never ran reads "not checked"). The recorded
  verdicts, fan-out members included, and the PDF check appear only once the signature is valid.
  So do the evidence ID and period badges and the folder URI and expected hash in "Envelope
  details"; until then the raw records block, labelled "Unverified file contents", is the only
  place payload values appear (`Verify page with an invalid signature` in `Verify.test.tsx`).
- `parseEnvelopeText` refuses a `signed_document` payload whose known fields have the wrong
  type (`manualPayloadProblem` in `src/types/envelope.ts`), so the page never renders one.
- `file_hash` is the hash of the merged PDF, which the CLI stores in the run folder as
  `policies/<policy_id>/attachments/<evidence_id>.pdf` (fan-out:
  `<evidence_id>.<member_id>.pdf`). It equals the uploaded file only when the folder held one PDF.
- Fan-out envelopes (one folder per vendor) carry per-member verdicts and hashes under `instances`
  (`ManualInstancePayload`), no top-level `file_hash`. `/verify` shows the signed verdicts and
  matches a dropped PDF against any member's `file_hash` (`src/lib/verification/manual.ts`). It
  displays the verdicts; it never re-derives them.
- Whole-run integrity (the signed `manifest.json`) is not verified.

## Runtime config

`public/config.json` holds `frameworks` and `storage` (`show_upload_path`, `prefix`). It is the only
list of frameworks: `fetch-catalogs` reads it (`frameworksFromConfig()`), and a framework the
released CLI can't serve fails the build. `loadConfig()` fetches it relative to
`import.meta.env.BASE_URL` and falls back field by field to `DEFAULT_CONFIG`. Self-hosted copies can
replace `config.json` without a rebuild; the public site ships the committed file.

## Conventions

- UI primitives: `npx shadcn@latest add <name>` into `src/components/ui/`. Never hand-edit that
  folder.
- New PDF template: a `<Foo>Pdf.tsx` in `src/lib/pdf/`, wired in `renderEvidencePdf`. The PDF Info
  `keywords` string comes from `metadataKeywords()` in `src/lib/pdf/metadata.ts`; keep it stable.
  Values percent-encode `%`, `;` and `=` (`keywordValue`), so user text can't add a key.
- New framework: add it to `public/config.json`, then `npm run fetch-catalogs`.
- `localStorage` keys use the `sigcomply:` prefix and are never compliance status. Read and write
  them through `src/lib/local-prefs.ts` or `device-memory.ts`, which survive storage that throws.
- Imports use `@/...`. Plain `fetch`; no data-fetching library.
- Lazy-load `@react-pdf/renderer` inside the submit handler (`useEvidenceForm`).
- PDFs use only the embedded DejaVu Sans faces in `src/lib/pdf/fonts/` (registered in `fonts.ts`,
  loaded from the app's own origin on the first render). Never use the standard fonts: their
  WinAnsi encoding corrupts any name outside Latin-1. The form refuses text the faces can't draw
  (`font-support.ts`); after changing the fonts, run `npx tsx scripts/gen-font-coverage.ts`.
- Crypto stays in `crypto.subtle`. No JS Ed25519 library, no polyfill.
- `FrameworkPickerDialog` opens only when `frameworks.length > 1` and nothing is stored, stays
  dismissible, and never gates `/verify`.
- `/verify` verifies on parse with no button, and adds no JSON editor dependency.

## Supply-chain controls

npm reads the keys below from 11.16 on and silently ignores the ones it doesn't know; 11.17 and
11.18 closed gaps in `allowScripts` enforcement, hence the 11.18 floor. Run every npm command on
the `.nvmrc` Node (`mise exec node@$(cat .nvmrc) -- npm ...` if your default is
older). `npm ci` on an older Node or npm fails with `EBADENGINE`/`notsup`; that is the floor working.

- Age gate: `.npmrc` `min-release-age=7` makes npm refuse any version published less than 7 days
  ago (`ETARGET ... with a date before ...`). Dependabot's `cooldown` uses the same 7 days (30 for
  majors), so its PRs never propose a version npm refuses. For a deliberate same-week security fix,
  bypass once: `npm install --min-release-age=0 <pkg>@<version>`, and say why in the commit.
- No git or URL dependencies: `allow-git=none`, `allow-remote=none`.
- Install scripts: `strict-allow-scripts=true` fails the install when a dependency has an install
  script that `allowScripts` in `package.json` doesn't list. `esbuild` and `fsevents` are denied
  (`false`): esbuild's binary comes from its `@esbuild/<platform>` package, so the postinstall
  isn't needed. For a new package with a script, decide with `npm approve-scripts <pkg>` (writes a
  pinned `pkg@version` entry) or `npm deny-scripts <pkg>`; list pending ones with
  `npm approve-scripts --allow-scripts-pending`. Don't add `ignore-scripts` to `.npmrc`: it breaks
  `approve-scripts`. Re-check these keys when npm 12 changes the install-script defaults.
- Pinned CI tools: container images by digest (Semgrep, Playwright), downloaded binaries by sha256
  (Gitleaks, Vale), and the Trivy and Syft versions inside their actions. Dependabot bumps
  `@playwright/test` but not the image: a Playwright bump also changes the image tag and digest in
  `ci.yml` and the `e2e` and `smoke` jobs of `deploy.yml`
  (`docker buildx imagetools inspect mcr.microsoft.com/playwright:v<ver>-noble`).
- `deploy.yml` checks the CLI tarball's sha256 and its GitHub build provenance
  (`gh attestation verify`) before it runs the CLI.
- `security.yml` runs zizmor on the workflows (findings in code scanning). Fix a finding, or
  suppress it inline with `# zizmor: ignore[<audit>]` and the reason.

## Gotchas

- `currentPeriod()` computes periods in UTC from the browser's clock, like the CLI's
  `CadencePeriod`, and `formatPeriodRange` prints the window in UTC. Never use local-time getters
  (`getFullYear`, `getDate`, date-fns `format`) for periods: a browser east or west of UTC would
  show another folder near every boundary. The CLI may still take the period from a run clock or
  the HEAD commit time that differs from the moment the form was filled.
- `useCatalog` resets `catalog` to `null` on framework switch; handle the loading state.
- `typescript` aliases the TS 6 API (needed by `typescript-eslint`) and `@typescript/native` is TS
  7, which `tsc -b` runs. Removing the aliases breaks `npm run lint`.
- `shadcn` is not a dependency: it pulls a package with a high advisory that fails `npm audit`.
  Its CSS is vendored at `src/styles/shadcn-tailwind.css`. If `npx shadcn` re-adds the package,
  revert that.
- Ed25519 in Web Crypto is on by default from Chrome 137, Safari 17 and Firefox 129; older
  browsers make `verify.ts` throw `WebCryptoUnsupportedError` and the page shows an upgrade message.
- `tsx` ignores the root `tsconfig.json` for `src/` files (it lists no files), so scripts that import
  `src/` run with `--tsconfig tsconfig.app.json` for the `@/` alias and JSX. The npm scripts do.
- Playwright uses port 4791 and never reuses a running server. If the port is taken, another
  session's suite is running: wait, or set `E2E_PORT`.
