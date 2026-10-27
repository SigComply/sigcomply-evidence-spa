import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { main, verifyDirectory } from "./verify-envelopes.ts";
import { canonicalJSON } from "../src/lib/verification/canonical.ts";

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

// --- Signing the way the CLI does, with keys made here -------------------

interface Key {
  privateKey: KeyObject;
  /** base64 of the raw 32-byte public key, as the CLI writes it. */
  b64: string;
}

function newKey(): Key {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { privateKey, b64: raw.toString("base64") };
}

function fingerprint(k: Key): string {
  return createHash("sha256").update(Buffer.from(k.b64, "base64")).digest("hex").slice(0, 16);
}

function signBlock(key: Key, signedBytes: string) {
  return {
    algorithm: "ed25519",
    public_key: key.b64,
    value: sign(null, Buffer.from(signedBytes, "utf-8"), key.privateKey).toString("base64"),
  };
}

/** The basic fixture's content, re-signed with `key` (optionally edited). */
function envelopeSignedBy(key: Key, edit: (text: string) => string = (t) => t): string {
  const env = JSON.parse(edit(readFileSync(fx("sample-envelope-v1.json"), "utf-8")));
  const { format_version, produced_at, records } = env;
  const signedBytes = canonicalJSON({ format_version, produced_at, records });
  return JSON.stringify({ format_version, produced_at, records, signature: signBlock(key, signedBytes) });
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));
}

const sha256 = (b: Buffer) => "sha256:" + createHash("sha256").update(b).digest("hex");

/**
 * Writes <run>/manifest.json over every other file in the run folder, the
 * way the CLI does (orchestrator.writeManifest): fields in Go struct order,
 * HTML characters escaped by json.Marshal, and the signature over the
 * canonical JSON of every field except signature. The canonical form is
 * built here by hand (sorted keys, no spaces) rather than with canonicalJSON,
 * so the test does not grade the verifier with its own encoder.
 */
function writeManifest(key: Key, runDir = run, edit?: (m: Record<string, unknown>) => void) {
  const dir = join(root, runDir);
  const hashes: Record<string, string> = {};
  for (const f of filesUnder(dir).filter((f) => f !== "manifest.json").sort()) {
    hashes[f] = sha256(readFileSync(join(dir, f)));
  }
  const exceptions = [{ policy_id: "p.mfa", reason: "R&D <legacy>", state: "waived" }];
  const signedBytes =
    `{"completed_at":"2026-05-23T14:01:42Z","exceptions_applied":${JSON.stringify(exceptions)},` +
    `"file_hashes":${JSON.stringify(hashes)},"framework":"soc2","period_id":"2026-Q2",` +
    `"run_id":"a3f8b2c1-9d4e-4b23-8f7a-1e5c2d8a9b0f","schema_version":"run.v1",` +
    `"started_at":"2026-05-23T14:00:00Z"}`;
  const m: Record<string, unknown> = {
    schema_version: "run.v1",
    run_id: "a3f8b2c1-9d4e-4b23-8f7a-1e5c2d8a9b0f",
    framework: "soc2",
    period_id: "2026-Q2",
    started_at: "2026-05-23T14:00:00Z",
    completed_at: "2026-05-23T14:01:42Z",
    file_hashes: hashes,
    exceptions_applied: [{ policy_id: "p.mfa", state: "waived", reason: "R&D <legacy>" }],
    signature: signBlock(key, signedBytes),
  };
  edit?.(m);
  const goJson = JSON.stringify(m)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  put(`${runDir}/manifest.json`, goJson);
}

