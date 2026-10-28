# SigComply Evidence SPA

Two browser tools for [SigComply](https://github.com/SigComply/sigcomply-cli) users, hosted at
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

- A valid signature shows the records match the public key inside the envelope. The CLI makes a
  new key for every file, and anyone can sign an envelope with their own key, so a valid
  signature doesn't prove who signed it. Trust in the files comes from write-once storage of the
  evidence vault.
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

[Apache-2.0](LICENSE).
