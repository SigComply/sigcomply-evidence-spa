import { describe, expect, it } from "vitest";
import { severityTone } from "./severity";

describe("severityTone", () => {
  it("follows the web app's severity scale", () => {
    expect(severityTone("critical")).toBe("red");
    expect(severityTone("high")).toBe("orange");
    expect(severityTone("medium")).toBe("amber");
    expect(severityTone("moderate")).toBe("amber");
    expect(severityTone("low")).toBe("blue");
  });

  it("ignores case and keeps unknown values neutral", () => {
    expect(severityTone("High")).toBe("orange");
    expect(severityTone("info")).toBe("slate");
  });
});
