// @vitest-environment jsdom
/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Verify } from "./Verify";
import { emptyFolderRecord, signEnvelope } from "@/test/sign-envelope";
import { createHash } from "node:crypto";

const fixtures = join(import.meta.dirname, "..", "lib", "verification", "__fixtures__");
const fixture = (name: string) => readFileSync(join(fixtures, name));
const text = (name: string) => fixture(name).toString("utf-8");

function fileInput(container: HTMLElement, accept: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[type=file][accept="${accept}"]`);
  if (!el) throw new Error(`no file input accepting ${accept}`);
  return el;
}

function renderVerify() {
  return render(<Verify />);
}

async function loadEnvelope(container: HTMLElement, name: string, body = text(name)) {
  // applyAccept off: a test must be able to hand the page a file its
  // picker would hide, as a drag-and-drop can.
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(
    fileInput(container, "application/json,.json"),
    new File([body], name, { type: "application/json" }),
  );
  return user;
}

describe("Verify page", () => {
  afterEach(cleanup);

  it("shows a valid verdict for a CLI envelope with no button press", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "sample-envelope-v1.json");
    expect(await screen.findByText("Signature valid")).toBeTruthy();
    expect(screen.getByText("automated")).toBeTruthy();
  });

  it("shows an invalid verdict when one character in records changes", async () => {
    const original = text("sample-envelope-v1.json");
    const tampered = original.replace('"source_id": "aws.iam"', '"source_id": "aws.iaM"');
    expect(tampered).not.toBe(original);
    const { container } = renderVerify();
    await loadEnvelope(container, "tampered.json", tampered);
    expect(await screen.findByText("Signature invalid")).toBeTruthy();
    expect(
      screen.getByText("Signature does not match the canonical signed payload."),
    ).toBeTruthy();
  });

  it("verifies the bignum envelope from its raw text", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "sample-envelope-v1-bignum.json");
    expect(await screen.findByText("Signature valid")).toBeTruthy();
  });

  it("matches a fan-out member's PDF and rejects a wrong file", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1-fanout.json");
    expect(await screen.findByText("Signature valid")).toBeTruthy();

    const pdfAccept = "application/pdf,.pdf";
    await user.upload(
      fileInput(container, pdfAccept),
      new File([fixture("sample-envelope-v1-fanout.acme_cloud.pdf")], "acme.pdf", {
        type: "application/pdf",
      }),
    );
    expect(await screen.findByText("PDF matches")).toBeTruthy();
    expect(screen.getByText("match")).toBeTruthy();
  });

  it("reports a hash mismatch for the wrong PDF", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1-manual.json");
    expect(await screen.findByText("Signature valid")).toBeTruthy();
    await user.upload(
      fileInput(container, "application/pdf,.pdf"),
      new File(["%PDF-1.4 not the one"], "other.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByText("mismatch")).toBeTruthy();
    expect(screen.getByText("Expected:")).toBeTruthy();
  });

  it("refuses a non-PDF dropped on the PDF check", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1-manual.json");
    await screen.findByText("Signature valid");
    await user.upload(
      fileInput(container, "application/pdf,.pdf"),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText(/doesn't look like a PDF/)).toBeTruthy();
  });

  it("explains a malformed paste and an unsupported format_version", async () => {
    renderVerify();
    const box = screen.getByLabelText("Envelope JSON");
    fireEvent.change(box, { target: { value: '{\n  "a": 1,\n  x\n}' } });
    expect(await screen.findByText(/Invalid JSON at line 3, column 3/)).toBeTruthy();

    const v2 = text("sample-envelope-v1.json").replace('"envelope.v1"', '"envelope.v2"');
    fireEvent.change(box, { target: { value: v2 } });
    expect(
      await screen.findByText(/Unsupported envelope format_version "envelope.v2"/),
    ).toBeTruthy();
  });

  it("resets to the input on Verify another", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1.json");
    await screen.findByText("Signature valid");
    await user.click(screen.getByRole("button", { name: /verify another/i }));
    expect(screen.queryByText("Signature valid")).toBeNull();
    expect(screen.getByText("Drop the signed envelope JSON")).toBeTruthy();
  });

  it("says the key is per file, not a key to check against a trusted one", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "sample-envelope-v1.json");
    await screen.findByText("Signature valid");
    expect(screen.getByText(/makes a new key for every file/)).toBeTruthy();
    expect(screen.queryByText(/one you trust/)).toBeNull();
  });

  it("shows the CLI's recorded verdict for a single-folder record with files", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    expect(screen.getByText("What the CLI recorded")).toBeTruthy();
    for (const label of ["File in the folder", "Uploaded within the period or its grace window", "Valid PDF"]) {
      expect(screen.getByText(label).nextSibling?.textContent).toBe("yes");
    }
    expect(screen.getByText("access-review.pdf")).toBeTruthy();
  });

  it("shows an empty folder as no file, not just a valid signature", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "empty.json", signEnvelope([emptyFolderRecord()]));
    await screen.findByText("Signature valid");
    expect(screen.getByText("File in the folder").nextSibling?.textContent).toBe("no");
    expect(screen.getByText("Valid PDF").nextSibling?.textContent).toBe("no");
  });

  it("offers no PDF match when the signature is invalid", async () => {
    const other = fixture("sample-envelope-v1-fanout.globex_crm.pdf");
    const hash = createHash("sha256").update(other).digest("hex");
    const tampered = text("golden/manual.json").replace(
      /"file_hash":"sha256:[0-9a-f]+"/,
      `"file_hash":"sha256:${hash}"`,
    );
    const { container } = renderVerify();
    await loadEnvelope(container, "tampered.json", tampered);
    await screen.findByText("Signature invalid");
    expect(screen.getByText(/The PDF check is off/)).toBeTruthy();
    expect(container.querySelector('input[type=file][accept="application/pdf,.pdf"]')).toBeNull();
    expect(screen.queryByText("match")).toBeNull();
  });

  it("refuses a manual record with a wrongly typed field instead of crashing", async () => {
    const bad = text("golden/manual.json").replace(/"file_hash":"[^"]+"/, '"file_hash":123');
    const { container } = renderVerify();
    await loadEnvelope(container, "bad.json", bad);
    expect(await screen.findByText("Could not parse envelope")).toBeTruthy();
    expect(screen.getByText(/file_hash should be a string/)).toBeTruthy();
  });

  it("renders the records JSON only once Envelope details is opened", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1.json");
    await screen.findByText("Signature valid");
    expect(container.querySelector("pre")).toBeNull();
    await user.click(screen.getByText("Envelope details"));
    const details = screen.getByText("Envelope details").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(/"source_id": "aws.iam"/)).toBeTruthy();
  });

  it("names the envelope button and labels the drop zone as a region", () => {
    renderVerify();
    expect(screen.getByRole("button", { name: "Choose envelope file" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Drop the signed envelope JSON file here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Drop/ })).toBeNull();
  });
});
