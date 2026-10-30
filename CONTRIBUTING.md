# Contributing

The app is a static React and TypeScript single-page app with no backend. Open a pull request
against `main`.

Report a security issue privately as described in [`SECURITY.md`](./SECURITY.md), not in a public
issue.

## Licensing your contribution

The SPA is licensed under the [Elastic License 2.0](./LICENSE). By opening a pull request or
otherwise submitting a contribution, you agree that:

- you wrote it, or have the right to submit it under these terms;
- it is licensed under the Elastic License 2.0;
- you grant SigComply a perpetual, worldwide, royalty-free, irrevocable license to use, modify,
  sublicense and distribute your contribution under any terms, including commercial ones.

You keep the copyright in your contribution. Earlier contributions were made under Apache-2.0;
see [`NOTICE`](./NOTICE).

## Set up

Use the Node version in `.nvmrc` (24.22.2) and the npm it ships. `npm ci` refuses Node older than
24.22 or npm older than 11.18.

```bash
npm ci
npm run dev        # http://localhost:5173, uses the committed catalogs (no sigcomply CLI needed)
```

`.npmrc` rejects package versions published less than 7 days ago, git and URL dependencies, and
install scripts that `allowScripts` in `package.json` doesn't list. A new dependency must pass
those checks; say in the pull request if it needs an install script.

## Run the checks before you commit

CI runs the same checks on every push and pull request; run them locally first. Install the test
browsers once with `npx playwright install chromium webkit`.

```bash
npm run lint && npx tsc -b && npm run test:coverage && npm run build && npm run test:e2e
```

`npm run build` needs the `sigcomply` CLI on your `PATH` to refresh the catalogs. Without it, run
`npx tsc -b && npx vite build` for the build step. For a change you can see in the app, also try
it in a browser (`npm run dev`).

## Conventions

- Write tests first, as `*.test.ts` files next to the code they test. A change to a page flow
  also needs a Playwright spec in `e2e/`.
- One logical change per commit, subject `<type>: <summary>` (`feat`, `fix`, `refactor`, `perf`,
  `test`, `docs`, `ci`, `chore`).
- Update the docs your change makes wrong in the same commit.
- The forms cover only declarations and checklists. Evidence that already exists as a file is
  uploaded directly, so don't add a form type for it.
- The app sends nothing anywhere. Don't add a network call, upload, analytics or third-party
  script.
- Signature verification uses Web Crypto only. Don't add a JS Ed25519 library.
- Don't hand-edit `src/components/ui/`. Generate it with `npx shadcn@latest add <name>`.

## Changes shared with the CLI

The catalog JSON, upload path, period keys, `EvidenceEnvelope` shape, canonical JSON, and signature
scheme are shared with [`sigcomply-cli`](https://github.com/SigComply/sigcomply-cli). A change to
one of them needs the matching CLI change. The table in
[`AGENTS.md`](./AGENTS.md#contracts-with-sigcomply-cli) lists the files on each side.
