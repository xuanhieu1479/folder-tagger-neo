import type { Database } from 'bun:sqlite';
import path from 'node:path';
import { HttpError } from '../errors';
import { naturalCompare } from '../shared/naturalSort';
import { getFolder, markOpened } from './folders';
import { listFiles } from './thumbnails';

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)$/i;

/** The image files directly inside a folder, in natural order. Subfolders and archives are ignored. */
export const listImages = (dir: string): string[] =>
  listFiles(dir)
    .filter(name => IMAGE_FILE.test(name))
    .sort(naturalCompare);

// The listing from when the reader was opened, so image numbers stay stable while reading.
const listings = new WeakMap<Database, Map<number, string[]>>();

const listingFor = (db: Database): Map<number, string[]> => {
  if (!listings.has(db)) listings.set(db, new Map());
  return listings.get(db)!;
};

/** Opens a folder in the reader: counts the opening and returns how many images it has. */
export function openReader(db: Database, id: number): { name: string; count: number } {
  const folder = getFolder(db, id);
  const images = listImages(folder.path);
  listingFor(db).set(id, images);
  markOpened(db, id);
  return { name: folder.name, count: images.length };
}

/** The file path of image number `index` of a folder. */
export function imagePath(db: Database, id: number, index: number): string {
  const folder = getFolder(db, id);
  const cache = listingFor(db);
  if (!cache.has(id)) cache.set(id, listImages(folder.path));
  const name = cache.get(id)![index];
  if (!name) throw new HttpError(404, 'No such image.');
  return path.join(folder.path, name);
}
