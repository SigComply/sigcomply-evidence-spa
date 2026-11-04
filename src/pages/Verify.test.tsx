// @vitest-environment jsdom
/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      screen.getByText("The signature doesn't match this file's contents."),
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
    expect(screen.getByText("Not a PDF")).toBeTruthy();
    expect(screen.queryByText("Could not hash file")).toBeNull();
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
    expect(screen.getByText(/Hidden because the signature isn't valid/)).toBeTruthy();
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
    expect(screen.getByText(/Hidden because the signature isn't valid/)).toBeTruthy();
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
    // Announced to screen readers, not only drawn.
    expect(screen.getByRole("alert").textContent).toContain("Could not parse envelope");
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

  it("names the loaded file in the bar, and a paste as a pasted envelope", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    expect(screen.getByTestId("loaded-envelope").textContent).toContain("golden/manual.json");

    await userEvent.click(screen.getByRole("button", { name: /verify another/i }));
    fireEvent.change(screen.getByLabelText("Envelope JSON"), {
      target: { value: text("sample-envelope-v1.json") },
    });
    await screen.findByText("Signature valid");
    expect(screen.getByTestId("loaded-envelope").textContent).toContain("Pasted envelope");
  });

  it("never names an invalid file's evidence ID in the loaded bar", async () => {
    const tampered = text("golden/manual.json").replace(/"file_size":1210/, '"file_size":1211');
    expect(tampered).not.toBe(text("golden/manual.json"));
    const evidenceId = (JSON.parse(tampered) as { records: { payload: { evidence_id: string } }[] })
      .records[0].payload.evidence_id;
    const { container } = renderVerify();
    await loadEnvelope(container, "tampered.json", tampered);
    await screen.findByText("Signature invalid");
    const bar = screen.getByTestId("loaded-envelope").textContent ?? "";
    expect(bar).toContain("tampered.json");
    expect(bar).not.toContain(evidenceId);
  });

  it("names the envelope button and labels the drop zone as a region", () => {
    renderVerify();
    expect(screen.getByRole("button", { name: "Choose envelope file" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Drop the signed envelope JSON file here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Drop/ })).toBeNull();
  });
});

function drop(target: HTMLElement, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files, types: ["Files"] } });
}

const pdfFile = (name = "evidence.pdf") =>
  new File([fixture("golden/manual.access_review_quarterly.pdf")], name, { type: "application/pdf" });

