# SigComply Evidence SPA

[SigComply](https://github.com/SigComply/sigcomply-cli) runs in your GitHub or GitLab pipeline,
checks your cloud and SaaS configuration against SOC 2 and ISO 27001, and signs the evidence into
storage you own.

Two browser tools for SigComply users, hosted at
**https://sigcomply.github.io/sigcomply-evidence-spa/**:

- **Evidence forms.** For manual-evidence entries that are a declaration or a checklist, fill a
  form and download the result as `evidence.pdf`. You upload it yourself to the manual-evidence
  folder in your evidence storage, and the SigComply CLI collects it on its next scheduled run
  (the CI workflow `sigcomply init-ci` sets up runs daily by default).
- **Envelope verifier** (`/verify`). An auditor loads a signed evidence file (an `EvidenceEnvelope`
  JSON that the CLI writes to the customer's evidence storage) and checks its Ed25519 signature,
  and optionally the hash of a PDF.

Both tools run entirely in the browser. The app has no backend: it submits nothing, uploads
nothing and needs no account.

You don't need this app. The SigComply CLI accepts any PDF or supported image you upload to the
right folder. The forms are a shortcut for the entries a person can complete by clicking.

## Use it

Step-by-step instructions are in the CLI docs:

- [Collect manual evidence](https://github.com/SigComply/sigcomply-cli/blob/main/docs/guides/manual-evidence.md):
  where the CLI looks for files, folder names per period, and when to use the forms. It covers
  every framework.
- [Verify signed evidence](https://github.com/SigComply/sigcomply-cli/blob/main/docs/guides/verify-evidence.md):
  how an auditor checks an envelope, including with `/verify`.

### Check the upload path before you upload

After download, the form shows an upload path in your evidence storage (the bucket or local folder
your `manual.pdf` source reads), such as `manual/code_of_conduct_acknowledgment/2026/evidence.pdf`. The hosted site always shows the prefix `manual/`, the
CLI's default `prefix` for manual evidence (the `manual.pdf` source in `.sigcomply.yaml`). The
shown path is wrong for your project when:

- your `manual.pdf` source sets a different `prefix`, or
- your project's period calendar is `fiscal_year` or `custom`.

In those cases, run `sigcomply evidence due --all` in your project. For each manual entry whose
folder for the current period is empty, it prints the folder to upload to. Without `--all` it
lists only the entries whose period ends within 30 days, which leaves out a yearly entry for most
of the year.

The CLI merges every file in the folder into one PDF. If you upload a corrected copy, delete the
earlier file from the folder.

### What `/verify` can and can't check

- A valid signature shows the file is self-consistent: its records match the public key inside
  the envelope. The page shows that key's SHA-256 fingerprint. The CLI makes a new key for every
  file, and anyone can sign an envelope with their own key, so a valid signature doesn't show who
  signed it. Trust in the files comes from write-once storage of the evidence vault.
- For a manual evidence folder, the page shows the CLI's recorded result: whether a file was in
  the folder, whether it was uploaded within the period or its grace window, and whether it passed
  the CLI's file checks. It shows these results only when the signature is valid, and doesn't
  re-check the folder.
- When a folder holds several files, the CLI merges them into one PDF, hashes it, and stores it in
  the run folder as `policies/<policy_id>/attachments/<evidence_id>.pdf`. Drop that stored PDF
  (or, for a folder that held one PDF, the original upload) to match the envelope's `file_hash`.
  The PDF check also runs only after the signature checks out, because only then does anything
  vouch for the hash.
- For vendor evidence collected into one folder per vendor, the page lists each vendor's result
  as the CLI recorded it, and a PDF you drop in is compared with every vendor's hash. The page
  shows these results; it doesn't re-check the vendor folders.

[SECURITY.md](SECURITY.md#what-verify-proves-and-does-not) has the full list.

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
| `frameworks` | Framework IDs offered in the picker (`soc2`, `iso27001`). Each needs `data/catalogs/<id>.json`; change the list before you build, so `npm run build` creates them. |
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

The SPA is free to use and its source is public, but it is source-available, not open source: it
is licensed under the [Elastic License 2.0](LICENSE), like the SigComply CLI.

You can use, copy, modify and redistribute it, including at work, at no cost. You may not:

- provide it to others as a hosted or managed service that gives them a substantial set of its
  features or functionality;
- move, change, disable or circumvent its license key functionality, or remove or obscure a
  feature that a license key protects;
- alter, remove or obscure SigComply's licensing, copyright or other notices.

Anyone you give a copy to must also get the license terms, and modified copies must carry a
prominent notice that you changed them.

Code published before the license change, including the v0.0.1 tag, was released under
Apache-2.0 and remains available under it. See [NOTICE](NOTICE). For other licensing terms,
contact support@sigcomply.com.
