import type { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { writeStampedJson } from '../context';
import type { FolderItem } from '../shared/types';
import { findThumbnail } from './thumbnails';

/** How clean-up looks at the disk; replaced by a fake in tests. */
export type Probe = {
  exists(target: string): boolean;
  findThumbnail(dir: string): string | null;
};

const diskProbe: Probe = { exists: fs.existsSync, findThumbnail };

export type CleanupPlan = {
  /** Folders that are gone from a drive that is connected. These can be removed. */
  missing: { id: number; name: string; path: string }[];
  /** Drives (or network shares) that can't be reached. Their folders are left alone. */
  offline: { root: string; count: number }[];
  /** Folders whose thumbnail should change. */
  thumbnails: { id: number; thumbnail: string | null }[];
};

const CLEARED_SUFFIX = '-CLEARED.json';

/**
 * Decides what clean-up would do. A folder only counts as missing when its drive is
 * reachable, so an unplugged drive never empties the library.
 */
export function planCleanup(entries: FolderItem[], probe: Probe = diskProbe): CleanupPlan {
  const plan: CleanupPlan = { missing: [], offline: [], thumbnails: [] };
  const online = new Map<string, boolean>();
  const offlineCounts = new Map<string, number>();

  for (const entry of entries) {
    const root = path.win32.parse(entry.path).root;
    if (root && !online.has(root)) online.set(root, probe.exists(root));
    if (root && !online.get(root)) {
      offlineCounts.set(root, (offlineCounts.get(root) ?? 0) + 1);
      continue;
    }
    if (!probe.exists(entry.path)) {
      plan.missing.push({ id: entry.id, name: entry.name, path: entry.path });
      continue;
    }
    if (!entry.thumbnail || !probe.exists(path.join(entry.path, entry.thumbnail))) {
      const thumbnail = probe.findThumbnail(entry.path);
      if (thumbnail !== entry.thumbnail) plan.thumbnails.push({ id: entry.id, thumbnail });
    }
  }
  plan.offline = [...offlineCounts].map(([root, count]) => ({ root, count }));
  return plan;
}

const allEntries = (db: Database) =>
  db.query('SELECT id, name, path, thumbnail FROM folders ORDER BY name_key').all() as FolderItem[];

export const previewCleanup = (db: Database): CleanupPlan => planCleanup(allEntries(db));

export type CleanupResult = { removed: number; thumbnailsUpdated: number; logFile: string | null };

/**
 * Removes the confirmed entries and updates thumbnails. The disk is checked again, so
 * an entry is only removed if it is still missing now.
 */
export function applyCleanup(db: Database, removeIds: number[], backupDir: string): CleanupResult {
  const plan = previewCleanup(db);
  const confirmed = new Set(removeIds);
  const removable = plan.missing.filter(entry => confirmed.has(entry.id));

  db.transaction(() => {
    const remove = db.query('DELETE FROM folders WHERE id = ?');
    for (const entry of removable) remove.run(entry.id);
    const setThumbnail = db.query('UPDATE folders SET thumbnail = ? WHERE id = ?');
    for (const change of plan.thumbnails) setThumbnail.run(change.thumbnail, change.id);
  })();

  const logFile = removable.length
    ? writeStampedJson(
        backupDir,
        CLEARED_SUFFIX,
        removable.map(entry => entry.path),
      )
    : null;
  return { removed: removable.length, thumbnailsUpdated: plan.thumbnails.length, logFile };
}
