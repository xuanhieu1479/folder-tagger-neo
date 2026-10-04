import type { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../errors';
import { buildSearch } from '../search/build';
import { parseSearch } from '../search/parse';
import { foldKey, pathKey, wordsKey } from '../shared/normalize';
import type { FolderItem, Sort } from '../shared/types';
import { findThumbnail } from './thumbnails';

export type FolderRow = {
  id: number;
  path: string;
  path_key: string;
  name: string;
  thumbnail: string | null;
  created_at: number;
  updated_at: number;
  open_count: number;
  last_opened_at: number | null;
};

export type ListParams = {
  q: string;
  category?: string;
  noCategory?: boolean;
  sort: Sort;
  page: number;
  size: number;
};

export type ListResult = { items: FolderItem[]; total: number; page: number; pages: number };

/** One page of folders matching a search. A page past the end is clamped to the last page. */
export function listFolders(db: Database, params: ListParams): ListResult {
  const search = buildSearch(parseSearch(params.q), params);
  const { total } = db.query(`SELECT COUNT(*) AS total FROM folders f WHERE ${search.where}`).get(...search.params) as {
    total: number;
  };
  const pages = Math.max(1, Math.ceil(total / params.size));
  const page = Math.min(Math.max(1, params.page), pages);
  const items = db
    .query(
      `SELECT f.id, f.name, f.path, f.thumbnail FROM folders f
       WHERE ${search.where} ORDER BY ${search.orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...search.params, params.size, (page - 1) * params.size) as FolderItem[];
  return { items, total, page, pages };
}

export function getFolder(db: Database, id: number): FolderRow {
  const row = db.query('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | null;
  if (!row) throw new HttpError(404, 'This folder is no longer in the library.');
  return row;
}

export type NewFolder = {
  path: string;
  createdAt?: number;
  updatedAt?: number;
  openCount?: number;
  lastOpenedAt?: number | null;
};

const folderName = (folderPath: string) => path.basename(folderPath) || folderPath;

/** Inserts a folder that is known to be absent from the library and returns its id. */
export function insertFolder(db: Database, folder: NewFolder): number {
  const fullPath = path.resolve(folder.path);
  const name = folderName(fullPath);
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO folders (path, path_key, name, name_key, name_words, thumbnail,
         created_at, updated_at, open_count, last_opened_at, shuffle_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, random())`,
    )
    .run(
      fullPath,
      pathKey(fullPath),
      name,
      foldKey(name),
      wordsKey(name),
      findThumbnail(fullPath),
      folder.createdAt ?? now,
      folder.updatedAt ?? now,
      folder.openCount ?? 0,
      folder.lastOpenedAt ?? null,
    );
  return Number(result.lastInsertRowid);
}

export const findByPath = (db: Database, folderPath: string): FolderRow | null =>
  db.query('SELECT * FROM folders WHERE path_key = ?').get(pathKey(path.resolve(folderPath))) as FolderRow | null;

const isDirectory = (folderPath: string) => fs.statSync(folderPath, { throwIfNoEntry: false })?.isDirectory() ?? false;

export type AddResult = { added: number; skipped: { path: string; reason: string }[] };

/** Adds folders to the library. Folders already in it, or not found on disk, are skipped. */
export function addFolders(db: Database, paths: string[]): AddResult {
  const result: AddResult = { added: 0, skipped: [] };
  db.transaction(() => {
    for (const folderPath of paths) {
      if (!isDirectory(folderPath)) result.skipped.push({ path: folderPath, reason: 'Not a folder on disk' });
      else if (findByPath(db, folderPath)) result.skipped.push({ path: folderPath, reason: 'Already in the library' });
      else {
        insertFolder(db, { path: folderPath });
        result.added++;
      }
    }
  })();
  return result;
}

/** Removes folders from the library only; nothing on disk is touched. */
export function removeFolders(db: Database, ids: number[]): number {
  const remove = db.prepare('DELETE FROM folders WHERE id = ? RETURNING id');
  let removed = 0;
  db.transaction(() => {
    for (const id of ids) removed += remove.all(id).length;
  })();
  return removed;
}

const INVALID_NAME = /[\\/:*?"<>|]/;

/** Renames a folder on disk and in the library. Its tags stay attached. */
export function renameFolder(db: Database, id: number, rawName: string): FolderItem {
  const folder = getFolder(db, id);
  const name = rawName.trim();
  if (!name) throw new HttpError(400, 'Folder name cannot be empty.');
  if (INVALID_NAME.test(name) || name.endsWith('.'))
    throw new HttpError(400, 'A folder name cannot contain \\ / : * ? " < > | or end with a dot.');

  const newPath = path.join(path.dirname(folder.path), name);
  if (newPath !== folder.path) {
    const sameFolder = pathKey(newPath) === folder.path_key; // Only the letter case changes.
    if (!sameFolder && (fs.existsSync(newPath) || findByPath(db, newPath)))
      throw new HttpError(409, 'New name is duplicate.');
    try {
      fs.renameSync(folder.path, newPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new HttpError(404, `${folder.path}\ndoes not exist!`);
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')
        throw new HttpError(409, 'The folder is in use by another program. Close it and try again.');
      throw error;
    }
    try {
      db.prepare(
        'UPDATE folders SET path = ?, path_key = ?, name = ?, name_key = ?, name_words = ?, updated_at = ? WHERE id = ?',
      ).run(newPath, pathKey(newPath), name, foldKey(name), wordsKey(name), Date.now(), id);
    } catch (error) {
      fs.renameSync(newPath, folder.path);
      throw error;
    }
  }
  return { id, name, path: newPath, thumbnail: folder.thumbnail };
}

/** Counts one opening of a folder (in Explorer or in the reader) for the Popular sort. */
export function markOpened(db: Database, id: number): void {
  db.prepare('UPDATE folders SET open_count = open_count + 1, last_opened_at = ? WHERE id = ?').run(Date.now(), id);
}

/** Gives every folder a new random position; random order then pages like any other sort. */
export function shuffleFolders(db: Database): void {
  db.exec('UPDATE folders SET shuffle_key = random()');
}
