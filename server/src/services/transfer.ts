import type { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { writeStampedJson } from '../context';
import { foldKey } from '../shared/normalize';
import {
  APP_ID,
  emptyTagMap,
  type ExportFile,
  type ExportFolder,
  type ImportMode,
  type TagMap,
  type TagType,
} from '../shared/types';
import { TagMapSchema } from '../validate';
import { findByPath, folderName, insertFolder, isDirectory, type FolderRow } from './folders';
import { normalizeTagMap, setFolderTags } from './tags';

const BACKUP_SUFFIX = '-BACKUP.json';
const FAILED_SUFFIX = '-IMPORT-FAILED.json';

function exportFolders(db: Database): ExportFolder[] {
  const tagRows = db
    .query(
      `SELECT ft.folder_id AS id, t.type, t.name FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id
       ORDER BY t.name`,
    )
    .all() as { id: number; type: TagType; name: string }[];
  const tagsById = new Map<number, TagMap>();
  for (const row of tagRows) {
    if (!tagsById.has(row.id)) tagsById.set(row.id, emptyTagMap());
    tagsById.get(row.id)![row.type].push(row.name);
  }
  const folders = db.query('SELECT * FROM folders ORDER BY name_key, id').all() as FolderRow[];
  return folders.map(f => ({
    path: f.path,
    name: f.name,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
    openCount: f.open_count,
    lastOpenedAt: f.last_opened_at,
    tags: tagsById.get(f.id) ?? emptyTagMap(),
  }));
}

function newestBackup(backupDir: string): string | null {
  if (!fs.existsSync(backupDir)) return null;
  const files = fs
    .readdirSync(backupDir)
    .filter(name => name.endsWith(BACKUP_SUFFIX))
    .sort();
  const newest = files.at(-1);
  return newest ? path.join(backupDir, newest) : null;
}

export type ExportResult = { file: string | null; count: number };

/**
 * Writes the whole library to a new JSON file in `backupDir`. With `onlyIfChanged`,
 * nothing is written when the newest backup already holds the same data.
 */
export function exportData(db: Database, backupDir: string, options: { onlyIfChanged?: boolean } = {}): ExportResult {
  const folders = exportFolders(db);
  if (options.onlyIfChanged) {
    const newest = newestBackup(backupDir);
    try {
      const previous = newest ? (JSON.parse(fs.readFileSync(newest, 'utf8')) as ExportFile).folders : null;
      if (previous ? JSON.stringify(previous) === JSON.stringify(folders) : folders.length === 0)
        return { file: null, count: folders.length };
    } catch {
      // An unreadable backup is no reason to skip a new one.
    }
  }
  const data: ExportFile = { app: APP_ID, version: 1, exportedAt: Date.now(), folders };
  return { file: writeStampedJson(backupDir, BACKUP_SUFFIX, data), count: folders.length };
}

export const ImportSchema = v.object({
  folders: v.array(
    v.object({
      path: v.string(),
      name: v.optional(v.string()),
      createdAt: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
      openCount: v.optional(v.number()),
      lastOpenedAt: v.optional(v.nullable(v.number())),
      tags: v.optional(TagMapSchema, {}),
    }),
  ),
});

export type ImportData = v.InferOutput<typeof ImportSchema>;
export type ImportResult = { created: number; updated: number; failed: number; failedFile: string | null };

const hasTags = (db: Database, folderId: number) =>
  db.query('SELECT 1 FROM folder_tags WHERE folder_id = ? LIMIT 1').get(folderId) !== null;

/**
 * Imports a library export. Entries are matched to library folders by folder name, so
 * folders that were moved still match.
 *
 * - append: only fills folders that have no tags yet.
 * - overwrite: replaces the tags, dates and open count of matching folders.
 *
 * An entry with no match is added if its folder exists on disk. Everything that could
 * not be imported is written to an IMPORT-FAILED file.
 */
export function importData(db: Database, data: ImportData, mode: ImportMode, backupDir: string): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, failed: 0, failedFile: null };
  const failures: (ImportData['folders'][number] & { reason: string })[] = [];
  const byName = db.query('SELECT * FROM folders WHERE name_key = ? ORDER BY id LIMIT 1');

  db.transaction(() => {
    for (const entry of data.folders) {
      const name = entry.name ?? folderName(entry.path);
      const tags = normalizeTagMap(entry.tags);
      const match = (byName.get(foldKey(name)) as FolderRow | null) ?? findByPath(db, entry.path);

      if (!match) {
        if (!isDirectory(entry.path)) {
          failures.push({ ...entry, reason: 'No folder with this name in the library, and the path does not exist' });
          continue;
        }
        setFolderTags(db, insertFolder(db, entry), tags);
        result.created++;
      } else if (mode === 'append') {
        if (hasTags(db, match.id)) {
          failures.push({ ...entry, reason: 'The folder already has tags (append mode)' });
          continue;
        }
        setFolderTags(db, match.id, tags);
        result.updated++;
      } else {
        setFolderTags(db, match.id, tags);
        db.query(
          'UPDATE folders SET created_at = ?, updated_at = ?, open_count = ?, last_opened_at = ? WHERE id = ?',
        ).run(
          entry.createdAt ?? match.created_at,
          entry.updatedAt ?? match.updated_at,
          entry.openCount ?? match.open_count,
          entry.lastOpenedAt === undefined ? match.last_opened_at : entry.lastOpenedAt,
          match.id,
        );
        result.updated++;
      }
    }
  })();

  if (failures.length) {
    result.failed = failures.length;
    result.failedFile = writeStampedJson(backupDir, FAILED_SUFFIX, failures);
  }
  return result;
}