/** A run folder with a manifest signed by `key`. */
function signedVault(key = newKey()): Key {
  vault();
  rmSync(join(root, run, "manifest.json"));
  writeManifest(key);
  return key;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verify-envelopes-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("verifyDirectory", () => {
  it("verifies the manifest and every envelope in a run folder, PDFs included", async () => {
    const key = signedVault();
    const r = await verifyDirectory(root, { requireAttachments: true });
    expect(r.lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(r).toMatchObject({ ok: true, verified: 4, failed: 0 });
    const out = r.lines.join("\n");
    expect(out).toContain(
      `OK   ${run}/policies/p.mfa/envelopes/user_record__aws.iam.json: signature valid, 1 record`,
    );
    expect(out).toMatch(/OK .*p\.vendor.*pdf match Acme Cloud Platform \(acme_cloud\), pdf match .*\(globex_crm\)/);
    expect(out).toMatch(/OK .*p\.review.*pdf match access_review_quarterly/);
    expect(out).toContain(
      `OK   ${run}/manifest.json: signature valid (key ${fingerprint(key)}), 9 files match file_hashes`,
    );
    // Other JSON is listed, not silently ignored.
    expect(out).toContain(`SKIP ${run}/summary.json: not an evidence envelope`);
    expect(out).toContain("SKIP state/soc2/policies/p.mfa.json: not an evidence envelope");
    expect(r.lines.at(-1)).toBe(
      "1 manifest(s): 1 verified, 0 failed; 4 envelope(s): 4 verified, 0 failed; 3 other JSON file(s) skipped",
    );
  });

  // __fixtures__/cli-run/ was written by the CLI's own code: sign.Manifest,
  // then json.Marshal as recordingVault.PutJSON does (HTML characters
  // escaped, a U+2028, a non-UTC time, nanoseconds), from a throwaway Go test
  // run against sigcomply-cli with `go test -overlay`. It has no envelopes.
  it("verifies a manifest signed and written by the CLI's Go code", async () => {
    cpSync(join(fixtures, "cli-run"), join(root, run), { recursive: true });
    const r = await verifyDirectory(root);
    expect(r.lines[0]).toBe(
      `OK   ${run}/manifest.json: signature valid (key f647819de862080a), 2 files match file_hashes`,
    );
    put(`${run}/summary.json`, readFileSync(join(fixtures, "cli-run/summary.json"), "utf-8") + " ");
    const tampered = await verifyDirectory(root);
    expect(tampered.lines[0]).toBe(`FAIL ${run}/manifest.json: hash mismatch: summary.json`);
  });

  it("fails a run whose manifest is missing an envelope that was deleted", async () => {
    signedVault();
    unlinkSync(join(root, run, "policies/p.mfa/envelopes/user_record__aws.iam.json"));
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain(
      `FAIL ${run}/manifest.json: missing on disk: policies/p.mfa/envelopes/user_record__aws.iam.json`,
    );
  });

  it("fails an envelope re-signed with another key, though its own signature is valid", async () => {
    signedVault();
    const p = `${run}/policies/p.mfa/envelopes/user_record__aws.iam.json`;
    put(p, envelopeSignedBy(newKey(), (t) => t.replace('"mfa_enabled": false', '"mfa_enabled": true')));
    const r = await verifyDirectory(root);
    const out = r.lines.join("\n");
    expect(out).toMatch(new RegExp(`OK   ${p}: signature valid`));
    expect(out).toContain(`FAIL ${run}/manifest.json: hash mismatch: policies/p.mfa/envelopes/user_record__aws.iam.json`);
    expect(r.ok).toBe(false);
  });

  it("fails a file added to a run after the manifest was signed", async () => {
    signedVault();
    put(`${run}/policies/p.mfa/envelopes/extra__x.json`, envelopeSignedBy(newKey()));
    const r = await verifyDirectory(root);
    expect(r.lines.join("\n")).toContain(
      `FAIL ${run}/manifest.json: not in file_hashes: policies/p.mfa/envelopes/extra__x.json`,
    );
    expect(r.ok).toBe(false);
  });

  it("fails a manifest whose file_hashes were edited without re-signing", async () => {
    const key = newKey();
    vault();
    rmSync(join(root, run, "manifest.json"));
    writeManifest(key, run, (m) => {
      (m.file_hashes as Record<string, string>)["summary.json"] = sha256(Buffer.from("other"));
    });
    const r = await verifyDirectory(root);
    expect(r.lines.join("\n")).toMatch(
      new RegExp(`FAIL ${run}/manifest.json: Signature does not match`),
    );
    expect(r.ok).toBe(false);
  });

  it.each<[string, (m: Record<string, unknown>) => void, RegExp]>([
    ["an unknown schema", (m) => (m.schema_version = "run.v2"), /unsupported schema_version "run\.v2"/],
    ["no file_hashes", (m) => delete m.file_hashes, /file_hashes: expected an object/],
    ["a path outside the run", (m) => ((m.file_hashes as Record<string, string>)["../x"] = "sha256:00"), /file_hashes: unsafe path "\.\.\/x"/],
    ["no signature", (m) => delete m.signature, /signature: expected an object/],
  ])("fails a manifest with %s", async (_n, edit, want) => {
    vault();
    rmSync(join(root, run, "manifest.json"));
    writeManifest(newKey(), run, edit);
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.find((l) => l.includes("manifest.json"))).toMatch(want);
  });

  it("fails an unparseable manifest", async () => {
    vault();
    put(`${run}/manifest.json`, "{");
    const r = await verifyDirectory(root);
    expect(r.lines.join("\n")).toMatch(new RegExp(`FAIL ${run}/manifest.json: Invalid JSON|FAIL ${run}/manifest.json: .*JSON`));
  });

  it("fails envelopes outside a run folder with a manifest, unless told not to require one", async () => {
    putFixture("policies/p/envelopes/a.json", "sample-envelope-v1.json");
    const strict = await verifyDirectory(root);
    expect(strict.ok).toBe(false);
    expect(strict.lines[0]).toBe(
      "FAIL policies/p/envelopes/a.json: signature valid, 1 record, but no manifest.json covers it",
    );
    const lax = await verifyDirectory(root, { requireManifest: false });
    expect(lax.ok).toBe(true);
  });

  it("fails a symlink instead of following it", async () => {
    signedVault();
    const target = join(root, run, "policies/p.mfa/envelopes/user_record__aws.iam.json");
    symlinkSync(target, join(root, "linked.json"));
    symlinkSync(join(root, run, "policies"), join(root, "linked-dir"));
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines).toContain("FAIL linked.json: symlink, not followed");
    expect(r.lines).toContain("FAIL linked-dir: symlink, not followed");
    expect(r.verified).toBe(4);
  });

  it("checks every key against --public-key and reports the mismatches", async () => {
    const key = newKey();
    vault();
    rmSync(join(root, run, "manifest.json"));
    // One envelope signed by the pinned key; the fixtures carry their own.
    put(`${run}/policies/p.mfa/envelopes/user_record__aws.iam.json`, envelopeSignedBy(key));
    writeManifest(key);
    const r = await verifyDirectory(root, { publicKey: key.b64 });
    const out = r.lines.join("\n");
    expect(r.lines[0]).toBe(`pinned public key ${fingerprint(key)}`);
    expect(out).toMatch(new RegExp(`OK   ${run}/manifest.json`));
    expect(out).toMatch(/OK {3}.*user_record__aws\.iam\.json/);
    expect(out).toMatch(new RegExp(`FAIL .*x__y\\.json: signed by key [0-9a-f]{16}, expected ${fingerprint(key)}`));
    expect(r.failed).toBe(3);
    expect(r.ok).toBe(false);
  });

  it("fails a manifest signed by a key other than --public-key", async () => {
    const pinned = newKey();
    signedVault(newKey());
    const r = await verifyDirectory(root, { publicKey: pinned.b64 });
    expect(r.lines.join("\n")).toMatch(
      new RegExp(`FAIL ${run}/manifest.json: signed by key [0-9a-f]{16}, expected ${fingerprint(pinned)}`),
    );
  });

  it("fails a tampered record", async () => {
    signedVault();
    const p = join(root, run, "policies/p.mfa/envelopes/user_record__aws.iam.json");
    writeFileSync(p, readFileSync(p, "utf-8").replace('"aws.iam"', '"aws.iaM"'));
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(
      /FAIL .*user_record__aws\.iam\.json: Signature does not match/,
    );
  });

  it("fails a bignum envelope whose 64-bit integer was rounded", async () => {
    signedVault();
    const p = join(root, run, "policies/p.big/envelopes/x__y.json");
    writeFileSync(p, readFileSync(p, "utf-8").replace("9223372036854775807", "9223372036854775808"));
    const r = await verifyDirectory(root);
    expect(r.failed).toBe(2); // the envelope, and the manifest's hash for it
  });

  it("fails a swapped attachment", async () => {
    signedVault();
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
    const lax = await verifyDirectory(root, { requireManifest: false });
    expect(lax.ok).toBe(true);
    expect(lax.lines[0]).toMatch(/no attachment for access_review_quarterly/);
    const strict = await verifyDirectory(root, { requireAttachments: true, requireManifest: false });
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
    const r = await verifyDirectory(root, { requireManifest: false });
    expect(r.lines.join("\n")).toMatch(/FAIL loose\.json: Ed25519 public key must be 32 bytes/);
  });

  it("is not ok when no envelope is found", async () => {
    put("summary.json", "{}");
    const r = await verifyDirectory(root);
    expect(r.ok).toBe(false);
    expect(r.lines).toContain("SKIP summary.json: not an evidence envelope");
    expect(r.lines.at(-1)).toMatch(/no evidence envelopes found/);
  });
});