describe("Verify page polish", () => {
  afterEach(cleanup);

  it("names the tab", () => {
    renderVerify();
    expect(document.title).toBe("Verify · SigComply Evidence");
  });

  it("checks another PDF after a match without reloading the envelope", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    await user.upload(fileInput(container, "application/pdf,.pdf"), pdfFile());
    expect(await screen.findByText("match")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check another PDF" }));
    expect(screen.queryByText("match")).toBeNull();
    expect(screen.getByText("Signature valid")).toBeTruthy();
    const choose = screen.getByRole("button", { name: "Choose PDF" });
    expect(document.activeElement).toBe(choose);

    await user.upload(
      fileInput(container, "application/pdf,.pdf"),
      new File(["%PDF-1.4 other"], "other.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByText("mismatch")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check another PDF" })).toBeTruthy();
  });

  it("gives likely causes for a mismatch without suggesting tampering", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    await user.upload(
      fileInput(container, "application/pdf,.pdf"),
      new File(["%PDF-1.4 other"], "other.pdf", { type: "application/pdf" }),
    );
    await screen.findByText("mismatch");
    const cause = screen.getByText(/merged PDF from the run's/);
    expect(cause.textContent).toContain("policies/<policy_id>/attachments/");
    expect(cause.textContent).toMatch(/original upload matches only when its folder held one PDF/);
    expect(cause.textContent).not.toMatch(/tamper|alter|modif/i);
    expect(cause.textContent).not.toMatch(OVERCLAIM);
  });

  it("announces the verdict and the PDF result, and moves focus with the flow", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    const verdict = screen.getByTestId("verdict");
    expect(verdict.getAttribute("role")).toBe("status");
    const heading = screen.getByRole("heading", { name: "Signature valid" });
    expect(document.activeElement).toBe(heading);

    const pdfStatus = screen.getByTestId("pdf-result");
    expect(pdfStatus.getAttribute("role")).toBe("status");
    await user.upload(fileInput(container, "application/pdf,.pdf"), pdfFile());
    await screen.findByText("match");
    expect(pdfStatus.textContent).toContain("evidence.pdf matches");

    await user.click(screen.getByRole("button", { name: /verify another/i }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose envelope file" }));
  });

  it("names a PDF or a run manifest dropped on the envelope zone", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "evidence.pdf", "%PDF-1.7\n1 0 obj");
    expect(await screen.findByText(/^This is a PDF\. Load the evidence envelope/)).toBeTruthy();
    expect(screen.queryByText(/Invalid JSON/)).toBeNull();
    await loadEnvelope(container, "manifest.json", text("cli-run/manifest.json"));
    expect(await screen.findByText(/^This is the run's manifest\.json/)).toBeTruthy();
    expect(screen.queryByText(/Expected fields/)).toBeNull();
  });

  it("keeps a drop outside the zones from opening the file, while mounted", () => {
    const fire = () => {
      const out: boolean[] = [];
      for (const type of ["dragover", "drop"]) {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "dataTransfer", { value: { types: ["Files"], dropEffect: "copy" } });
        document.body.dispatchEvent(ev);
        out.push(ev.defaultPrevented);
      }
      return out;
    };
    const { unmount } = renderVerify();
    expect(fire()).toEqual([true, true]);
    unmount();
    expect(fire()).toEqual([false, false]);
  });

  it("keeps the drag highlight while the pointer crosses the zone's children", () => {
    renderVerify();
    const zone = screen.getByRole("region", { name: "Drop the signed envelope JSON file here" });
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(zone.querySelector("p")!);
    fireEvent.dragLeave(zone);
    expect(zone.dataset.dragActive).toBe("true");
    fireEvent.dragLeave(zone.querySelector("p")!);
    expect(zone.dataset.dragActive).toBe("false");
  });

  it("uses the .json of several files dropped on the envelope zone, and says so", async () => {
    renderVerify();
    const zone = screen.getByRole("region", { name: "Drop the signed envelope JSON file here" });
    drop(zone, [pdfFile(), new File([text("golden/manual.json")], "manual.json", { type: "application/json" })]);
    expect(await screen.findByText("Signature valid")).toBeTruthy();
    expect(screen.getByText("This page checks one file at a time, so it used “manual.json”.")).toBeTruthy();
  });

  it("uses the .pdf of several files dropped on the PDF zone, and says so", async () => {
    const { container } = renderVerify();
    await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    const zone = screen.getByRole("region", { name: "Drop the matching evidence PDF here" });
    drop(zone, [new File(["{}"], "manual.json", { type: "application/json" }), pdfFile()]);
    expect(await screen.findByText("match")).toBeTruthy();
    expect(screen.getByText("This page checks one file at a time, so it used “evidence.pdf”.")).toBeTruthy();
  });

  it("shows big integers digit for digit in the raw view, in a scrolling block", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "sample-envelope-v1-bignum.json");
    await screen.findByText("Signature valid");
    await user.click(screen.getByText("Envelope details"));
    const details = screen.getByText("Envelope details").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const pre = await screen.findByText(/"max_int64": 9223372036854775807/);
    expect(pre.textContent).toContain('"epoch_nanos": 1700000000000000123');
    expect(pre.className).toMatch(/max-h-/);
    expect(pre.className).toMatch(/overflow-auto/);
  });

  it("labels fan-out member hashes and points the empty zone at attachments/", async () => {
    const { container } = renderVerify();
    expect(screen.getByText(/check the merged PDF from the attachments\/ folder/)).toBeTruthy();
    await loadEnvelope(container, "golden/fanout.json");
    await screen.findByText("Signature valid");
    expect(screen.getAllByText("Merged PDF SHA-256").length).toBeGreaterThan(0);
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
    { state: "invalid", result: { ...result, valid: false, reason: "The signature doesn't match this file's contents." } },
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

// The same word list over everything the page renders in each state, with
// every disclosure open: the copy around the verdict mustn't overclaim either.
describe("Verify page copy", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function openAll(container: HTMLElement) {
    for (const d of container.querySelectorAll("details")) {
      d.open = true;
      fireEvent(d, new Event("toggle"));
    }
    await screen.findAllByText(/"format_version"|"records"|"payload"/);
  }

  it("claims nothing beyond the signature with nothing loaded", () => {
    const { container } = renderVerify();
    for (const d of container.querySelectorAll("details")) {
      d.open = true;
      fireEvent(d, new Event("toggle"));
    }
    expect(container.textContent).not.toMatch(OVERCLAIM);
  });

  it.each([
    ["valid", "sample-envelope-v1.json", "Signature valid", (t: string) => t],
    [
      "invalid",
      "sample-envelope-v1.json",
      "Signature invalid",
      (t: string) => t.replace('"source_id": "aws.iam"', '"source_id": "aws.iaM"'),
    ],
    ["manual", "golden/manual.json", "Signature valid", (t: string) => t],
    ["fanout", "golden/fanout.json", "Signature valid", (t: string) => t],
  ] as const)("%s: the whole page claims nothing beyond the signature", async (_state, name, verdict, edit) => {
    const body = edit(text(name));
    const { container } = renderVerify();
    await loadEnvelope(container, name, body);
    await screen.findByText(verdict);
    await openAll(container);
    expect(container.textContent).not.toMatch(OVERCLAIM);
  });

  it("manual with a matched PDF: the whole page claims nothing beyond the signature", async () => {
    const { container } = renderVerify();
    const user = await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    await user.upload(
      fileInput(container, "application/pdf,.pdf"),
      new File([fixture("golden/manual.access_review_quarterly.pdf")], "evidence.pdf", {
        type: "application/pdf",
      }),
    );
    expect(await screen.findByText("match")).toBeTruthy();
    await openAll(container);
    expect(container.textContent).not.toMatch(OVERCLAIM);
  });

  it("error: the whole page claims nothing beyond the signature", async () => {
    vi.spyOn(crypto.subtle, "importKey").mockRejectedValue(
      new DOMException("Unrecognized name.", "NotSupportedError"),
    );
    const { container } = renderVerify();
    await loadEnvelope(container, "golden/manual.json");
    expect(await screen.findByText("Verification could not run")).toBeTruthy();
    await openAll(container);
    expect(container.textContent).not.toMatch(OVERCLAIM);
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

// Collects every string leaf of the records' payloads: the parts of the file
// a bad signature leaves unvouched for.
function payloadStrings(envelopeText: string): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  const env = JSON.parse(envelopeText) as { records: { payload: unknown }[] };
  env.records.forEach((r) => walk(r.payload));
  // Short leaves ("pdf", "low", "2026") also occur in ordinary page copy.
  return [...out].filter((s) => s.length >= 5);
}

describe("Verify page with an invalid signature", () => {
  afterEach(cleanup);

  it.each([
    ["golden/manual.json", /"file_size":1210/, '"file_size":1211'],
    ["golden/fanout.json", /"file_size":1226/, '"file_size":1227'],
  ] as const)(
    "%s: no payload value shows outside the labelled raw block",
    async (name, from, to) => {
      const tampered = text(name).replace(from, to);
      expect(tampered).not.toBe(text(name));
      const { container } = renderVerify();
      await loadEnvelope(container, "tampered.json", tampered);
      await screen.findByText("Signature invalid");
      for (const d of container.querySelectorAll("details")) {
        d.open = true;
        fireEvent(d, new Event("toggle"));
      }
      const view = container.cloneNode(true) as HTMLElement;
      view.querySelectorAll("[data-raw]").forEach((n) => n.remove());
      const shown = view.textContent ?? "";
      const leaked = payloadStrings(tampered).filter((s) => shown.includes(s));
      expect(leaked).toEqual([]);
      expect(screen.getByText("Unverified file contents")).toBeTruthy();
    },
  );
});

describe("Verify page PDF check", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("drops a hash that finishes after another envelope was loaded", async () => {
    const pdf = fixture("golden/manual.access_review_quarterly.pdf");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = new File([pdf], "evidence.pdf", { type: "application/pdf" });
    const bytes = await slow.arrayBuffer();
    slow.arrayBuffer = () => gate.then(() => bytes);
    // Observe the PDF's own digest, so the test waits for the stale hash to
    // finish rather than for a fixed time.
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let pdfDigest: Promise<ArrayBuffer> | undefined;
    let digestStarted!: () => void;
    const started = new Promise<void>((r) => (digestStarted = r));
    vi.spyOn(crypto.subtle, "digest").mockImplementation((alg, data) => {
      const p = digest(alg, data);
      if (data === bytes) {
        pdfDigest = p;
        digestStarted();
      }
      return p;
    });

    const { container } = renderVerify();
    const user = await loadEnvelope(container, "golden/manual.json");
    await screen.findByText("Signature valid");
    await user.upload(fileInput(container, "application/pdf,.pdf"), slow);
    expect(await screen.findByText(/Hashing evidence.pdf/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /verify another/i }));
    await loadEnvelope(container, "golden/fanout.json");
    await screen.findByText("Signature valid");
    await act(async () => {
      release();
      await started;
      await pdfDigest;
    });
    // What follows the digest (hex encoding, the stale check, setState) runs
    // in microtasks; one macrotask turn drains them all.
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(pdfDigest).toBeDefined();
    expect(screen.queryByText("match")).toBeNull();
    expect(screen.queryByText(/evidence\.pdf matches/)).toBeNull();
    expect(screen.getByRole("button", { name: "Choose PDF" })).toBeTruthy();
  });
});
