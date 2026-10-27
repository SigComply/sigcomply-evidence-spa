// Renders the evidence.pdf the form at /evidence/:framework/:evidenceId
// produces, from a JSON file instead of clicks. Same catalog, same validation
// (validateEvidence), same mapping (buildPdfInput) and same renderer
// (renderEvidencePdf). Used by the E2E repos to seed manual evidence.
//
//   npm run render-evidence-pdf -- --input <json> --out <pdf>
//
// Input fields (example: scripts/examples/render-evidence-pdf.declaration.json).
// Unknown fields and wrong types are errors:
//   framework      catalog framework, e.g. "soc2" (required; [a-z0-9_]+, and
//                  listed in public/config.json unless `catalog` is given)
//   evidence_id    catalog entry id, a declaration or checklist (required)
//   completed_by   the "Completed by" field (required)
//   accepted       declaration: the acceptance tick
//   checked        checklist: ids of the ticked items (array of strings)
//   notes          checklist: { item_id: "note" }, ids must be items
//   completed_at   ISO 8601; default now
//   period         period key in the entry's frequency format (2026-05-15,
//                  2026-W20, 2026-05, 2026-Q2, 2026); default the entry's
//                  current period at completed_at
//   catalog        path to a catalog JSON; default public/data/catalogs/<framework>.json
//   prefix         storage prefix for the printed upload path; default "manual/"
//
// Prints the upload path (inside the bucket) on stdout. Relative paths
// resolve against the caller's directory.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCatalog } from "../src/lib/catalog-validate.ts";
import {
  buildPdfInput,
  initialItems,
  validateEvidence,
  type EvidenceFormState,
} from "../src/lib/evidence-form.ts";
import { currentPeriod } from "../src/lib/period.ts";
import type { Frequency } from "../src/types/catalog.ts";
import { computeUploadPath } from "../src/lib/storage-path.ts";
import { renderEvidencePdf } from "../src/lib/pdf/render.tsx";

export interface RenderInput {
  framework: string;
  evidence_id: string;
  completed_by: string;
  accepted?: boolean;
  checked?: string[];
  notes?: Record<string, string>;
  completed_at?: string;
  period?: string;
  catalog?: string;
  prefix?: string;
}

const repoRoot = join(import.meta.dirname, "..");

function fail(message: string): never {
  throw new Error(message);
}

const FIELDS: Record<keyof RenderInput, "string" | "boolean" | "strings" | "notes"> = {
  framework: "string",
  evidence_id: "string",
  completed_by: "string",
  accepted: "boolean",
  checked: "strings",
  notes: "notes",
  completed_at: "string",
  period: "string",
  catalog: "string",
  prefix: "string",
};

// The framework names a file under public/data/catalogs/, so it must be a
// plain name.
const FRAMEWORK_RE = /^[a-z0-9_]+$/;

