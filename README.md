# SigComply Evidence SPA

[SigComply](https://github.com/SigComply/sigcomply-cli) runs in your GitHub or GitLab pipeline,
checks your cloud and SaaS configuration against SOC 2 and ISO 27001, and signs the evidence into
storage you own.

Two browser tools for SigComply users, hosted at
<https://sigcomply.github.io/sigcomply-evidence-spa/>:

| Tool | For | What it does |
|---|---|---|
| Evidence forms (`/`) | Whoever signs off a declaration or checklist | Fill in a form and download `evidence.pdf`. You upload it to your manual evidence folder, and the CLI collects it on its next scheduled run. |
| Verifier (`/verify`) | Auditors | Check the signature on an evidence file from the vault, and optionally that a PDF matches the hash in it. |

Both run in your browser. The app has no backend and needs no account. Nothing you enter or drop
leaves your browser.

The forms are optional. The CLI accepts any PDF or supported image in the right folder, and the
forms are a quick way to produce a declaration or checklist.

## Use it

Step-by-step instructions are in the CLI docs:

- [Collect manual evidence](https://github.com/SigComply/sigcomply-cli/blob/main/docs/guides/manual-evidence.md):
  where the CLI looks for files, folder names per period, and when to use the forms.
- [Verify signed evidence](https://github.com/SigComply/sigcomply-cli/blob/main/docs/guides/verify-evidence.md):
  how an auditor checks an envelope, including with `/verify`.

The hosted form shows the upload folder for the default prefix `manual/` and the default calendar. If
your `manual.pdf` source sets another `prefix`, or your project uses a `fiscal_year` or `custom`
calendar, run `sigcomply evidence due --all` for the exact folders.

## What a valid signature means

A valid signature shows the file is self-consistent. Its records match the public key inside it.
The CLI makes a new key for every file, so a valid signature doesn't show who signed it.
Write-once storage for the vault stops someone replacing a file and signing it again.
[SECURITY.md](SECURITY.md#what-verify-proves-and-does-not) lists everything `/verify` does and
doesn't check.

## Self-host

The build output in `dist/` is static HTML, JS and CSS; serve it from any static host.

```bash
npm ci
npm run build      # needs the sigcomply CLI on PATH to refresh the catalogs
```

`npm run build` runs `sigcomply evidence catalog` for each framework in `public/config.json`.
Install the CLI from its [releases](https://github.com/SigComply/sigcomply-cli/releases). Without
the CLI, `npx tsc -b && npx vite build` bundles the catalogs committed in `public/data/catalogs/`.

To serve the app under a sub-path, set `VITE_BASE_PATH=/<sub-path>/` when you build. Serve
`index.html` for unknown paths so `/verify` resolves.

`public/config.json` sets what the app shows. The build copies it to `dist/config.json`, which you
can replace on your host without a rebuild:

```json
{
  "frameworks": ["soc2", "iso27001"],
  "storage": { "show_upload_path": true, "prefix": "manual/" }
}
```

| Key | Effect |
|---|---|
| `frameworks` | Framework IDs offered in the picker (`soc2`, `iso27001`). Change the list before you build: `npm run build` creates `data/catalogs/<id>.json` for each. |
| `storage.prefix` | First segment of the upload path the form shows. Set it to the `prefix` of your `manual.pdf` source. Default `manual/`. |
| `storage.show_upload_path` | `false` hides the prefix and shows only `<evidence id>/<period>/evidence.pdf`. Default `true`. |

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173, uses the committed catalogs
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the checks to run before a pull request. Report
vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

The SPA is source-available under the [Elastic License 2.0](LICENSE), like the SigComply CLI. You
can use, copy, modify and redistribute it at no cost, including at work. You may not:

- provide it to others as a hosted or managed service that gives them a substantial set of its
  features or functionality;
- move, change, disable or circumvent its license key functionality, or remove or obscure a
  feature that a license key protects;
- alter, remove or obscure SigComply's licensing, copyright or other notices.

Anyone you give a copy to must also get the license terms, and modified copies must carry a
prominent notice that you changed them.

Code published before the license change, including the v0.0.1 tag, remains available under
Apache-2.0 ([NOTICE](NOTICE)). For other licensing terms, contact support@sigcomply.com.
