// The only module that calls fetch (ESLint `no-restricted-globals` enforces
// it). The app reads two kinds of files, both from its own base path:
// config.json and one catalog per framework. Anything else, including a path
// that a route parameter could bend with "../" or "%2F", is refused before a
// request is made. A catalog file name is a FRAMEWORK_PATTERN name.
import { FRAMEWORK_PATTERN } from "@/lib/catalog-validate";

const CATALOG_FILE = /^data\/catalogs\/(.+)\.json$/;

function isAppDataPath(path: string): boolean {
  if (path === "config.json") return true;
  const m = CATALOG_FILE.exec(path);
  return m !== null && FRAMEWORK_PATTERN.test(m[1]);
}

export async function fetchStatic(path: string): Promise<Response> {
  if (!isAppDataPath(path)) {
    throw new Error(`${JSON.stringify(path)} is not an app data path`);
  }
  // eslint-disable-next-line no-restricted-globals -- the one allowed caller
  return fetch(`${import.meta.env.BASE_URL}${path}`);
}
