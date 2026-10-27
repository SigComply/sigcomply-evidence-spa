import { vi } from "vitest";

// Shared setup for jsdom component tests: serve config.json and catalogs from
// memory, so a page renders without a server.
export function serveJson(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.keys(routes).find((path) => url.endsWith(path));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[hit]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
