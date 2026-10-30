import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../vite.config.ts";

// The built page's Content-Security-Policy is the browser-enforced half of
// "nothing leaves the browser". It is pinned exactly: any change, looser or
// stricter, has to change this test on purpose.
const PINNED = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join("; ");

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("CONTENT_SECURITY_POLICY", () => {
  it("is exactly the pinned policy", () => {
    expect(CONTENT_SECURITY_POLICY).toBe(PINNED);
  });

  it("never allows script eval, inline script or another origin", () => {
    const d = directives(CONTENT_SECURITY_POLICY);
    for (const [name, values] of d) {
      for (const forbidden of ["*", "'unsafe-eval'", "http:", "https:", "ws:", "wss:"]) {
        expect(values, `${name} allows ${forbidden}`).not.toContain(forbidden);
      }
      expect(values.filter((v) => /^(https?:)?\/\//.test(v) || /\.[a-z]{2,}$/.test(v)), name).toEqual([]);
    }
    for (const name of ["script-src", "connect-src", "default-src"]) {
      expect(d.get(name), name).not.toContain("'unsafe-inline'");
      expect(d.get(name), name).not.toContain("data:");
      expect(d.get(name), name).not.toContain("blob:");
    }
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'none'"]);
  });
});
