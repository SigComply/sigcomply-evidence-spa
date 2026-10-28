import type { Download, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, pinCatalogs, test } from "./fixtures";
import { pdfBytesToText, readPdfInfoString, readPdfTextRuns } from "../src/lib/pdf/pdf-info";

// 15 May 2026 12:00 UTC: yearly entries fall in period 2026.
const NOW = new Date("2026-05-15T12:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await pinCatalogs(page);
  // One framework chosen already, so the picker dialog stays closed.
  await page.addInitScript(() => localStorage.setItem("sigcomply:framework", "soc2"));
});

async function pdfFrom(download: Download): Promise<string> {
  return pdfBytesToText(readFileSync((await download.path())!));
}

async function pdfRunsFrom(download: Download): Promise<string[]> {
  return readPdfTextRuns(readFileSync((await download.path())!));
}

// The body text with line breaks undone: @react-pdf wraps and hyphenates
// long text across runs, so compare without whitespace or a break hyphen.
function bodyText(runs: string[]): string {
  return runs.map((r) => r.replace(/-$/, "")).join("").replace(/\s+/g, "");
}
function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

// The run drawn just before an item's text is its checkbox: "X" or blank.
function boxBefore(runs: string[], itemText: string): string {
  const i = runs.indexOf(itemText);
  expect(i, `"${itemText}" in the PDF`).toBeGreaterThan(0);
  return runs[i - 1];
}

// The copyable upload path (the breadcrumb below it repeats the same text).
function uploadPath(page: Page, path: string) {
  return page.locator("code").filter({ hasText: new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
}

async function submit(page: Page): Promise<Download> {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  return downloading;
}

test("declaration form downloads evidence.pdf and shows the upload path", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Open Code Of Conduct Acknowledgment" }).click();
  await expect(page.getByRole("heading", { name: "Code Of Conduct Acknowledgment" })).toBeVisible();

  // Submitting empty shows inline errors and downloads nothing.
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  await expect(page.getByText("Enter who completed this")).toBeVisible();
  await expect(page.getByText("You must accept the declaration to continue")).toBeVisible();

  await page.getByLabel("Completed by").fill("Jane Doe");
  await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
  const download = await submit(page);

  expect(download.suggestedFilename()).toBe("evidence.pdf");
  const body = bodyText(await pdfRunsFrom(download));
  for (const line of [
    "Code Of Conduct Acknowledgment",
    "I confirm that all personnel have acknowledged the organization's code of conduct during this period, either on hire or as part of the annual re-acknowledgment.",
    "Accepted: YES",
    "Signed by Jane Doe on 2026-05-15T12:00:00.000Z",
  ]) {
    expect(body).toContain(squash(line));
  }
  const pdf = await pdfFrom(download);
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(readPdfInfoString(pdf, "Keywords")).toBe(
    "evidence_id=code_of_conduct_acknowledgment; framework=soc2; control=CC1.1; period=2026; type=declaration; completed_by=Jane Doe; completed_at=2026-05-15T12:00:00.000Z; accepted=true",
  );

  await expect(page.getByRole("heading", { name: "evidence.pdf downloaded" })).toBeVisible();
  await expect(
    uploadPath(page, "manual/code_of_conduct_acknowledgment/2026/evidence.pdf"),
  ).toBeVisible();
});

test("checklist form needs every required item", async ({ page }) => {
  await page.goto("evidence/soc2/incident_response_tested");
  await page.getByLabel("Completed by").fill("Sam");
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  await expect(page.getByText("Tick every required item (marked *)")).toBeVisible();
  await expect(
    page.getByText(/^Required item\(s\) not checked: plan_tested, roles_verified, communication_tested$/),
  ).toBeVisible();

  // Tick the three required items; leave the optional one unticked.
  for (const item of [
    "Incident response plan was tested",
    "All incident response roles",
    "Communication channels and escalation paths",
  ]) {
    await page.getByRole("checkbox", { name: new RegExp(`^${item}`) }).click();
  }
  await expect(page.getByRole("checkbox", { name: /^Lessons learned/ })).not.toBeChecked();
  const download = await submit(page);
  // The optional item stayed unticked, so its box is blank; the rest are marked.
  const runs = await pdfRunsFrom(download);
  expect(boxBefore(runs, "Lessons learned were documented and the plan updated accordingly")).toBe(" ");
  expect(boxBefore(runs, "Incident response plan was tested via tabletop exercise or simulation")).toBe("X");
  expect(boxBefore(runs, "Communication channels and escalation paths were tested")).toBe("X");
  expect(bodyText(runs)).toContain(squash("Signed by Sam on 2026-05-15T12:00:00.000Z"));
  const keywords = readPdfInfoString(await pdfFrom(download), "Keywords");
  expect(keywords).toMatch(/^evidence_id=incident_response_tested; .*period=2026; type=checklist; completed_by=Sam; /);
  await expect(
    uploadPath(page, "manual/incident_response_tested/2026/evidence.pdf"),
  ).toBeVisible();
});

test("a config.json override changes the frameworks and the shown prefix", async ({ page }) => {
  await page.route("**/config.json", (route) =>
    route.fulfill({
      json: { frameworks: ["iso27001"], storage: { show_upload_path: true, prefix: "evidence/manual" } },
    }),
  );
  await page.goto("./");
  // soc2 is stored but not offered any more, so iso27001 loads.
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
  await page.getByRole("link", { name: /^Open / }).first().click();
  await expect(page).toHaveURL(/\/evidence\/iso27001\//);
  const id = page.url().split("/").pop();
  await page.getByLabel("Completed by").fill("Sam");
  for (const box of await page.getByRole("checkbox").all()) await box.click();
  await submit(page);
  await expect(uploadPath(page, `evidence/manual/${id}/2026/evidence.pdf`)).toBeVisible();
});

test("show_upload_path false shows only the fixed layout", async ({ page }) => {
  await page.route("**/config.json", (route) =>
    route.fulfill({ json: { frameworks: ["soc2"], storage: { show_upload_path: false, prefix: "secret/" } } }),
  );
  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await page.getByLabel("Completed by").fill("Sam");
  await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
  await submit(page);
  await expect(
    uploadPath(page, "code_of_conduct_acknowledgment/2026/evidence.pdf"),
  ).toBeVisible();
  await expect(page.getByText("secret/", { exact: false })).toHaveCount(0);
});
