import type { Page } from "@playwright/test";
import { expect, fixture, loadEnvelope, loadPdf, test } from "./fixtures";

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

// The CLI's golden envelopes (src/lib/verification/__fixtures__/golden/,
// made by the CLI's TestSPAGoldenEnvelopes): the auditor's flow on the
// exact bytes the current CLI signs.
// The identity badges (evidence ID, flow, period) are the first monospace
// badges on the page; member tier badges follow further down.
async function expectIdentity(page: Page, parts: string[]) {
  const badges = page.locator('[data-slot="badge"].font-mono');
  for (const [i, part] of parts.entries()) {
    await expect(badges.nth(i)).toHaveText(part);
  }
}

test.describe("CLI golden envelopes", () => {
  test("a single-folder manual record matches its merged PDF", async ({ page }) => {
    await loadEnvelope(page, "manual.json", fixture("golden/manual.json"));
    await expect(page.getByText("Signature valid")).toBeVisible();
    await expectIdentity(page, ["access_review_quarterly", "manual", "2026-Q1"]);
    await loadPdf(page, "evidence.pdf", fixture("golden/manual.access_review_quarterly.pdf"));
    await expect(page.getByText("match", { exact: true })).toBeVisible();
    await expect(page.getByText(/^evidence\.pdf matches access_review_quarterly · SHA-256 1c964fe9/)).toBeVisible();
  });

  test("a fan-out record shows the members and which one a PDF matches", async ({ page }) => {
    await loadEnvelope(page, "fanout.json", fixture("golden/fanout.json"));
    await expect(page.getByText("Signature valid")).toBeVisible();
    // The record itself has file_present false (the files are per member);
    // it is still a manual record.
    await expectIdentity(page, ["vendor_assurance", "manual", "2026"]);
    await expect(page.getByText("3 of 4 members satisfied")).toBeVisible();
    const member = (label: string) =>
      page.getByRole("listitem").filter({ hasText: label });
    await expect(member("Initech Mail (initech_mail)").getByText("no evidence")).toBeVisible();
    await expect(member("Zeta Newsletter (zeta_news)").getByText("exempt", { exact: true })).toBeVisible();

    await loadPdf(page, "iso-cert.pdf", fixture("golden/fanout.vendor_assurance.globex_crm.pdf"));
    await expect(member("Globex CRM (globex_crm)").getByText("PDF matches")).toBeVisible();
    await expect(page.getByText("PDF matches", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/^iso-cert\.pdf matches Globex CRM \(globex_crm\)/)).toBeVisible();
  });
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
