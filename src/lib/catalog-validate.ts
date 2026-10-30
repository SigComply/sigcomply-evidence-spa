import type { Catalog } from "@/types/catalog";

// Shape check of `sigcomply evidence catalog -o json` output against
// src/types/catalog.ts. scripts/fetch-catalogs.ts runs it on every build, so a
// CLI catalog change that these types don't describe fails the deploy instead
// of shipping data the UI misreads.
//
// Strict (errors) only where the SPA reads data: the top-level framework,
// version and entries, and every entry the SPA renders. Unknown fields there
// are errors on purpose: a new CLI field on a rendered entry means
// src/types/catalog.ts needs the matching change. Entries of a type the SPA
// drops (document_upload) and unknown top-level fields are never shipped, so
// they only produce warnings.

const EVIDENCE_TYPES = ["document_upload", "checklist", "declaration"];

/** A framework name: it becomes a file name in data/catalogs/. */
export const FRAMEWORK_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
// Entry and item IDs end up in routes, upload paths and form keys. The CLI's
// own grammar for vault IDs (vaultSafeID) minus the instance brackets: one
// path segment, no separator, no leading dot.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The entry types the SPA renders. Every other type is dropped. */
export const SPA_RENDERABLE_TYPES: ReadonlySet<string> = new Set([
  "declaration",
  "checklist",
]);
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const TEMPORAL_RULES = ["retrospective", "anytime"];

type FieldKind = "string" | "boolean" | "strings" | "items" | string[];

const ENTRY_FIELDS: Record<string, { kind: FieldKind; optional?: boolean }> = {
  id: { kind: "string" },
  control: { kind: "string" },
  type: { kind: EVIDENCE_TYPES },
  frequency: { kind: FREQUENCIES },
  temporal_rule: { kind: TEMPORAL_RULES },
  grace_period: { kind: "string" },
  name: { kind: "string" },
  description: { kind: "string" },
  severity: { kind: "string" },
  accepted_formats: { kind: "strings", optional: true },
  items: { kind: "items", optional: true },
  declaration_text: { kind: "string", optional: true },
  category: { kind: "string", optional: true },
  tsc: { kind: "string", optional: true },
  optional: { kind: "boolean", optional: true },
};

const ITEM_FIELDS = ["id", "text", "required"];

export interface CatalogValidation {
  /**
   * Set only when there are no errors. Holds only the renderable entries and
   * only the top-level fields in src/types/catalog.ts.
   */
  catalog?: Catalog;
  errors: string[];
  /** Problems in data the SPA drops; they never fail validation. */
  warnings: string[];
  /** How many entries were dropped as not renderable. */
  dropped: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unknownKeys(
  obj: Record<string, unknown>,
  allowed: string[],
  path: string,
  errors: string[],
) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${path}: unknown field "${k}"`);
  }
}

function checkItems(v: unknown, path: string, errors: string[]) {
  if (!Array.isArray(v)) {
    errors.push(`${path}: expected an array`);
    return;
  }
  v.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(item)) {
      errors.push(`${p}: expected an object`);
      return;
    }
    unknownKeys(item, ITEM_FIELDS, p, errors);
    if (typeof item.id !== "string") errors.push(`${p}.id: expected a string`);
    else if (!ID_PATTERN.test(item.id)) errors.push(`${p}.id: unsafe id ${JSON.stringify(item.id)}`);
    if (typeof item.text !== "string") errors.push(`${p}.text: expected a string`);
    if (typeof item.required !== "boolean") {
      errors.push(`${p}.required: expected a boolean`);
    }
  });
}

function checkField(v: unknown, kind: FieldKind, path: string, errors: string[]) {
  if (Array.isArray(kind)) {
    if (typeof v !== "string" || !kind.includes(v)) {
      errors.push(`${path}: expected one of ${kind.join(", ")}, got ${JSON.stringify(v)}`);
    }
  } else if (kind === "string") {
    if (typeof v !== "string") errors.push(`${path}: expected a string`);
  } else if (kind === "boolean") {
    if (typeof v !== "boolean") errors.push(`${path}: expected a boolean`);
  } else if (kind === "strings") {
    if (!Array.isArray(v)) {
      errors.push(`${path}: expected an array`);
      return;
    }
    v.forEach((s, i) => {
      if (typeof s !== "string") errors.push(`${path}[${i}]: expected a string`);
    });
  } else {
    checkItems(v, path, errors);
  }
}

export function validateCatalog(
  raw: unknown,
  framework: string,
): CatalogValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(raw)) {
    return { errors: ["catalog: expected an object"], warnings, dropped: 0 };
  }

  unknownKeys(raw, ["framework", "version", "entries"], "catalog", warnings);
  if (typeof raw.framework !== "string") {
    errors.push("catalog.framework: expected a string");
  } else if (!FRAMEWORK_PATTERN.test(raw.framework)) {
    errors.push(`catalog.framework: unsafe framework ${JSON.stringify(raw.framework)}`);
  } else if (raw.framework !== framework) {
    errors.push(
      `catalog.framework: expected "${framework}", got "${raw.framework}"`,
    );
  }
  if (typeof raw.version !== "string") {
    errors.push("catalog.version: expected a string");
  }
  if (!Array.isArray(raw.entries)) {
    errors.push("catalog.entries: expected an array");
    return { errors, warnings, dropped: 0 };
  }

  const seen = new Set<string>();
  const kept: unknown[] = [];
  let dropped = 0;
  raw.entries.forEach((e, i) => {
    const p = `entries[${i}]`;
    if (!isObject(e)) {
      errors.push(`${p}: expected an object`);
      return;
    }
    // An unknown type is still an error: the type list is part of the
    // contract, and a new type may be one the SPA should render.
    checkField(e.type, EVIDENCE_TYPES, `${p}.type`, errors);
    if (typeof e.type === "string" && EVIDENCE_TYPES.includes(e.type) &&
        !SPA_RENDERABLE_TYPES.has(e.type)) {
      dropped++;
      unknownKeys(e, Object.keys(ENTRY_FIELDS), `${p} (${e.type}, dropped)`, warnings);
      return;
    }
    kept.push(e);
    unknownKeys(e, Object.keys(ENTRY_FIELDS), p, errors);
    for (const [name, spec] of Object.entries(ENTRY_FIELDS)) {
      if (name === "type") continue;
      if (e[name] === undefined) {
        if (!spec.optional) {
          errors.push(
            `${p}.${name}: expected ${spec.kind === "string" ? "a string" : "a value"}`,
          );
        }
        continue;
      }
      checkField(e[name], spec.kind, `${p}.${name}`, errors);
    }
    if (typeof e.id === "string") {
      if (!ID_PATTERN.test(e.id)) errors.push(`${p}.id: unsafe id ${JSON.stringify(e.id)}`);
      if (seen.has(e.id)) errors.push(`${p}.id: duplicate "${e.id}"`);
      seen.add(e.id);
    }
  });

  if (errors.length > 0) return { errors, warnings, dropped };
  const catalog = {
    framework: raw.framework,
    version: raw.version,
    entries: kept,
  } as unknown as Catalog;
  return { catalog, errors, warnings, dropped };
}
