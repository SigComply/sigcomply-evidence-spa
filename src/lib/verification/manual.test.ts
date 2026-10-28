import { describe, expect, it } from "vitest";
import {
  expectedPdfHashes,
  matchPdfHash,
  memberVerdict,
  recordedChecks,
} from "./manual";
import { sha256Hex, verifyEnvelopeSignature } from "./verify";
import {
  getManualDocumentPayload,
  isEvidenceEnvelope,
  type EvidenceEnvelope,
  type ManualDocumentPayload,
} from "@/types/envelope";
// CLI-produced: `sigcomply check` over a vendor register with four members
// (two uploaded, one missing, one approved low-tier exemption). The PDFs are
// the files that were uploaded to the two members' folders.
import fanoutRaw from "./__fixtures__/sample-envelope-v1-fanout.json?raw";
import manualEnvelope from "./__fixtures__/sample-envelope-v1-manual.json";
import acmePdf from "./__fixtures__/sample-envelope-v1-fanout.acme_cloud.pdf?inline";
import globexPdf from "./__fixtures__/sample-envelope-v1-fanout.globex_crm.pdf?inline";

function loadEnvelope(raw: unknown): EvidenceEnvelope {
  if (!isEvidenceEnvelope(raw)) throw new Error("fixture shape mismatch");
  return raw;
}

function dataUrlBytes(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const fanout = loadEnvelope(JSON.parse(fanoutRaw));
const fanoutPayload = getManualDocumentPayload(fanout) as ManualDocumentPayload;
const single = getManualDocumentPayload(
  loadEnvelope(manualEnvelope),
) as ManualDocumentPayload;

describe("fan-out manual envelope", () => {
  it("verifies the CLI signature over the instances payload", async () => {
    const result = await verifyEnvelopeSignature(fanout, fanoutRaw);
    expect(result.valid).toBe(true);
    expect(result.signedBytes).toContain('"instances":[');
  });

  it("fails the signature when a member's verdict is flipped", async () => {
    const tampered = fanoutRaw.replace(
      /("id":"initech_pay".*?"satisfied":)false/,
      "$1true",
    );
    expect(tampered).not.toBe(fanoutRaw);
    const result = await verifyEnvelopeSignature(
      loadEnvelope(JSON.parse(tampered)),
      tampered,
    );
    expect(result.valid).toBe(false);
  });

  it("exposes the members and their counts", () => {
    expect(fanoutPayload.instances_total).toBe(4);
    expect(fanoutPayload.instances_satisfied).toBe(3);
    expect(fanoutPayload.instances?.map((m) => m.id)).toEqual([
      "acme_cloud",
      "globex_crm",
      "initech_pay",
      "zeta_news",
    ]);
    expect(fanoutPayload.file_hash).toBeUndefined();
  });
});

describe("memberVerdict", () => {
  const byId = (id: string) =>
    fanoutPayload.instances!.find((m) => m.id === id)!;

  it("reads each member's recorded verdict", () => {
    expect(memberVerdict(byId("acme_cloud"))).toBe("satisfied");
    expect(memberVerdict(byId("initech_pay"))).toBe("missing");
    expect(memberVerdict(byId("zeta_news"))).toBe("exempt");
  });

  it("reports a present but unsatisfied member as failed", () => {
    expect(
      memberVerdict({
        id: "x",
        required: true,
        file_present: true,
        in_temporal_window: true,
        file_valid: false,
        satisfied: false,
        validation_failures: ["assurance_out_of_date"],
      }),
    ).toBe("failed");
  });
});

describe("expectedPdfHashes", () => {
  it("lists one hash per member that carries one", () => {
    const hashes = expectedPdfHashes(fanoutPayload);
    expect(hashes.map((h) => h.memberId)).toEqual(["acme_cloud", "globex_crm"]);
    expect(hashes[0].hash).toBe(
      "1c964fe90f07b0c34f69f026ca336b0692f0b3eed25b4262694ee288e2937148",
    );
    expect(hashes[0].label).toBe("Acme Cloud Platform (acme_cloud)");
  });

  it("lists the top-level file_hash for a single-folder envelope", () => {
    const hashes = expectedPdfHashes(single);
    expect(hashes).toHaveLength(1);
    expect(hashes[0].memberId).toBeUndefined();
    expect(hashes[0].hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is empty when nothing was hashed", () => {
    expect(expectedPdfHashes({ evidence_id: "x", file_present: false })).toEqual(
      [],
    );
  });
});

describe("matchPdfHash", () => {
  it("matches each uploaded PDF to its own member", async () => {
    const acme = await sha256Hex(dataUrlBytes(acmePdf));
    const globex = await sha256Hex(dataUrlBytes(globexPdf));
    expect(matchPdfHash(fanoutPayload, acme)?.memberId).toBe("acme_cloud");
    expect(matchPdfHash(fanoutPayload, globex)?.memberId).toBe("globex_crm");
  });

  it("returns null for a hash no member carries", () => {
    expect(matchPdfHash(fanoutPayload, "00".repeat(32))).toBeNull();
  });

  it("matches case-insensitively against the sha256: prefixed hash", () => {
    const m = matchPdfHash(
      single,
      "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    );
    expect(m).not.toBeNull();
  });
});

describe("recordedChecks", () => {
  it("lists the CLI's three verdict fields as signed, missing ones as undefined", () => {
    expect(
      recordedChecks({ file_present: false, in_temporal_window: false, file_valid: false }),
    ).toEqual([
      { label: "File in the folder", ok: false },
      { label: "Uploaded within the period or its grace window", ok: false },
      { label: "Valid PDF", ok: false },
    ]);
    expect(recordedChecks({ file_present: true }).map((c) => c.ok)).toEqual([true, undefined, undefined]);
  });
});
