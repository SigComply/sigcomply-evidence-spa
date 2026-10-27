// A static server that behaves like GitHub Pages for this repo, so the
// Playwright suite tests what Pages will serve, not what `vite preview` does
// (which answers 200 index.html for everything).
//
//   tsx e2e/pages-server.ts <dist-dir> [port]
//
// - Serves <dist-dir> under BASE_PATH (/sigcomply-evidence-spa/).
// - A directory serves its index.html; BASE_PATH without the slash redirects.
// - Any missing path under BASE_PATH answers 404.html with status 404, as
//   Pages does. That is how deep links reach the SPA (deploy.yml copies
//   index.html to 404.html), and why a missing catalog JSON is a real 404.
// - Anything outside BASE_PATH is a bare 404.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

export const BASE_PATH = "/sigcomply-evidence-spa/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

const root = resolve(process.argv[2] ?? "dist-e2e");
const port = Number(process.argv[3] ?? process.env.E2E_PORT ?? 4791);

function fail(message: string): never {
  console.error(`pages-server: ${message}`);
  process.exit(1);
}

const index = join(root, "index.html");
const notFound = join(root, "404.html");
if (!existsSync(index)) fail(`${index} not found; build first (npm run build:e2e)`);
if (!existsSync(notFound)) fail(`${notFound} not found; copy index.html to 404.html as deploy.yml does`);
if (!readFileSync(index, "utf-8").includes(`${BASE_PATH}assets/`)) {
  fail(`${index} was not built with base ${BASE_PATH}`);
}

function fileFor(urlPath: string): string | null {
  const rel = normalize(decodeURIComponent(urlPath.slice(BASE_PATH.length)));
  const p = join(root, rel);
  if (p !== root && !p.startsWith(root + sep)) return null;
  if (!existsSync(p)) return null;
  if (statSync(p).isDirectory()) {
    const i = join(p, "index.html");
    return existsSync(i) ? i : null;
  }
  return p;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === BASE_PATH.slice(0, -1)) {
    res.writeHead(301, { Location: BASE_PATH + url.search });
    res.end();
    return;
  }
  if (!url.pathname.startsWith(BASE_PATH)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
    return;
  }
  const file = fileFor(url.pathname);
  const status = file ? 200 : 404;
  const path = file ?? notFound;
  res.writeHead(status, {
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : readFileSync(path));
}).listen(port, "127.0.0.1", () => {
  console.log(`pages-server: http://127.0.0.1:${port}${BASE_PATH} -> ${root}`);
});
