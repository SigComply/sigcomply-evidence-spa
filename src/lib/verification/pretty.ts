import { LosslessNumber } from "./canonical";

/**
 * Pretty-prints a tree from `parseJSONPreservingNumbers` with a 2-space
 * indent, like `JSON.stringify(v, null, 2)`, but emits each number's source
 * lexeme. A plain `JSON.parse` would round integers above 2^53 in the view.
 */
export function prettyJSON(value: unknown, indent = ""): string {
  if (value instanceof LosslessNumber) return value.source;
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  const inner = indent + "  ";
  const entries = Array.isArray(value)
    ? value.map((v) => prettyJSON(v, inner))
    : Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${JSON.stringify(k)}: ${prettyJSON(v, inner)}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return open + close;
  return `${open}\n${inner}${entries.join(`,\n${inner}`)}\n${indent}${close}`;
}
