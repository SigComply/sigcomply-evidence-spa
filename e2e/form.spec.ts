import type { Download, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, pinCatalogs, test } from "./fixtures";
import {
  joinTextRuns,
  pdfBytesToText,
  readPdfInfoString,
  readPdfTextRuns,
  squashText,
} from "../src/lib/pdf/pdf-info";

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

// incident_response_tested: three required items and an optional one.
const REQUIRED_INCIDENT_ITEMS = [
  /^Incident response plan was tested/,
  /^All incident response roles/,
  /^Communication channels and escalation paths/,
];

async function tickRequiredIncidentItems(page: Page) {
  for (const name of REQUIRED_INCIDENT_ITEMS) {
    await page.getByRole("checkbox", { name }).click();
  }
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
  const body = joinTextRuns(await pdfRunsFrom(download));
  for (const line of [
    "Code Of Conduct Acknowledgment",
    "I confirm that all personnel have acknowledged the organization's code of conduct during this period, either on hire or as part of the annual re-acknowledgment.",
    "Accepted: YES",
    "Signed by Jane Doe on 2026-05-15T12:00:00.000Z",
  ]) {
    expect(body).toContain(squashText(line));
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

test("the form and the upload screen say what the CLI does", async ({ page }) => {
  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await expect(
    page.getByText("Upload during this period: once it ends, scheduled runs read the next period’s folder."),
  ).toBeVisible();
  await expect(page.getByText(/retrospective|just ended|grace/)).toHaveCount(0);

  await page.getByLabel("Completed by").fill("Sam");
  await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
  await submit(page);
  await expect(page.getByText(/the CLI merges every file in the folder into one PDF/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload it to this folder in your evidence storage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The CLI picks it up on the next scheduled run" })).toBeVisible();
  await expect(page.getByText("sigcomply check --scheduled")).toBeVisible();
  await expect(page.getByText("sigcomply evidence due --all")).toBeVisible();
  await expect(page.getByText(/evidence bucket|your bucket/)).toHaveCount(0);

  // Each action is one tab stop: a link styled as a button, never a button in a link.
  await expect(page.locator("a button")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to list" }).click();
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
});

test("a name outside Latin-1 reaches the PDF intact, one the font lacks is refused", async ({ page }) => {
  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();

  await page.getByLabel("Completed by").fill("Wei 张伟");
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  await expect(page.getByText("This name has characters the PDF font can’t show: 张 伟")).toBeVisible();
  await expect(page.getByRole("heading", { name: "evidence.pdf downloaded" })).toHaveCount(0);

  const name = "Łukasz Dvořák (Nguyễn Văn An)";
  await page.getByLabel("Completed by").fill(name);
  const body = joinTextRuns(await pdfRunsFrom(await submit(page)));
  expect(body).toContain(squashText(`Signed by ${name} on 2026-05-15T12:00:00.000Z`));
});

test("a note the PDF can't draw is flagged beside it, once", async ({ page }) => {
  await page.goto("evidence/soc2/incident_response_tested");
  await page.getByLabel("Completed by").fill("Sam");
  await tickRequiredIncidentItems(page);
  const note = page.getByRole("textbox", { name: /^Optional notes for: Lessons learned/ });
  await note.fill("ok 🙂");
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  await expect(note).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[role="alert"].text-destructive')).toHaveText([
    "This note has characters the PDF font can’t show: 🙂",
  ]);
  await expect(page.getByRole("heading", { name: "evidence.pdf downloaded" })).toHaveCount(0);
});

test("a name can't add keys to the PDF keywords", async ({ page }) => {
  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await page.getByLabel("Completed by").fill("Mallory; period=2025");
  await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
  const keywords = readPdfInfoString(await pdfFrom(await submit(page)), "Keywords");
  expect(keywords).toContain("; completed_by=Mallory%3B period%3D2025; ");
  expect(keywords?.match(/period=/g)).toHaveLength(1);
});

test("checklist form needs every required item", async ({ page }) => {
  await page.goto("evidence/soc2/incident_response_tested");
  await page.getByLabel("Completed by").fill("Sam");
  await page.getByRole("button", { name: "Download evidence.pdf" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /^Tick every required item \(marked \*\): “Incident response plan was tested/ }),
  ).toBeVisible();
  await expect(page.locator('[role="alert"].text-destructive')).toHaveCount(1);
  await expect(page.getByText(/plan_tested|roles_verified/)).toHaveCount(0);

  await tickRequiredIncidentItems(page);
  await expect(page.getByRole("checkbox", { name: /^Lessons learned/ })).not.toBeChecked();
  const download = await submit(page);
  // The optional item stayed unticked, so its box is blank; the rest are marked.
  const runs = await pdfRunsFrom(download);
  expect(boxBefore(runs, "Lessons learned were documented and the plan updated accordingly")).toBe(" ");
  expect(boxBefore(runs, "Incident response plan was tested via tabletop exercise or simulation")).toBe("X");
  expect(boxBefore(runs, "Communication channels and escalation paths were tested")).toBe("X");
  expect(joinTextRuns(runs)).toContain(squashText("Signed by Sam on 2026-05-15T12:00:00.000Z"));
  const keywords = readPdfInfoString(await pdfFrom(download), "Keywords");
  expect(keywords).toMatch(/^evidence_id=incident_response_tested; .*period=2026; type=checklist; completed_by=Sam; /);
  await expect(
    uploadPath(page, "manual/incident_response_tested/2026/evidence.pdf"),
  ).toBeVisible();
});

test("Edit & re-download keeps the answers", async ({ page }) => {
  await page.goto("evidence/soc2/incident_response_tested");
  await page.getByLabel("Completed by").fill("Sam");
  await tickRequiredIncidentItems(page);
  await submit(page);
  await expect(page.getByRole("heading", { name: "evidence.pdf downloaded" })).toBeVisible();

  await page.getByRole("button", { name: "Edit & re-download" }).click();
  await expect(page.getByLabel("Completed by")).toHaveValue("Sam");
  for (const name of REQUIRED_INCIDENT_ITEMS) {
    await expect(page.getByRole("checkbox", { name })).toBeChecked();
  }
  await expect(page.getByRole("checkbox", { name: /^Lessons learned/ })).not.toBeChecked();

  const runs = await pdfRunsFrom(await submit(page));
  expect(boxBefore(runs, "Incident response plan was tested via tabletop exercise or simulation")).toBe("X");
  expect(joinTextRuns(runs)).toContain(squashText("Signed by Sam on"));
});

test("marking it uploaded is remembered in this browser and shown on the list", async ({ page }) => {
  const row = page
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: "Open Code Of Conduct Acknowledgment" }) });
  const uploaded = page.getByRole("checkbox", { name: /uploaded this to my evidence storage/ });
  async function fillAndSubmit() {
    await page.getByLabel("Completed by").fill("Jane Doe");
    await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
    await submit(page);
  }

  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await fillAndSubmit();
  await expect(uploaded).not.toBeChecked();
  await uploaded.check();
  await page.getByRole("link", { name: "Back to list" }).click();
  await expect(row.getByText("marked uploaded here")).toBeVisible();

  await page.reload();
  await expect(row.getByText("marked uploaded here")).toBeVisible();

  // The next download of the same period starts ticked; unticking is kept too.
  await page.getByRole("link", { name: "Open Code Of Conduct Acknowledgment" }).click();
  await fillAndSubmit();
  await expect(uploaded).toBeChecked();
  await uploaded.uncheck();
  await page.getByRole("link", { name: "Back to list" }).click();
  await expect(row.getByText("drafted here")).toBeVisible();
  await expect(row.getByText("marked uploaded here")).toHaveCount(0);
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

// The CLI computes periods in UTC, so the folder must not follow the
// browser's own zone near a boundary.
for (const { zone, now, period } of [
  // Already Jan 1 2027 in Sydney; still 2026 in UTC.
  { zone: "Australia/Sydney", now: "2026-12-31T22:00:00Z", period: "2026" },
  // Still Dec 31 2026 in Los Angeles; already 2027 in UTC.
  { zone: "America/Los_Angeles", now: "2027-01-01T01:00:00Z", period: "2027" },
]) {
  test.describe(`in ${zone}`, () => {
    test.use({ timezoneId: zone });

    test(`the period and folder follow UTC (${period})`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(now));
      await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
      await expect(page.getByText(`Jan 1 – Dec 31, ${period} (UTC)`)).toBeVisible();
      await page.getByLabel("Completed by").fill("Sam");
      await page.getByRole("checkbox", { name: /I accept this declaration/ }).click();
      await submit(page);
      await expect(
        uploadPath(page, `manual/code_of_conduct_acknowledgment/${period}/evidence.pdf`),
      ).toBeVisible();
    });
  });
}
