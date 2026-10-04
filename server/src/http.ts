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