describe("main", () => {
  it("exits 0 for a good vault and 1 for an empty or missing directory", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedVault();
    expect(await main([root, "--require-attachments"])).toBe(0);
    expect(log).toHaveBeenLastCalledWith(expect.stringMatching(/^1 manifest\(s\): 1 verified/));
    const empty = mkdtempSync(join(tmpdir(), "verify-empty-"));
    expect(await main([empty])).toBe(1);
    rmSync(empty, { recursive: true });
    expect(await main([join(root, "nope")])).toBe(1);
  });

  it("takes --public-key <b64> and --no-manifest", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const key = newKey();
    put("policies/p/envelopes/a.json", envelopeSignedBy(key));
    expect(await main([root])).toBe(1);
    expect(await main([root, "--no-manifest"])).toBe(0);
    expect(await main(["--public-key", key.b64, root, "--no-manifest"])).toBe(0);
    expect(await main([root, "--no-manifest", "--public-key", newKey().b64])).toBe(1);
  });

  it.each<[string, string[]]>([
    ["an unknown flag", ["--nope"]],
    ["no directory", []],
    ["two directories", ["a", "b"]],
    ["--public-key without a value", ["--public-key"]],
    ["a --public-key that is not 32 bytes", ["--public-key", "AAAA"]],
  ])("exits 2 on %s", async (_n, args) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const dirArg = args.length === 0 || args[0] === "a" ? [] : [root];
    expect(await main([...args, ...dirArg])).toBe(2);
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/usage: verify-envelopes|--public-key/));
  });
});
