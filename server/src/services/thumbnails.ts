import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from '../errors';
import { naturalCompare } from '../shared/naturalSort';

const PREFERRED = 'folder.jpg';
const THUMBNAIL_FILE = /\.(jpe?g|png)$/i;
/** Twice the width of a grid card, so thumbnails stay sharp on high-DPI screens. */
const SMALL_WIDTH = 500;

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

/** Small copies being made right now, so one image is never resized twice at once. */
const pending = new Map<string, Promise<string>>();

async function makeSmall(source: string, file: string): Promise<string> {
  try {
    // The image is read into memory first: given a path, sharp keeps the file open,
    // and the folder could then not be renamed.
    const small = await sharp(await Bun.file(source).arrayBuffer())
      .rotate()
      .resize({ width: SMALL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, small);
    fs.renameSync(`${file}.tmp`, file);
    return file;
  } catch {
    // Not something sharp can read: show the image as it is.
    return source;
  }
}

/**
 * The path of a small WebP copy of an image for the grid. The copy is made on first
 * use and kept in `cacheDir`; a changed image gets a new copy.
 */
export async function smallThumbnail(source: string, cacheDir: string): Promise<string> {
  const stat = fs.statSync(source, { throwIfNoEntry: false });
  if (!stat) throw new HttpError(404, 'The thumbnail file is missing.');
  const key = Bun.hash(`${source}\n${stat.mtimeMs}\n${stat.size}`).toString(36);
  const file = path.join(cacheDir, `${key}.webp`);
  if (fs.existsSync(file)) return file;

  let job = pending.get(file);
  if (!job) {
    job = makeSmall(source, file).finally(() => pending.delete(file));
    pending.set(file, job);
  }
  return job;
}