// Period keys per frequency, as currentPeriod() and the CLI write them.
const PERIOD_FORMATS: Record<Frequency, [RegExp, string]> = {
  daily: [/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "YYYY-MM-DD"],
  weekly: [/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, "YYYY-Www"],
  monthly: [/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM"],
  quarterly: [/^\d{4}-Q[1-4]$/, "YYYY-Qn"],
  yearly: [/^\d{4}$/, "YYYY"],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function configFrameworks(): string[] {
  const config = JSON.parse(readFileSync(join(repoRoot, "public", "config.json"), "utf-8")) as {
    frameworks?: string[];
  };
  return config.frameworks ?? [];
}

/** Checks the input's shape. Throws on the first problem. */
export function readInput(raw: unknown): RenderInput {
  if (!isPlainObject(raw)) fail("input must be a JSON object");
  for (const k of Object.keys(raw)) {
    if (!(k in FIELDS)) fail(`input: unknown field "${k}"`);
  }
  for (const k of ["framework", "evidence_id", "completed_by"]) {
    if (typeof raw[k] !== "string" || !(raw[k] as string).trim()) {
      fail(`input.${k} must be a non-empty string`);
    }
  }
  for (const [k, kind] of Object.entries(FIELDS)) {
    const v = raw[k];
    if (v === undefined) continue;
    if (kind === "string" && typeof v !== "string") fail(`input.${k} must be a string`);
    if (kind === "boolean" && typeof v !== "boolean") fail(`input.${k} must be a boolean`);
    if (kind === "strings" && !(Array.isArray(v) && v.every((s) => typeof s === "string"))) {
      fail(`input.${k} must be an array of strings`);
    }
    if (kind === "notes" && !(isPlainObject(v) && Object.values(v).every((s) => typeof s === "string"))) {
      fail(`input.${k} must be an object of strings`);
    }
  }
  const input = raw as unknown as RenderInput;
  if (!FRAMEWORK_RE.test(input.framework)) {
    fail(`input.framework must match ${FRAMEWORK_RE.source}, got "${input.framework}"`);
  }
  if (input.catalog === undefined) {
    const known = configFrameworks();
    if (!known.includes(input.framework)) {
      fail(
        `input.framework "${input.framework}" is not in public/config.json (${known.join(", ")}); ` +
          `pass "catalog" to use another catalog file`,
      );
    }
  }
  return input;
}

/** Renders the PDF bytes and the upload path for one input. */
export async function renderFromInput(
  raw: RenderInput,
  baseDir: string,
): Promise<{ pdf: Uint8Array; uploadPath: string; period: string }> {
  const input = readInput(raw);
  const catalogPath = input.catalog
    ? resolve(baseDir, input.catalog)
    : join(repoRoot, "public", "data", "catalogs", `${input.framework}.json`);
  const { catalog, errors } = validateCatalog(
    JSON.parse(readFileSync(catalogPath, "utf-8")),
    input.framework,
  );
  if (!catalog) fail(`${catalogPath} is not a valid catalog:\n  ${errors.join("\n  ")}`);

  const entry = catalog.entries.find((e) => e.id === input.evidence_id);
  if (!entry) fail(`no entry "${input.evidence_id}" in the ${input.framework} catalog`);

  const completedAt = input.completed_at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(completedAt))) fail(`completed_at "${completedAt}" is not a date`);
  const period = input.period ?? currentPeriod(entry.frequency, new Date(completedAt)).key;
  const [periodRe, periodFormat] = PERIOD_FORMATS[entry.frequency];
  if (!periodRe.test(period)) {
    fail(`input.period "${period}" is not a ${entry.frequency} period (${periodFormat})`);
  }

  const checked = new Set(input.checked ?? []);
  for (const id of checked) {
    if (!entry.items?.some((i) => i.id === id)) fail(`"${id}" is not an item of ${entry.id}`);
  }
  for (const id of Object.keys(input.notes ?? {})) {
    if (!entry.items?.some((i) => i.id === id)) fail(`notes: "${id}" is not an item of ${entry.id}`);
  }
  const state: EvidenceFormState = {
    completedBy: input.completed_by,
    accepted: input.accepted === true,
    items: initialItems(entry).map((i) => ({
      ...i,
      checked: checked.has(i.id),
      notes: input.notes?.[i.id] ?? "",
    })),
  };
  const error = validateEvidence(entry, state);
  if (error) fail(error);

  const pdfInput = buildPdfInput({
    entry,
    framework: input.framework,
    periodKey: period,
    completedAt,
    state,
  });
  const blob = await renderEvidencePdf(pdfInput);
  return {
    pdf: new Uint8Array(await blob.arrayBuffer()),
    uploadPath: computeUploadPath(input.prefix ?? "manual/", entry.id, period),
    period,
  };
}

function parseArgs(argv: string[]): { input: string; out: string } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get("--input");
  const out = get("--out");
  if (!input || !out || argv.length !== 4) {
    fail("usage: render-evidence-pdf --input <json> --out <pdf>");
  }
  return { input, out };
}

export async function main(argv: string[]): Promise<number> {
  try {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const args = parseArgs(argv);
    const inputPath = resolve(cwd, args.input);
    const input = readInput(JSON.parse(readFileSync(inputPath, "utf-8")));
    const { pdf, uploadPath } = await renderFromInput(input, dirname(inputPath));
    const out = resolve(cwd, args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, pdf);
    console.log(uploadPath);
    return 0;
  } catch (err) {
    console.error(`render-evidence-pdf: ${(err as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
