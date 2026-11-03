// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { serveJson } from "@/test/component-env";
import { getDeviceRecord } from "@/lib/device-memory";
import type { Catalog } from "@/types/catalog";
import type { PdfInput } from "@/types/pdf-input";

const renderEvidencePdf = vi.fn(async (input: PdfInput) => {
  void input;
  return new Blob(["%PDF-1.3"], { type: "application/pdf" });
});
vi.mock("@/lib/pdf/render", () => ({ renderEvidencePdf }));
const downloadBlob = vi.fn();
vi.mock("@/lib/download", () => ({ downloadBlob }));

const catalog: Catalog = {
  framework: "soc2",
  version: "1.0",
  entries: [
    {
      id: "policy_ack",
      control: "CC1.1",
      type: "declaration",
      frequency: "quarterly",
      temporal_rule: "retrospective",
      grace_period: "30d",
      name: "Policy acknowledgment",
      description: "Staff acknowledged the policy.",
      severity: "medium",
      declaration_text: "I confirm every employee acknowledged the policy.",
    },
    {
      id: "offboarding",
      control: "CC6.2",
      type: "checklist",
      frequency: "monthly",
      temporal_rule: "retrospective",
      grace_period: "15d",
      name: "Offboarding",
      description: "Access removed on exit.",
      severity: "high",
      items: [
        { id: "revoke", text: "Revoke access", required: true },
        { id: "exit", text: "Exit interview", required: false },
      ],
    },
  ],
};

// The form's error messages; the info callouts (shadcn Alert) also carry
// role="alert".
function errorAlerts() {
  return screen.getAllByRole("alert").filter((el) => el.classList.contains("text-destructive"));
}

async function renderForm(
  evidenceId: string,
  config: unknown = { frameworks: ["soc2"] },
) {
  serveJson({ "config.json": config, "data/catalogs/soc2.json": catalog });
  const { loadConfig } = await import("@/config/runtime");
  await loadConfig();
  const { EvidenceForm } = await import("./EvidenceForm");
  render(
    <MemoryRouter initialEntries={[`/evidence/soc2/${evidenceId}`]}>
      <Routes>
        <Route path="/evidence/:framework/:evidenceId" element={<EvidenceForm />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: /back to list/i });
}

