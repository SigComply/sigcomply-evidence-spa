# Browser checks with cmux

How an agent drives this app in a real browser. SigComply maintainers run their agents inside
[cmux](https://cmux.com), a macOS terminal with a built-in browser that the `cmux browser` command
controls from the shell. Any agent harness that can run shell commands can use it.

This file covers the browser itself: setup check, rules, commands and quirks. The repo workflow doc
("Verify in the real product" in `docs/WORKFLOW.md`) says how to start this app and which flows to
drive. This file is identical in every SigComply web app repo; change all of them together.

## Check that you're inside cmux

Run this before the first browser step:

```bash
cmux identify | jq -e '.caller.surface_ref' >/dev/null && cmux browser status
```

Inside a cmux terminal it exits 0 and prints `enabled`. If `cmux` is not found, or the check fails,
or the browser is disabled, stop before the browser step and ask the human to set cmux up:

1. Install cmux: download it from https://cmux.com, or run
   `brew tap manaflow-ai/cmux && brew install --cask cmux`.
2. Open this repo in a cmux terminal and restart the agent session there.
3. If `cmux browser status` prints `disabled`, run `cmux browser enable`.

Until then the browser check is deferred: say so in your report. Don't ask the human to click
through the flow for you instead.

cmux runs only on macOS. A contributor who can't run it drives the same flows with whatever browser
automation they have, and says which one in the report.

## Rules

- Drive the browser yourself. Never ask the human to open a page, click through a flow or read a
  page for you.
- Ask the human only to sign in to a site behind their personal single sign-on. Never type their
  real credentials. The local test accounts in the workflow doc are fine.
- Other agent sessions may be running in other cmux panes, against the same app. Open your own
  surface, and never drive, reload or close a surface you didn't open. Never stop a server you
  didn't start: if the app's port is taken, find out whose server it is and use another port.
- Report in one line what you drove, where, and what you saw. If you couldn't drive it, say so and
  mark the claim deferred or unverified.

## The loop

```bash
# 1. Start the app (see the workflow doc) and wait until it answers.
# 2. Open your own surface. It prints a handle such as "OK surface=surface:34 ..."; keep it.
cmux browser open "$BASE/"
S=surface:34
# 3. Act and check.
cmux browser --surface $S goto "$BASE/some/page"
cmux browser --surface $S wait --selector "#something" --timeout 10
cmux browser --surface $S snapshot --interactive --compact
cmux browser --surface $S screenshot --out "$TMPDIR/shot.png"    # then open the image file
# 4. Tear down what you started: your surface, the server, any test data.
cmux close-surface --surface $S
```

Each shell command may run in a fresh shell, so variables don't carry over. Write the surface handle
and any server PID to a file if a later command needs them.

Element arguments are a CSS selector or a snapshot ref (`eNN`). Refs die on any navigation or DOM
change: take a new snapshot after acting, or add `--snapshot-after` to the action.

## Command reference

Prefix each with `cmux browser --surface $S`.

| Group | Commands |
|---|---|
| Navigate | `goto <url>`, `reload`, `back`, `forward`, `get url`, `get title` |
| Structure | `snapshot --interactive --compact`, `snapshot --selector "form"`, `snapshot --max-depth <n>` |
| Locate and read | `find role button --name "Save"`, `find text "Save"`, `find label/placeholder/testid <t>`, `get text/html/value <sel>`, `get attr <sel> --attr <name>`, `get count <sel>`, `is visible/enabled/checked <sel>` |
| Interact | `click`, `dblclick`, `hover`, `fill <sel> "<text>"` (`""` clears), `type <sel> "<text>"` (key by key), `check`, `uncheck`, `select <sel> <value>`, `press Enter`, `scroll --dy 400`, `scroll-into-view <sel>` |
| Files | `set-input-files --selector "input[type=file]" --file <absolute path>` (repeat `--file` for several) |
| Wait | `wait --selector <sel>`, `wait --text "<t>"`, `wait --load-state complete`, `wait --url-contains "<s>"`; `--timeout` is seconds, `--timeout-ms` milliseconds |
| Debug | `screenshot --out <png>`, `console list`, `errors list`, `eval "<js>"` (an async IIFE works), `dialog accept/dismiss`, `highlight <sel>` |

`cmux browser --help` lists everything.

## Quirks

1. The browser is WebKit (WKWebView), not Chrome. `viewport`, `offline`, `geolocation`, `trace`,
   `screencast`, `network route/requests` and raw `input` return `not_supported`. To see what the
   page requested, read the server log, or list it from the page:
   `eval "performance.getEntriesByType('resource').map(e => e.name)"`.
2. The URL bar and `get url` don't update after a Turbo form submit or a client-side (React
   Router) navigation. Confirm with the server log, the rendered page, or a fresh `goto`.
3. Selectors are plain CSS (`querySelector`). Playwright pseudo-selectors such as `:has-text()`
   throw. Use `find text`, `find role` or a real CSS selector.
4. When a step fails, read `get text body` first, then probe. Check visibility before trusting
   text: hidden validation messages still have text content.
5. On React or Turbo forms, use `fill`. Don't set values with `eval`.
6. Read `console list` and `errors list` when a page misbehaves.
