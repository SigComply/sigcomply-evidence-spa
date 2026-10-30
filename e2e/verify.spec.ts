import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { memberLabel } from "../src/lib/verification/manual";
import type {
  EvidenceEnvelope,
  ManualDocumentPayload,
  ManualInstancePayload,
} from "../src/types/envelope";
import { expect, fixture, loadEnvelope, loadPdf, test } from "./fixtures";
import { emptyFolderRecord, signEnvelope } from "../src/test/sign-envelope";

test.beforeEach(async ({ page }) => {
  await page.goto("verify");
  await expect(page.getByRole("heading", { name: "Verify signed evidence" })).toBeVisible();
});

test("a CLI envelope verifies on load", async ({ page }) => {
  await loadEnvelope(page, "sample-envelope-v1.json");
  await expect(page.getByText("Signature valid")).toBeVisible();
});

test("one changed character in records fails the signature", async ({ page }) => {
  const text = fixture("sample-envelope-v1.json").toString("utf-8");
  const tampered = text.replace('"source_id": "aws.iam"', '"source_id": "aws.iaM"');
  expect(tampered).not.toBe(text);
  await loadEnvelope(page, "tampered.json", Buffer.from(tampered));
  await expect(page.getByText("Signature invalid")).toBeVisible();
  await expect(page.getByText("Signature does not match the canonical signed payload.")).toBeVisible();
});

test("64-bit integers verify from the raw text", async ({ page }) => {
  await loadEnvelope(page, "sample-envelope-v1-bignum.json");
  await expect(page.getByText("Signature valid")).toBeVisible();
});

test("a fan-out member's PDF matches its signed hash", async ({ page }) => {
  await loadEnvelope(page, "sample-envelope-v1-fanout.json");
  await expect(page.getByText("Signature valid")).toBeVisible();
  await loadPdf(page, "acme.pdf", fixture("sample-envelope-v1-fanout.acme_cloud.pdf"));
  await expect(page.getByText("PDF matches", { exact: true })).toBeVisible();
  await expect(page.getByText("match", { exact: true })).toBeVisible();
});

