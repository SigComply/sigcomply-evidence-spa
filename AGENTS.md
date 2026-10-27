# SigComply Evidence SPA: agent instructions

Personal, machine-local instructions live in `AGENTS.local.md` (gitignored; may not exist). Read
it if it exists; it adds to and overrides this file. @AGENTS.local.md

SigComply is a compliance engine and evidence collector that runs in the customer's CI (the
`sigcomply-cli` repo). For the product and the other repos, read the workspace `../AGENTS.md` if it
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
10. Run the full local gate before every commit. No CI workflow runs ESLint or Vitest.
11. Nothing leaves the browser. Never add a backend, an upload, analytics, a third-party script or
    a network call that sends user data anywhere.
12. Change a CLI contract (table below) only together with the matching `sigcomply-cli` change.
13. Drive every change that can alter what the app renders or does in a real browser, again after
    review fixes (`docs/WORKFLOW.md` "Verify in the real product"). The browser is cmux
    (`docs/CMUX_BROWSER.md`). Run its setup check first; if you aren't inside cmux, ask the human
    to set it up rather than to click through the flow for you.

## Commands

| Purpose | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 24 (`.nvmrc`). `npm install` needs npm >= 11 (see Gotchas). |
| Dev server | `npm run dev` | http://localhost:5173, uses the committed catalogs; no CLI needed. |
| Unit tests | `npm run test` | `vitest run`. Node environment; a component test opts into jsdom per file. |
| Coverage | `npm run test:coverage` | Fails below the floors in `vite.config.ts`. Report in `coverage/`. |
| Lint | `npm run lint` | `eslint .`. No formatter. |
| Typecheck | `npx tsc -b` | No npm script. |
| Build | `npm run build` | `prebuild` runs `fetch-catalogs` (needs `sigcomply` on `PATH`, fatal on any error), then `tsc -b && vite build`. |
| Build without the CLI | `npx tsc -b && npx vite build` | Skips `prebuild`; bundles the committed catalogs. |
| Refresh catalogs | `npm run fetch-catalogs` | Rewrites `public/data/catalogs/*.json` from the local CLI. |
| Preview the bundle | `npm run preview` | Serves `dist/`. |
| Full gate | `npm run lint && npx tsc -b && npm run test && npm run build` | Before every commit. |

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
`src/config/runtime.ts`; catalog prefetch in `scripts/fetch-catalogs.ts`.

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

Rules:

- Nothing checks the TypeScript catalog types against the Go struct. When either changes, compare
  field by field (JSON tags and `omitempty` against optional `?`).
- The signed bytes are `canonicalJSON({format_version, produced_at, records})`: sorted keys, no
  whitespace, `\u` escapes for control characters, U+2028 and U+2029 only, no HTML escaping, and
  numbers kept as their source lexeme (`parseJSONPreservingNumbers`). Pass the original envelope
  text to `verifyEnvelopeSignature`, never a re-serialised copy, or integers above 2^53 break.
- Refresh crypto fixtures in `src/lib/verification/__fixtures__/` from the CLI, never by hand.
- `Verify.tsx` refuses any `format_version` other than `ENVELOPE_FORMAT_VERSION`.
- The period agreement holds only for the CLI's default `calendar_quarter` calendar. The SPA cannot
  see a project's `fiscal_year` or `custom` calendar; those users take the path from
  `sigcomply evidence due`.
- The shown prefix comes from this deployment's `config.json`. It must equal the `prefix` of the
  project's `manual.pdf` source. `computeUploadPath` adds the trailing slash; the CLI concatenates
  the prefix as written.

## Verifier limits (keep the UI copy and SECURITY.md honest)

- A valid signature proves the records match the key embedded in the envelope, not who signed.
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
- New framework: add it to `public/config.json`, then `npm run fetch-catalogs`.
- `localStorage` keys use the `sigcomply:` prefix and are never compliance status.
- Imports use `@/...`. Plain `fetch`; no data-fetching library.
- Lazy-load `@react-pdf/renderer` inside the submit handler (`useEvidenceForm`).
- Crypto stays in `crypto.subtle`. No JS Ed25519 library, no polyfill.
- `FrameworkPickerDialog` opens only when `frameworks.length > 1` and nothing is stored, stays
  dismissible, and never gates `/verify`.
- `/verify` verifies on parse with no button, and adds no JSON editor dependency.

## Gotchas

- `currentPeriod()` uses the browser's local clock; the CLI uses UTC and the HEAD commit time. Near
  a period boundary a daily or weekly entry can land in a different folder.
- `useCatalog` resets `catalog` to `null` on framework switch; handle the loading state.
- `npm install` crashes on npm 10 (`Cannot read properties of null (reading 'edgesOut')`) because
  `typescript` is an npm alias. `npm ci` works on npm 10. Use `npx npm@11 install` to re-resolve.
- `typescript` aliases the TS 6 API (needed by `typescript-eslint`) and `@typescript/native` is TS
  7, which `tsc -b` runs. Removing the aliases breaks `npm run lint`.
- `shadcn` is not a dependency: it pulls a package with a high advisory that fails `npm audit`.
  Its CSS is vendored at `src/styles/shadcn-tailwind.css`. If `npx shadcn` re-adds the package,
  revert that.
- Ed25519 in Web Crypto is missing in older browsers; `verify.ts` throws
  `WebCryptoUnsupportedError` and the page shows an upgrade message.
