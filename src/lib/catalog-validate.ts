import type { Catalog } from "@/types/catalog";

// Strict shape check of `sigcomply evidence catalog -o json` output against
// src/types/catalog.ts. scripts/fetch-catalogs.ts runs it on every build, so a
// CLI catalog change that these types don't describe fails the deploy instead
// of shipping data the UI misreads. Unknown fields are errors on purpose: a
// new CLI field means src/types/catalog.ts needs the matching change.

const EVIDENCE_TYPES = ["document_upload", "checklist", "declaration"];
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
  /** Set only when there are no errors. */
  catalog?: Catalog;
  errors: string[];
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
  if (!isObject(raw)) return { errors: ["catalog: expected an object"] };

  unknownKeys(raw, ["framework", "version", "entries"], "catalog", errors);
  if (typeof raw.framework !== "string") {
    errors.push("catalog.framework: expected a string");
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
    return { errors };
  }

  const seen = new Set<string>();
  raw.entries.forEach((e, i) => {
    const p = `entries[${i}]`;
    if (!isObject(e)) {
      errors.push(`${p}: expected an object`);
      return;
    }
    unknownKeys(e, Object.keys(ENTRY_FIELDS), p, errors);
    for (const [name, spec] of Object.entries(ENTRY_FIELDS)) {
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
      if (seen.has(e.id)) errors.push(`${p}.id: duplicate "${e.id}"`);
      seen.add(e.id);
    }
  });

  return errors.length > 0 ? { errors } : { catalog: raw as unknown as Catalog, errors };
}