test("the wrong PDF is a mismatch, and a non-PDF is refused", async ({ page }) => {
  await loadEnvelope(page, "sample-envelope-v1-manual.json");
  await expect(page.getByText("Signature valid")).toBeVisible();
  await loadPdf(page, "notes.txt", Buffer.from("hello"), "text/plain");
  await expect(page.getByText(/doesn't look like a PDF/)).toBeVisible();
  await loadPdf(page, "other.pdf", fixture("sample-envelope-v1-fanout.acme_cloud.pdf"));
  await expect(page.getByText("mismatch", { exact: true })).toBeVisible();
});

// The identity badges (evidence ID, flow, period) are the first monospace
// badges on the page; member tier badges follow further down.
async function expectIdentity(page: Page, parts: string[]) {
  const badges = page.locator('[data-slot="badge"].font-mono');
  for (const [i, part] of parts.entries()) {
    await expect(badges.nth(i)).toHaveText(part);
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function goldenPayload(name: string): ManualDocumentPayload {
  const env = JSON.parse(fixture(`golden/${name}`).toString("utf-8")) as EvidenceEnvelope;
  return env.records[0].payload as ManualDocumentPayload;
}

// The CLI's golden envelopes (src/lib/verification/__fixtures__/golden/,
// made by the CLI's TestSPAGoldenEnvelopes): the auditor's flow on the exact
// bytes the current CLI signs. Expectations come from the fixtures, so a
// refresh with `npm run check:goldens -- --copy` needs no edit here unless the
// vectors change shape (one manual record; a fan-out with a missing and an
// exempt member).
test.describe("CLI golden envelopes", () => {
  test("a single-folder manual record matches its merged PDF", async ({ page }) => {
    const record = goldenPayload("manual.json");
    const pdf = fixture(`golden/manual.${record.evidence_id}.pdf`);
    await loadEnvelope(page, "manual.json", fixture("golden/manual.json"));
    await expect(page.getByText("Signature valid")).toBeVisible();
    await expectIdentity(page, [record.evidence_id!, "manual", record.period_id!]);
    await loadPdf(page, "evidence.pdf", pdf);
    await expect(page.getByText("match", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`evidence.pdf matches ${record.evidence_id} · SHA-256 ${sha256(pdf)}`),
    ).toBeVisible();
  });

  test("a fan-out record shows the members and which one a PDF matches", async ({ page }) => {
    const record = goldenPayload("fanout.json");
    const members = record.instances!;
    await loadEnvelope(page, "fanout.json", fixture("golden/fanout.json"));
    await expect(page.getByText("Signature valid")).toBeVisible();
    // The record itself has file_present false (the files are per member);
    // it is still a manual record.
    expect(record.file_present).toBe(false);
    await expectIdentity(page, [record.evidence_id!, "manual", record.period_id!]);
    await expect(
      page.getByText(`${record.instances_satisfied} of ${record.instances_total} members satisfied`),
    ).toBeVisible();
    const row = (m: ManualInstancePayload) =>
      page.getByRole("listitem").filter({ hasText: memberLabel(m) });
    const missing = members.find((m) => m.required && !m.satisfied && !m.file_present)!;
    const exempt = members.find((m) => !m.required)!;
    await expect(row(missing).getByText("no evidence")).toBeVisible();
    await expect(row(exempt).getByText("exempt", { exact: true })).toBeVisible();

    // A member other than the first, so a match can't come from position.
    const target = members.filter((m) => m.file_hash)[1];
    const pdf = fixture(`golden/fanout.${record.evidence_id}.${target.id}.pdf`);
    expect(`sha256:${sha256(pdf)}`).toBe(target.file_hash);
    await loadPdf(page, "member.pdf", pdf);
    await expect(row(target).getByText("PDF matches")).toBeVisible();
    await expect(page.getByText("PDF matches", { exact: true })).toHaveCount(1);
    await expect(page.getByText(`member.pdf matches ${memberLabel(target)}`)).toBeVisible();
  });
});

test("a single-folder record shows what the CLI recorded, and an empty folder reads as no file", async ({ page }) => {
  await loadEnvelope(page, "manual.json", fixture("golden/manual.json"));
  await expect(page.getByText("Signature valid")).toBeVisible();
  const checks = page.getByRole("listitem");
  await expect(checks.filter({ hasText: "File in the folder" }).getByText("yes")).toBeVisible();
  await expect(checks.filter({ hasText: "Passed the CLI's file checks" }).getByText("yes")).toBeVisible();

  await page.getByRole("button", { name: "Verify another" }).click();
  await loadEnvelope(page, "empty.json", Buffer.from(signEnvelope([emptyFolderRecord()])));
  await expect(page.getByText("Signature valid")).toBeVisible();
  await expect(page.getByText("What the CLI recorded", { exact: true })).toBeVisible();
  await expect(checks.filter({ hasText: "File in the folder" }).getByText("no", { exact: true })).toBeVisible();
  // With no file the CLI never judged the window or the file.
  await expect(
    checks.filter({ hasText: "Uploaded within the period or its grace window" }).getByText("not checked"),
  ).toBeVisible();
  await expect(checks.filter({ hasText: "Passed the CLI's file checks" }).getByText("not checked")).toBeVisible();
});

test("a tampered file_hash with its matching PDF never shows a match", async ({ page }) => {
  const pdf = fixture("sample-envelope-v1-fanout.globex_crm.pdf");
  const tampered = fixture("golden/manual.json")
    .toString("utf-8")
    .replace(/"file_hash":"sha256:[0-9a-f]+"/, `"file_hash":"sha256:${sha256(pdf)}"`);
  await loadEnvelope(page, "tampered.json", Buffer.from(tampered));
  await expect(page.getByText("Signature invalid")).toBeVisible();
  await expect(page.getByText(/Hidden: the signature isn't valid/)).toBeVisible();
  await expect(page.getByText("What the CLI recorded", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type=file][accept="application/pdf,.pdf"]')).toHaveCount(0);
  await expect(page.getByText("match", { exact: true })).toHaveCount(0);
});

test("the valid verdict doesn't send auditors looking for a trusted key", async ({ page }) => {
  await loadEnvelope(page, "sample-envelope-v1.json");
  await expect(page.getByText(/The CLI makes a new key for every file/)).toBeVisible();
  await expect(page.getByText(/one you trust/)).toHaveCount(0);
});

// D6 (mirrors VerdictBanner copy in Verify.test.tsx): the verdict says the
// file is self-consistent with its embedded key and nothing stronger.
const OVERCLAIM = /intact|authentic|tamper-proof|proves|guarantee/i;

test("no verdict overclaims, and a valid one shows the key fingerprint", async ({ page }) => {
  const body = fixture("sample-envelope-v1.json");
  const key = (JSON.parse(body.toString("utf-8")) as EvidenceEnvelope).signature.public_key;
  const verdict = page.getByTestId("verdict");

  await loadEnvelope(page, "sample-envelope-v1.json");
  await expect(verdict).toContainText("Signature valid");
  await expect(verdict).toContainText(sha256(Buffer.from(key, "base64")));
  await expect(verdict).not.toContainText(OVERCLAIM);

  await page.getByRole("button", { name: "Verify another" }).click();
  const tampered = body.toString("utf-8").replace('"source_id": "aws.iam"', '"source_id": "aws.iaM"');
  await loadEnvelope(page, "tampered.json", Buffer.from(tampered));
  await expect(verdict).toContainText("Signature invalid");
  await expect(verdict).not.toContainText(OVERCLAIM);
});

test("a manual record with a wrongly typed field is refused, not a crash", async ({ page }) => {
  const bad = fixture("golden/fanout.json").toString("utf-8").replace(/"instances":\[/, '"instances":[null,');
  await loadEnvelope(page, "bad.json", Buffer.from(bad));
  await expect(page.getByText("Could not parse envelope")).toBeVisible();
  await expect(page.getByText(/instances\[0\] should be an object/)).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("the drop zones are labelled regions with distinct buttons", async ({ page }) => {
  await expect(page.getByRole("region", { name: "Drop the signed envelope JSON file here" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose envelope file" })).toBeVisible();
  await expect(page.getByText("policies/<policy_id>/envelopes/directory_user__aws.iam.json")).toBeVisible();
  await loadEnvelope(page, "manual.json", fixture("golden/manual.json"));
  await expect(page.getByRole("region", { name: "Drop the matching evidence PDF here" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose PDF" })).toBeVisible();
});

test("a malformed paste explains itself", async ({ page }) => {
  await page.getByText("…or paste JSON").click();
  await page.getByRole("textbox", { name: "Envelope JSON" }).fill('{"records": [}');
  await expect(page.getByText("Could not parse envelope")).toBeVisible();
  await expect(page.getByText(/^Invalid JSON/)).toBeVisible();
});

test.describe("browsers without Ed25519", () => {
  test("no crypto.subtle shows the upgrade notice", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "subtle", { get: () => undefined });
    });
    await page.reload();
    await loadEnvelope(page, "sample-envelope-v1.json");
    await expect(page.getByText("Verification could not run")).toBeVisible();
    await expect(page.getByText("Web Crypto API is not available in this browser.")).toBeVisible();
  });

  test("importKey rejecting Ed25519 shows the upgrade notice", async ({ page }) => {
    await page.addInitScript(() => {
      SubtleCrypto.prototype.importKey = () =>
        Promise.reject(new DOMException("Unrecognized name.", "NotSupportedError"));
    });
    await page.reload();
    await loadEnvelope(page, "sample-envelope-v1.json");
    await expect(page.getByText("Verification could not run")).toBeVisible();
    await expect(page.getByText(/does not support Ed25519 in Web Crypto/)).toBeVisible();
  });
});