describe("EvidenceForm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15, 12, 0, 0))); // 15 May 2026, UTC
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
    renderEvidencePdf.mockClear();
    downloadBlob.mockClear();
  });

  it("blocks submit until the declaration is complete, then downloads and shows the upload path", async () => {
    const user = userEvent.setup();
    await renderForm("policy_ack");
    expect(screen.getByText("2026-Q2")).toBeTruthy();

    const submit = screen.getByRole("button", { name: /download evidence\.pdf/i });
    await user.click(submit);
    expect(await screen.findByText("Enter who completed this")).toBeTruthy();
    expect(screen.getByText("You must accept the declaration to continue")).toBeTruthy();
    // Each problem is announced once, beside its field, not again below.
    expect(screen.queryByText("Completed by is required")).toBeNull();
    expect(errorAlerts()).toHaveLength(2);
    expect(renderEvidencePdf).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Completed by"), "Jane Doe");
    await user.click(screen.getByRole("checkbox"));
    await user.click(submit);

    expect(await screen.findByText("evidence.pdf downloaded")).toBeTruthy();
    expect(renderEvidencePdf).toHaveBeenCalledTimes(1);
    const input = renderEvidencePdf.mock.calls[0][0];
    expect(input).toMatchObject({
      evidence_id: "policy_ack",
      framework: "soc2",
      period: "2026-Q2",
      type: "declaration",
      completed_by: "Jane Doe",
      accepted: true,
    });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "evidence.pdf");
    expect(screen.getByText("manual/policy_ack/2026-Q2/evidence.pdf")).toBeTruthy();
    // Remembered for next time on this device.
    expect(localStorage.getItem("sigcomply:completed-by")).toBe("Jane Doe");
  });

  it("requires every required checklist item and sends the item states", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("offboarding");
    expect(screen.getByLabelText("Completed by")).toHaveProperty("value", "Sam");

    const submit = screen.getByRole("button", { name: /download evidence\.pdf/i });
    await user.click(submit);
    const alert = await screen.findByText("Tick every required item (marked *): “Revoke access”");
    expect(alert.getAttribute("role")).toBe("alert");

    await user.click(screen.getByRole("checkbox", { name: /revoke access/i }));
    await user.type(
      screen.getByLabelText("Optional notes for: Revoke access"),
      "Okta",
    );
    await user.click(submit);

    expect(await screen.findByText("evidence.pdf downloaded")).toBeTruthy();
    expect(renderEvidencePdf.mock.calls[0][0].items).toEqual([
      { id: "revoke", text: "Revoke access", required: true, checked: true, notes: "Okta" },
      { id: "exit", text: "Exit interview", required: false, checked: false, notes: undefined },
    ]);
    expect(screen.getByText("manual/offboarding/2026-05/evidence.pdf")).toBeTruthy();
  });

  it("shows the render error and stays on the form when the PDF fails", async () => {
    const user = userEvent.setup();
    renderEvidencePdf.mockRejectedValueOnce(new Error("font failed to load"));
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    expect(await screen.findByText("font failed to load")).toBeTruthy();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("hides the prefix when show_upload_path is false", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack", {
      frameworks: ["soc2"],
      storage: { show_upload_path: false, prefix: "secret/" },
    });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    await screen.findByText("evidence.pdf downloaded");
    expect(screen.getByText("policy_ack/2026-Q2/evidence.pdf")).toBeTruthy();
    expect(screen.queryByText(/secret\//)).toBeNull();
  });

  it("explains an unknown entry", async () => {
    await renderForm("nope");
    expect(screen.getByText("Evidence entry not found")).toBeTruthy();
  });

  it("states the CLI's upload window instead of a retrospective claim", async () => {
    await renderForm("policy_ack");
    expect(
      screen.getByText("Upload during this period: once it ends, scheduled runs read the next period’s folder."),
    ).toBeTruthy();
    expect(screen.getByText("Apr 1 – Jun 30, 2026 (UTC)")).toBeTruthy();
    expect(screen.queryByText(/retrospective|just ended|grace/)).toBeNull();
  });

  it("explains the handoff: merged folder, scheduled run, calendar caveat, plain links", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    await screen.findByText("evidence.pdf downloaded");

    expect(screen.getByText(/the CLI merges every file in the\s+folder into one PDF/)).toBeTruthy();
    expect(screen.getByText("The CLI picks it up on the next scheduled run")).toBeTruthy();
    expect(screen.getByText("sigcomply check --scheduled")).toBeTruthy();
    expect(screen.getByText("sigcomply evidence due --all")).toBeTruthy();
    expect(screen.queryByText(/evidence bucket|your bucket/i)).toBeNull();
    // Links styled as buttons, not a button inside a link.
    const back = screen.getAllByRole("link", { name: "Back to list" });
    expect(back.length).toBe(1);
    expect(back[0].querySelector("button")).toBeNull();
    // Verify is an auditor task; the header nav already links it.
    expect(screen.queryByRole("link", { name: /verify a signed envelope/i })).toBeNull();
  });

  it("shows a note the PDF can't draw beside that note, linked to its input", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("offboarding");
    await user.click(screen.getByRole("checkbox", { name: /revoke access/i }));
    await user.type(screen.getByLabelText("Optional notes for: Exit interview"), "done 🙂");
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    const note = screen.getByLabelText("Optional notes for: Exit interview");
    expect(note.getAttribute("aria-invalid")).toBe("true");
    const error = document.getElementById(note.getAttribute("aria-describedby")!)!;
    expect(error.textContent).toBe("This note has characters the PDF font can’t show: 🙂");
    expect(errorAlerts()).toHaveLength(1);
    expect(renderEvidencePdf).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Optional notes for: Revoke access").getAttribute("aria-invalid")).toBe("false");
  });

  it("names the period of the click time in the PDF and the upload path when a boundary passes first", async () => {
    // Filled in just before the quarter ends (UTC)...
    vi.setSystemTime(new Date(Date.UTC(2026, 11, 31, 23, 59, 50)));
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack");
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("2026-Q4")).toBeTruthy();

    // ...and downloaded a minute later, in the next one.
    vi.setSystemTime(new Date(Date.UTC(2027, 0, 1, 0, 0, 50)));
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    await screen.findByText("evidence.pdf downloaded");

    const input = renderEvidencePdf.mock.calls[0][0];
    expect(input.completed_at).toBe("2027-01-01T00:00:50.000Z");
    expect(input.period).toBe("2027-Q1");
    expect(screen.getByText("manual/policy_ack/2027-Q1/evidence.pdf")).toBeTruthy();
    expect(getDeviceRecord("soc2", "policy_ack", "2027-Q1")?.generatedAt).toBeTruthy();
    expect(getDeviceRecord("soc2", "policy_ack", "2026-Q4")).toBeUndefined();
  });

  it("keeps the upload screen on the downloaded period when a boundary passes while the PDF renders", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 11, 31, 23, 59, 59)));
    // Rendering takes long enough for the quarter to end before the upload
    // screen first shows.
    renderEvidencePdf.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(Date.UTC(2027, 0, 1, 0, 0, 2)));
      return new Blob(["%PDF-1.3"], { type: "application/pdf" });
    });
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    await screen.findByText("evidence.pdf downloaded");

    expect(renderEvidencePdf.mock.calls[0][0].period).toBe("2026-Q4");
    expect(screen.getByText("manual/policy_ack/2026-Q4/evidence.pdf")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /uploaded this to my evidence storage/i }));
    expect(getDeviceRecord("soc2", "policy_ack", "2026-Q4")?.uploadedAt).toBeTruthy();

    // Editing again starts from the current period.
    await user.click(screen.getByRole("button", { name: /edit & re-download/i }));
    expect(screen.getByText("2027-Q1")).toBeTruthy();
  });

  it("clears a validation error once the user fixes it, without repeating it below", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:completed-by", "Sam");
    await renderForm("policy_ack");
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    expect(errorAlerts().map((el) => el.textContent)).toEqual([
      "You must accept the declaration to continue",
    ]);

    await user.click(screen.getByRole("checkbox"));
    expect(screen.queryAllByRole("alert").filter((el) => el.classList.contains("text-destructive"))).toEqual([]);
  });

  it("shows no stale error while the user fixes several fields one by one", async () => {
    const user = userEvent.setup();
    await renderForm("policy_ack");
    await user.click(screen.getByRole("button", { name: /download evidence\.pdf/i }));
    expect(errorAlerts()).toHaveLength(2);

    await user.type(screen.getByLabelText("Completed by"), "Jane Doe");
    expect(errorAlerts().map((el) => el.textContent)).toEqual([
      "You must accept the declaration to continue",
    ]);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.queryAllByRole("alert").filter((el) => el.classList.contains("text-destructive"))).toEqual([]);
    expect(renderEvidencePdf).not.toHaveBeenCalled();
  });
});
