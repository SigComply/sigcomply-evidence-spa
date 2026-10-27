// @vitest-environment jsdom
/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Verify } from "./Verify";

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
});
