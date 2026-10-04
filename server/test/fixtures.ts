import type { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config';
import { MEMORY, openDatabase } from '../src/db/open';
import { insertFolder } from '../src/services/folders';
import { applyTags } from '../src/services/tags';
import type { TagType } from '../src/shared/types';

export const memoryDb = (): Database => openDatabase(MEMORY);

/** A tiny valid PNG, for files that stand in for images. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** A scratch folder inside the project (data/test-tmp), removed again by `cleanup`. */
export function tempDir(label: string): { dir: string; cleanup: () => void } {
  const dir = path.join(PROJECT_ROOT, 'data', 'test-tmp', `${label}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Creates a folder on disk with the given files and returns its path. */
export function makeFolder(parent: string, name: string, files: string[] = []): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(dir, file), /\.(txt|zip)$/i.test(file) ? 'x' : PNG);
  return dir;
}

type SeedFolder = {
  name: string;
  tags?: Partial<Record<TagType, string[]>>;
  updatedAt?: number;
  openCount?: number;
};

/** Adds a library entry for a folder that does not need to exist on disk. */
export function seedFolder(db: Database, folder: SeedFolder): number {
  const id = insertFolder(db, {
    path: `Z:\\library\\${folder.name}`,
    createdAt: 1,
    updatedAt: 1,
    openCount: folder.openCount,
  });
  if (folder.tags) applyTags(db, { folderIds: [id], mode: 'add', tags: folder.tags });
  db.prepare('UPDATE folders SET updated_at = ? WHERE id = ?').run(folder.updatedAt ?? 1, id);
  return id;
}
