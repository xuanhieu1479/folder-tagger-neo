import fs from 'node:fs';
import path from 'node:path';

/** The file inside the built web app that a URL path names, or null when there is none. */
export function staticPath(webDist: string, pathname: string): string | null {
  try {
    const file = path.join(webDist, decodeURIComponent(pathname));
    // The separator matters: "dist-old" also starts with "dist".
    const inside = file.startsWith(webDist + path.sep);
    return inside && fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? file : null;
  } catch {
    // Not a path at all, such as a broken % escape.
    return null;
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Whether a request comes from the app's own window (or from no web page at all),
 * and not from some other web page open in the browser.
 */
export function isOwnRequest(request: Request): boolean {
  const url = new URL(request.url);
  // Another site's name pointed at this computer (DNS rebinding) shows up as the host.
  if (!LOCAL_HOSTS.has(url.hostname)) return false;
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) return false;
  // The browser says where a request comes from; "none" is the address bar.
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}
