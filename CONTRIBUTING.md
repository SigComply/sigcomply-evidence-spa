# Contributing to the SigComply Evidence SPA

Thanks for contributing. This is a static, backend-free React + TypeScript
single-page app. [`AGENTS.md`](./AGENTS.md) holds the architecture, cross-repo
contracts and conventions. [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) holds the
verification gate, test layers and deploy model, and
[`docs/TESTING.md`](./docs/TESTING.md) the testing details. Those files are the
source of truth; this page summarizes them.

Outside contributors open a pull request against `main`.

## Security issues

Do **not** open a public issue for a vulnerability. Report it privately (see
[`SECURITY.md`](./SECURITY.md)).

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173, uses the committed catalog JSONs
                   # (the offline fallback: no sigcomply CLI needed)
```

## Before you commit

CI doesn't lint or run the tests, so run the full gate locally:

```bash
npm run lint && npx tsc -b && npm run test && npm run build
```

`npm run build` needs the `sigcomply` CLI on your `PATH`. Without it, run
`npx tsc -b && npx vite build` for the build step.
[`docs/WORKFLOW.md`](./docs/WORKFLOW.md) explains each step and how to check UI
changes in a browser.

## Conventions

The full list is under "Conventions" in [`AGENTS.md`](./AGENTS.md). The ones
contributors hit most:

- Write tests first, as `*.test.ts` files next to the code they test. One logical change per commit,
  subject `<type>: <summary>` (`feat`, `fix`, `refactor`, `perf`, `test`,
  `docs`, `ci`, `chore`).
- Update the docs your change makes wrong in the same commit.
- The form generator handles only user attestations (`declaration` and
  `checklist`). Users upload evidence that already exists as a file straight to
  their bucket, so don't add a form type for it.
- Signature verification uses Web Crypto only. Don't add a JS Ed25519 library.
- `src/lib/verification/canonical.ts` must match the CLI's canonicalization
  byte for byte. A drift silently breaks signature verification.
- Don't hand-edit `src/components/ui/`. Generate it with `npx shadcn add <name>`.

## Cross-repo contracts

The catalog JSON and `EvidenceEnvelope` shapes are shared with
[`sigcomply-cli`](https://github.com/SigComply/sigcomply-cli). See
[`AGENTS.md` → Contracts with Sibling Repos](./AGENTS.md#contracts-with-sibling-repos)
before changing either. A change on one side must land on both.
