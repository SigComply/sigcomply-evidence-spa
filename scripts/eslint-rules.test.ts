import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// The security lint rules are guards for whole classes of bug; this checks
// they stay switched on for the files they cover.
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId ?? m.message);
}

describe("security lint rules", () => {
  it.each([
    ["src/lib/x.ts", "export const f = (s: string) => eval(s);", "no-eval"],
    ["src/lib/x.ts", 'export const f = () => setTimeout("alert(1)", 1);', "no-implied-eval"],
    ["src/lib/x.ts", 'export const f = () => new Function("return 1");', "no-new-func"],
    ["src/lib/x.ts", 'export const u = "javascript:alert(1)";', "no-script-url"],
    ["src/lib/x.ts", "export const f = (e: HTMLElement, s: string) => { e.innerHTML = s; };", "no-unsanitized/property"],
    ["src/lib/x.ts", 'export const f = (e: HTMLElement, s: string) => e.insertAdjacentHTML("beforeend", s);', "no-unsanitized/method"],
    ["src/pages/X.tsx", "export const X = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;", "no-restricted-syntax"],
    ["src/lib/x.ts", 'export const f = () => fetch("/x");', "no-restricted-globals"],
    ["src/lib/x.ts", 'export const f = () => navigator.sendBeacon("/x");', "no-restricted-properties"],
    ["src/lib/x.ts", 'export const f = () => window.navigator.sendBeacon("/x");', "no-restricted-syntax"],
    ["src/lib/x.ts", 'export const f = () => self.fetch("/x");', "no-restricted-properties"],
    ["src/lib/x.ts", 'export const f = () => new window.WebSocket("wss://x");', "no-restricted-properties"],
    ["src/lib/x.ts", "export const X = globalThis.XMLHttpRequest;", "no-restricted-properties"],
    ["src/lib/x.ts", 'export const f = () => new self.EventSource("/x");', "no-restricted-properties"],
    ["src/lib/verification/x.ts", 'export const f = () => window.navigator.sendBeacon("/x");', "no-restricted-syntax"],
    ["src/lib/verification/x.ts", 'export const f = (o: object) => "k" in o;', "no-restricted-syntax"],
    ["scripts/verify-x.ts", 'export const f = (o: object) => "k" in o;', "no-restricted-syntax"],
    ["scripts/render-evidence-pdf.ts", 'export const f = (o: object) => "k" in o;', "no-restricted-syntax"],
    ["scripts/fetch-catalogs.ts", 'export const f = (o: object) => "k" in o;', "no-restricted-syntax"],
  ])("%s: flags %s with %s", async (file, code, rule) => {
    expect(await ruleIds(code, file)).toContain(rule);
  });

  it("lets the static-fetch module call fetch", async () => {
    const ids = await ruleIds(
      'export const f = () =>\n  // eslint-disable-next-line no-restricted-globals -- the one allowed caller\n  fetch("/x");',
      "src/lib/static-fetch.ts",
    );
    expect(ids).toEqual([]);
  });
});
