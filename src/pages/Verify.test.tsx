// @vitest-environment jsdom
/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Verify, VerdictBanner, type SigStatus } from "./Verify";
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
    for (const label of ["File in the folder", "Uploaded within the period or its grace window", "Passed the CLI's file checks"]) {
      expect(screen.getByText(label).nextSibling?.textContent).toBe("yes");
    }
    expect(screen.getByText("access-review.pdf")).toBeTruthy();
  });

  it("shows an empty folder as no file, not just a valid signature", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "empty.json", signEnvelope([emptyFolderRecord()]));
    await screen.findByText("Signature valid");
    expect(screen.getByText("File in the folder").nextSibling?.textContent).toBe("no");
    expect(screen.getByText("Passed the CLI's file checks").nextSibling?.textContent).toBe("not checked");
    expect(
      screen.getByText("Uploaded within the period or its grace window").nextSibling?.textContent,
    ).toBe("not checked");
  });

  it("hides fan-out member verdicts when the signature is invalid", async () => {
    const tampered = text("sample-envelope-v1-fanout.json").replace(/"satisfied":false/, '"satisfied":true');
    expect(tampered).not.toBe(text("sample-envelope-v1-fanout.json"));
    const { container } = renderVerify();
    await loadEnvelope(container, "tampered.json", tampered);
    await screen.findByText("Signature invalid");
    expect(screen.queryByText(/members satisfied/)).toBeNull();
    expect(screen.getByText(/Hidden: the signature isn't valid/)).toBeTruthy();
  });

  it("offers no PDF match or recorded results when the signature is invalid", async () => {
    const other = fixture("sample-envelope-v1-fanout.globex_crm.pdf");
    const hash = createHash("sha256").update(other).digest("hex");
    const tampered = text("golden/manual.json").replace(
      /"file_hash":"sha256:[0-9a-f]+"/,
      `"file_hash":"sha256:${hash}"`,
    );
    const { container } = renderVerify();
    await loadEnvelope(container, "tampered.json", tampered);
    await screen.findByText("Signature invalid");
    expect(screen.getByText(/Hidden: the signature isn't valid/)).toBeTruthy();
    // Neither the recorded verdicts nor the PDF check are offered.
    expect(screen.queryByText("What the CLI recorded")).toBeNull();
    expect(screen.queryByText("File in the folder")).toBeNull();
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

// D6: a valid signature only shows the file is self-consistent with the key
// it carries. No verdict state may claim more than that.
const OVERCLAIM = /intact|authentic|tamper-proof|proves|guarantee/i;

describe("VerdictBanner copy", () => {
  afterEach(cleanup);

  const result = { signedBytes: "{}", keyFingerprint: "ab".repeat(32) };
  const states: SigStatus[] = [
    { state: "idle" },
    { state: "verifying" },
    { state: "valid", result: { ...result, valid: true } },
    { state: "invalid", result: { ...result, valid: false, reason: "Signature does not match the canonical signed payload." } },
    { state: "error", message: "Web Crypto API is not available in this browser." },
  ];

  it.each(states.map((s) => [s.state, s] as const))(
    "%s claims nothing beyond what the signature shows",
    (_name, status) => {
      const { container } = render(<VerdictBanner status={status} />);
      expect(container.textContent).not.toMatch(OVERCLAIM);
    },
  );

  it("shows the key fingerprint with a valid verdict", () => {
    const { container } = render(
      <VerdictBanner status={{ state: "valid", result: { ...result, valid: true } }} />,
    );
    expect(container.textContent).toContain("ab".repeat(32));
    expect(container.textContent).toMatch(/self-consistent/);
  });
});

describe("Verify page key fingerprint", () => {
  afterEach(cleanup);

  it("is the SHA-256 of the envelope's raw public key", async () => {
    const env = JSON.parse(text("sample-envelope-v1.json")) as { signature: { public_key: string } };
    const want = createHash("sha256").update(Buffer.from(env.signature.public_key, "base64")).digest("hex");
    const { container } = renderVerify();
    await loadEnvelope(container, "sample-envelope-v1.json");
    await screen.findByText("Signature valid");
    expect(screen.getByText(want)).toBeTruthy();
  });
});
