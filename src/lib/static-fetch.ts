// The only module that calls fetch (ESLint `no-restricted-globals` enforces
// it). The app reads two kinds of files, both from its own base path:
// config.json and one catalog per framework. Anything else, including a path
// that a route parameter could bend with "../" or "%2F", is refused before a
// request is made.
const APP_DATA_PATH = /^(config\.json|data\/catalogs\/[a-z0-9][a-z0-9_-]*\.json)$/;

export async function fetchStatic(path: string): Promise<Response> {
  if (!APP_DATA_PATH.test(path)) {
    throw new Error(`${JSON.stringify(path)} is not an app data path`);
  }
  // eslint-disable-next-line no-restricted-globals -- the one allowed caller
  return fetch(`${import.meta.env.BASE_URL}${path}`);
}
