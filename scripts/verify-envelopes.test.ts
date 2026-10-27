import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, verifyDirectory } from "./verify-envelopes.ts";

const fixtures = join(import.meta.dirname, "..", "src", "lib", "verification", "__fixtures__");
const fx = (name: string) => join(fixtures, name);

let root: string;

// Builds a run folder the way the CLI lays it out
// (sigcomply-cli docs/architecture/05-vault-layout.md).
function put(rel: string, content: string | Buffer) {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content);
}
function putFixture(rel: string, name: string) {
  put(rel, readFileSync(fx(name)));
}
const run = "soc2/2026-Q2/run_20260523T140000Z_a3f8b2c1";

function vault() {
  put(`${run}/manifest.json`, JSON.stringify({ schema_version: "run.v1", file_hashes: {}, signature: {} }));
  put(`${run}/summary.json`, JSON.stringify({ schema_version: "summary.v2", policies: [] }));
  put(`${run}/policies/p.mfa/result.json`, JSON.stringify({ PolicyID: "p.mfa" }));
  putFixture(`${run}/policies/p.mfa/envelopes/user_record__aws.iam.json`, "sample-envelope-v1.json");
  putFixture(`${run}/policies/p.big/envelopes/x__y.json`, "sample-envelope-v1-bignum.json");
  putFixture(
    `${run}/policies/p.review/envelopes/signed_document__manual.pdf_access_review_quarterly.json`,
    "sample-envelope-v1-manual.json",
  );
  // The manual fixture's file_hash is the SHA-256 of zero bytes.
  put(`${run}/policies/p.review/attachments/access_review_quarterly.pdf`, "");
  putFixture(
    `${run}/policies/p.vendor/envelopes/signed_document__manual.pdf_vendor_assurance.json`,
    "sample-envelope-v1-fanout.json",
  );
  for (const m of ["acme_cloud", "globex_crm"]) {
    putFixture(
      `${run}/policies/p.vendor/attachments/vendor_assurance.${m}.pdf`,
      `sample-envelope-v1-fanout.${m}.pdf`,
    );
  }
  put("state/soc2/policies/p.mfa.json", JSON.stringify({ last_run: "x" }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verify-envelopes-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("verifyDirectory", () => {
  it("verifies every envelope in a run folder, PDFs included, and skips other JSON", async () => {
    vault();
    const r = await verifyDirectory(root, { requireAttachments: true });
    expect(r).toMatchObject({ ok: true, verified: 4, failed: 0 });
    const out = r.lines.join("\n");
    expect(out).toContain(
      `OK   ${run}/policies/p.mfa/envelopes/user_record__aws.iam.json: signature valid, 1 record`,
    );
    expect(out).toMatch(/OK .*p\.vendor.*pdf match Acme Cloud Platform \(acme_cloud\), pdf match .*\(globex_crm\)/);
    expect(out).toMatch(/OK .*p\.review.*pdf match access_review_quarterly/);
    expect(out).toContain("4 envelope(s): 4 verified, 0 failed; 4 other JSON file(s) skipped");
  });

  it("fails a tampered record", async () => {
    vault();
    const p = join(root, run, "policies/p.mfa/envelopes/user_record__aws.iam.json");
    writeFileSync(p, readFileSync(p, "utf-8").replace('"aws.iam"', '"aws.iaM"'));
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(
      /FAIL .*user_record__aws\.iam\.json: Signature does not match/,
    );
  });

  it("fails a bignum envelope whose 64-bit integer was rounded", async () => {
    vault();
    const p = join(root, run, "policies/p.big/envelopes/x__y.json");
    writeFileSync(p, readFileSync(p, "utf-8").replace("9223372036854775807", "9223372036854775808"));
    const r = await verifyDirectory(root);
    expect(r.failed).toBe(1);
  });

  it("fails a swapped attachment", async () => {
    vault();
    copyFileSync(
      fx("sample-envelope-v1-fanout.globex_crm.pdf"),
      join(root, run, "policies/p.vendor/attachments/vendor_assurance.acme_cloud.pdf"),
    );
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/FAIL .*p\.vendor.*pdf hash mismatch for Acme Cloud Platform \(acme_cloud\)/);
  });

  it("notes a missing attachment, and fails on it when attachments are required", async () => {
    putFixture("envelopes/m.json", "sample-envelope-v1-manual.json");
    const lax = await verifyDirectory(root);
    expect(lax.ok).toBe(true);
    expect(lax.lines[0]).toMatch(/no attachment for access_review_quarterly/);
    const strict = await verifyDirectory(root, { requireAttachments: true });
    expect(strict.ok).toBe(false);
  });

  it("fails a broken file under envelopes/ instead of skipping it", async () => {
    put("policies/p/envelopes/broken.json", "{not json");
    put("policies/p/envelopes/v2.json", readFileSync(fx("sample-envelope-v1.json"), "utf-8").replace('"envelope.v1"', '"envelope.v2"'));
    const r = await verifyDirectory(root);
    expect(r.failed).toBe(2);
    expect(r.lines.join("\n")).toMatch(/FAIL .*broken\.json: Invalid JSON/);
    expect(r.lines.join("\n")).toMatch(/FAIL .*v2\.json: Unsupported envelope format_version/);
  });

  it("fails a bad signature block", async () => {
    const env = JSON.parse(readFileSync(fx("sample-envelope-v1.json"), "utf-8"));
    env.signature.public_key = "AAAA";
    put("loose.json", JSON.stringify(env));
    const r = await verifyDirectory(root);
    expect(r.lines.join("\n")).toMatch(/FAIL loose\.json: Ed25519 public key must be 32 bytes/);
  });

  it("is not ok when no envelope is found", async () => {
    put("summary.json", "{}");
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.at(-1)).toMatch(/no evidence envelopes found/);
  });
});

describe("main", () => {
  it("exits 0 for a good vault and 1 for an empty or missing directory", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vault();
    expect(await main([root, "--require-attachments"])).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^4 envelope\(s\)/));
    const empty = mkdtempSync(join(tmpdir(), "verify-empty-"));
    expect(await main([empty])).toBe(1);
    rmSync(empty, { recursive: true });
    expect(await main([join(root, "nope")])).toBe(1);
  });
});
