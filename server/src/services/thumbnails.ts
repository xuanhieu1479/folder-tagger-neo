import fs from 'node:fs';
import { naturalCompare } from '../shared/naturalSort';

const PREFERRED = 'folder.jpg';
const THUMBNAIL_FILE = /\.(jpe?g|png)$/i;

/** Names of the files directly inside a folder; empty when the folder can't be read. */
export function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/** The file name of a folder's thumbnail: `folder.jpg` if present, otherwise its first jpg or png. */
export function findThumbnail(dir: string): string | null {
  const names = listFiles(dir);
  const preferred = names.find(name => name.toLowerCase() === PREFERRED);
  if (preferred) return preferred;
  let first: string | null = null;
  for (const name of names)
    if (THUMBNAIL_FILE.test(name) && (first === null || naturalCompare(name, first) < 0)) first = name;
  return first;
}
