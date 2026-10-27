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
