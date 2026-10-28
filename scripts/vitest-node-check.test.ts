import { describe, expect, it } from "vitest";
import { majorFromNvmrc } from "./vitest-node-check.ts";

describe("majorFromNvmrc", () => {
  it.each([
    ["24\n", 24],
    ["v24", 24],
    ["24.1", 24],
    ["v24.22.1\n", 24],
  ])("reads the major from %j", (text, major) => {
    expect(majorFromNvmrc(text)).toBe(major);
  });

  it.each(["lts/*", "node", "", "lts/krypton"])("refuses %j instead of passing", (text) => {
    expect(() => majorFromNvmrc(text)).toThrow(/\.nvmrc/);
  });
});
