# Development Workflow — Agent-Driven SDLC

How engineering actually happens in this repo. **Read this before starting any feature or fix.**
It is the process spine; [CLAUDE.md](../CLAUDE.md) is the always-loaded index, and the
subject-specific docs linked below (e.g. [TESTING.md](TESTING.md)) load on demand.

## The model: one agent runs the SDLC

Every engineering activity here — planning, writing code, writing tests, running the suite,
manual verification in a browser, debugging — is performed by **Claude Code running in the cmux
terminal**. There is no separate human engineer. The human's role is to **direct, monitor, and
verify**: set intent, watch the run, confirm the result.

What to internalize:

- Carry each task **end to end**. Don't hand back a half-finished change for someone to "wire up."
  If a step in the loop below is genuinely skipped, say so explicitly.
- You can verify your own work — the Vitest suite, `tsc -b`, and a real browser driven from the
  terminal. Use them. Don't assert "this should work" when you can observe whether it does.
- This is a **static, backend-free SPA** deployed to GitHub Pages. There is no server, no
  database, no Render deploy, no Sentry — do not import those assumptions from the Rails dashboard
  repo. "Verify" here means *run the dev/preview server and drive the browser*.

Two facts shape every task:

- **Pre-launch.** The product has no users yet. Until public launch, internal work commits
  **directly to `main`**; the push auto-deploys to GitHub Pages (see [Ship](#6-ship)). No PRs, no
  reviews. This flips to a PR + review flow at public launch — this doc gets revised then.
- **No backfills / backward-compat.** There is no released install base and no persisted server
  state (the app writes only to the user's disk and reads committed catalog JSON). Write the code
  you want directly; don't add compatibility shims. **The one exception:** the cross-repo contracts
  with the CLI (see [Cross-repo contracts](#cross-repo-contracts)) must stay in lockstep.

## The loop — implementing a feature or change

For "implement feature X" or "make change Y", work these steps in order. Steps 1 and 5 don't apply
to every task, but **2 → 3 → 4 → 6 → 7 are non-negotiable.**

1. **[Plan / design](#1-plan--design)** — read the relevant CLAUDE.md context section; if it feels complex, stop and ask.
2. **[Write tests first](#2-write-tests-first)** — colocated `*.test.ts`, per [TESTING.md](TESTING.md).
3. **[Implement](#3-implement)** — minimum code to pass.
4. **[Verify locally](#4-verify-locally-the-real-gate)** — `npm run lint`, `npm run test`, `npx tsc -b`, `npm run build`; all clean. **This is the real gate — CI does not run them.**
5. **[Verify in a browser](#5-verify-in-a-browser-ui-changes)** — for any UI change, drive the form→PDF and/or `/verify` flow.
6. **[Update docs](#6-update-docs-definition-of-done)** — guideline **and** context. Not optional.
7. **[Ship](#7-ship)** — commit directly to `main` (pre-launch); Pages auto-deploys.

A change is **not done** until steps 4 and 6 both hold. "Green tests" alone is not done; "docs left
stale" is not done.

---

### 1. Plan / design

Read the CLAUDE.md section that owns the area you're touching (Directory Map, How Data Flows, PDF
Layout, Contracts) **before** writing anything. If the design feels overly complex, that difficulty
is a signal to **pause and ask**, not push through.

Respect the scope guardrails in [CLAUDE.md → Conventions](../CLAUDE.md#conventions): the form
generator is **user-attestations only** (declaration + checklist) — don't add a form type for
evidence that already exists as a file; `/verify` stays **button-free and dep-free** on Web Crypto;
the framework picker stays **non-blocking**. These are architectural, not stylistic.

### 2. Write tests first

TDD. Write the failing test before the implementation. Tests are colocated Vitest files
(`foo.ts` → `foo.test.ts`). What kind of test lives where, the current coverage gap (only the
`/verify` crypto path is tested today), and the Web-Crypto/PDF specifics are all in
[TESTING.md](TESTING.md) — read it before adding tests.

The expectation: **new logic ships with tests.** Pure functions (canonicalization, period math,
path building, metadata strings) are cheap to unit-test and must be. If you touch
`src/lib/verification/canonical.ts`, the byte-for-byte contract test against the CLI reference
fixture must stay green (see [Cross-repo contracts](#cross-repo-contracts)).

### 3. Implement

Write the minimum code to pass the tests. Match the surrounding code's idiom, naming, and comment
density. Use `@/…` imports, not relative `../../`. Never hand-edit `src/components/ui/*` (shadcn
generated — regenerate via `npx shadcn add <name>`). Keep `@react-pdf/renderer` lazy-imported inside
the submit handler.

### 4. Verify locally (the real gate)

**CI does not lint, test, or typecheck** — `deploy.yml` runs `npx vite build` directly (plus a
security suite in `security.yml`). Local is therefore the *only* gate for correctness. Before every
push, run all four and confirm each is clean:

```bash
npm run lint      # eslint . — flat config; the only style gate (no Prettier/Biome)
npm run test      # vitest run — the colocated *.test.ts suite
npx tsc -b        # typecheck — strict project refs; there is no `typecheck` npm script
npm run build     # tsc -b + vite build — catches what dev mode's on-demand transpile hides
```

Notes:

- `npx tsc -b` is the standalone typecheck. `npm run build` also runs it, but run `tsc -b` on its own
  during the inner loop — it's faster than a full Vite build.
- `npm run build` runs the `prebuild` (`fetch-catalogs`) step, which shells out to the `sigcomply`
  CLI. If the CLI isn't on `PATH`, `prebuild` fails. To typecheck/bundle without the CLI, run
  `npx tsc -b && npx vite build` directly (this is exactly what CI's `deploy.yml` does — it relies on
  the committed `public/data/catalogs/*.json`). See [Deploy model](#deploy-model).
- There is **no `format` script.** ESLint is the sole style gate — don't reach for Prettier.

### 5. Verify in a browser (UI changes)

Specs don't catch rendering, routing, download behavior, or the drag-drop verify flow. For anything
user-facing, boot the app and drive a real browser from the terminal via the **cmux browser CLI**
(`/Applications/cmux.app/Contents/Resources/bin/cmux browser …`, Playwright-style):

```bash
npm run dev       # Vite dev server on http://localhost:5173 (uses committed catalog JSON)
# or, to exercise the actual shipped bundle:
npm run build && npm run preview   # serves dist/ — closest to GitHub Pages
```

Exercise the two flows the app exists for:

- **Form → PDF** (`/`, `/evidence/:framework/:evidenceId`): pick a declaration/checklist entry, fill
  the form, submit, confirm `evidence.pdf` downloads and the upload-path screen renders. Open the PDF
  and eyeball the header block + metadata.
- **Verify** (`/verify`): drop a signed `EvidenceEnvelope` JSON (fixtures live in
  `src/lib/verification/__fixtures__/`), confirm the verdict banner shows pass automatically (no
  Verify button), and that tampering with the JSON flips it to fail.

Keep this just-in-time: only spin up the browser when the change has a visible surface. Pure-logic
changes are covered by the Vitest suite. (The cmux browser CLI has quirks — the WKWebView URL bar
doesn't update after client-side navigation; confirm route changes by reading the rendered DOM, not
the address bar.)

### 6. Update docs (definition of done)

**Document-driven development.** Every unit of work updates the docs it touches — part of "done",
not later cleanup. Two doc families, both in scope:

| Family | What it is | Where |
|---|---|---|
| **Development-guideline** ("how we work") | Process, testing, tooling | this file, [TESTING.md](TESTING.md) |
| **Codebase / domain context** ("what the system is") | Role, stack, data flows, PDF layout, cross-repo contracts, conventions, gotchas | [CLAUDE.md](../CLAUDE.md) |

Rule of thumb: if a future agent would be **misled** by a doc after your change, that doc is part of
your change — in the same commit. Added a command? Update the Commands table in CLAUDE.md. Changed
the envelope shape or canonicalization? Update the Contracts table **and** the matching CLI type.
Changed the loop or a gate? Update this file. Prefer updating the nearest existing doc over inventing
a new one; keep CLAUDE.md lean and push detail into a focused doc.

### 7. Ship

**Pre-launch (now): commit directly to `main`.** Once lint, test, `tsc -b`, and build are green (and
the browser check passes for UI work):

- Small **atomic** commits — one logical change each. Format `<type>: <description>`
  (`feat`/`fix`/`refactor`/`test`/`docs`/`chore`), message ending with
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Push to `main`. There is no PR and no review gate for internal work (`main` is not
  branch-protected — intentional for pre-launch).
- The push triggers `deploy.yml` → **GitHub Pages auto-deploys** (see [Deploy model](#deploy-model)).
  Confirm the Pages build is green afterward (`gh run watch` / `gh run list`). Direct-to-main means a
  red build is live-affecting — never knowingly break `main`; fix forward immediately.

**Post-launch (future): open a PR.** After public launch, internal work moves to PRs with review
before merge. **Revise this section when that switch happens** — we are deliberately not building it
now.

---

## Deploy model

GitHub Pages, on push to `main`, via [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

- The deploy job runs **`npx vite build` directly** — it does **not** run `npm run build` and so
  **bypasses the `prebuild`/`fetch-catalogs` step**. It relies entirely on the **committed**
  `public/data/catalogs/*.json`. Consequence: **regenerating catalogs is a manual, commit-it step.**
  Run `npm run fetch-catalogs` locally (needs the `sigcomply` CLI on `PATH`), commit the updated
  JSON, and push — otherwise the deployed site serves stale catalogs. The build alone will never
  refresh them.
- `deploy.yml` also runs `npm audit --audit-level=high` as a hard pre-deploy gate. It does **not**
  run lint, test, or typecheck — those are your local responsibility (see [Verify locally](#4-verify-locally-the-real-gate)).
- [`.github/workflows/security.yml`](../.github/workflows/security.yml) runs a broad security suite
  (npm-audit, OSV, CodeQL, Semgrep, Trivy, Retire.js, secret scan, ZAP, SBOM) on push, PR, and
  weekly. Its `npm-audit` and `secret-scan` jobs are hard gates; the rest are advisory.
- `VITE_BASE_PATH` is set to `/<repo-name>/` in the Pages build (the app is served from a subpath).
  Locally it defaults to `/`.
- **Preview a production build locally** with `npm run preview` after `npm run build` — this serves
  the actual `dist/` bundle and is the closest local approximation to the deployed site.

## Cross-repo contracts

The CLI repo (`../sigcomply-cli/`) is the **source of truth** for the two shared contracts; verify
against it, don't guess. Break either and the app silently misbehaves:

1. **EvidenceEnvelope shape + canonicalization** — `src/types/envelope.ts` and
   `src/lib/verification/canonical.ts` must mirror the CLI's `internal/core/envelope.go` and
   `internal/sign` byte-for-byte. The contract test in `canonical.test.ts` checks the SPA output
   against a committed CLI-produced reference fixture. If it drifts, `/verify` rejects valid
   signatures. Change one side → change the other in lockstep.
2. **Framework list + catalog shape** — two parallel hardcoded lists must stay in sync when adding a
   framework: `frameworks` in `public/config.json` (what the UI exposes) and `frameworks` in
   `scripts/fetch-catalogs.ts` (what gets pre-fetched). The catalog JSON shape mirrors the CLI's
   `ManualCatalogExport()` → `src/types/catalog.ts`.

Full contract table: [CLAUDE.md → Contracts with Sibling Repos](../CLAUDE.md#contracts-with-sibling-repos).

## Debugging

No Sentry, no server logs — this is a client-side app. To debug:

1. **Reproduce as a failing test** where possible (canonicalization, period, path, metadata bugs are
   all pure functions — turn the bug into a `*.test.ts` case first).
2. **For UI/runtime bugs**, reproduce in the browser (`npm run dev`) and read the browser console via
   the cmux browser CLI. Verify flow bugs often come from envelope/canonicalization drift — diff the
   SPA's canonical bytes against the CLI reference fixture.
3. **CI (Pages) failures:** `gh run list` → `gh run view <id> --log-failed`. The build reproduces
   locally with `npx vite build` (the exact command CI runs).
4. Fix → re-run [Verify locally](#4-verify-locally-the-real-gate) → update docs → commit.

## Related

- [CLAUDE.md](../CLAUDE.md) — always-loaded index: role, stack, data flows, PDF layout, contracts, conventions, gotchas
- [TESTING.md](TESTING.md) — Vitest layout, coverage gap, Web-Crypto/PDF specifics, commands
