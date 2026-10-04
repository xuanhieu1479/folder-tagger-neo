import type { Database } from 'bun:sqlite';
import { HttpError } from '../errors';
import { normalizeTagName, wordsKey } from '../shared/normalize';
import { classifyTagChange } from '../shared/tagChange';
import { TAG_TYPES, emptyTagMap, type ApplyMode, type TagCount, type TagMap, type TagType } from '../shared/types';

/** Every tag with the number of folders using it, most used first. Unused tags are included. */
export function listTags(db: Database): TagCount[] {
  return db
    .query(
      `SELECT t.type, t.name, COUNT(ft.folder_id) AS count
       FROM tags t LEFT JOIN folder_tags ft ON ft.tag_id = t.id
       GROUP BY t.id ORDER BY count DESC, t.name`,
    )
    .all() as TagCount[];
}

export function folderTags(db: Database, folderId: number): TagMap {
  const rows = db
    .query(
      `SELECT t.type, t.name FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id
       WHERE ft.folder_id = ? ORDER BY t.name`,
    )
    .all(folderId) as { type: TagType; name: string }[];
  const tags = emptyTagMap();
  for (const row of rows) tags[row.type].push(row.name);
  return tags;
}

/** Normalises every name, dropping empty ones and repeats. */
export function normalizeTagMap(tags: Partial<Record<TagType, string[]>>): TagMap {
  const result = emptyTagMap();
  for (const type of TAG_TYPES) result[type] = [...new Set((tags[type] ?? []).map(normalizeTagName).filter(Boolean))];
  return result;
}

const findTagId = (db: Database, type: TagType, name: string): number | null =>
  (db.query('SELECT id FROM tags WHERE type = ? AND name = ?').get(type, name) as { id: number } | null)?.id ?? null;

/** Returns the id of a tag, creating it when it does not exist yet. The name must be normalised. */
function ensureTagId(db: Database, type: TagType, name: string): number {
  db.query('INSERT OR IGNORE INTO tags (type, name, name_words) VALUES (?, ?, ?)').run(type, name, wordsKey(name));
  return findTagId(db, type, name)!;
}

const touch = (db: Database, folderId: number) =>
  db.query('UPDATE folders SET updated_at = ? WHERE id = ?').run(Date.now(), folderId);

const linkStatement = (db: Database) => db.query('INSERT OR IGNORE INTO folder_tags (folder_id, tag_id) VALUES (?, ?)');

/** Replaces all tags of one folder. Runs inside the caller's transaction. */
export function setFolderTags(db: Database, folderId: number, tags: TagMap): void {
  db.query('DELETE FROM folder_tags WHERE folder_id = ?').run(folderId);
  const link = linkStatement(db);
  for (const type of TAG_TYPES) for (const name of tags[type]) link.run(folderId, ensureTagId(db, type, name));
}

export type ApplyTags = {
  folderIds: number[];
  mode: ApplyMode;
  tags: Partial<Record<TagType, string[]>>;
};

export function applyTags(db: Database, { folderIds, mode, tags: rawTags }: ApplyTags): void {
  if (mode === 'edit' && folderIds.length !== 1) throw new HttpError(400, 'Only one folder can be edited at a time!');
  const tags = normalizeTagMap(rawTags);
  const link = linkStatement(db);
  const unlink = db.query('DELETE FROM folder_tags WHERE folder_id = ? AND tag_id = ?');

  db.transaction(() => {
    for (const folderId of folderIds) {
      if (mode === 'edit') setFolderTags(db, folderId, tags);
      else
        for (const type of TAG_TYPES)
          for (const name of tags[type]) {
            if (mode === 'add') link.run(folderId, ensureTagId(db, type, name));
            else {
              const tagId = findTagId(db, type, name);
              if (tagId !== null) unlink.run(folderId, tagId);
            }
          }
      touch(db, folderId);
    }
  })();
}

/** Removes every tag from the given folders. */
export function clearFolderTags(db: Database, folderIds: number[]): void {
  const clear = db.query('DELETE FROM folder_tags WHERE folder_id = ?');
  db.transaction(() => {
    for (const folderId of folderIds) {
      clear.run(folderId);
      touch(db, folderId);
    }
  })();
}

export type TagChange = { from: string; to: string };
export type ManageResult = { renamed: number; merged: number; deleted: number };

/**
 * Applies Manage Tags edits for one tag type, in order. `classifyTagChange` decides
 * what each edit does.
 */
export function manageTags(db: Database, type: TagType, changes: TagChange[]): ManageResult {
  const result: ManageResult = { renamed: 0, merged: 0, deleted: 0 };
  db.transaction(() => {
    for (const change of changes) {
      const fromId = findTagId(db, type, change.from);
      if (fromId === null) continue;
      const effect = classifyTagChange(change.from, change.to, name => findTagId(db, type, name) !== null);
      if (!effect) continue;
      if (effect.kind === 'rename') {
        const { name } = effect;
        db.query('UPDATE tags SET name = ?, name_words = ? WHERE id = ?').run(name, wordsKey(name), fromId);
        result.renamed++;
        continue;
      }
      if (effect.kind === 'merge')
        db.query(
          'INSERT OR IGNORE INTO folder_tags (folder_id, tag_id) SELECT folder_id, ? FROM folder_tags WHERE tag_id = ?',
        ).run(findTagId(db, type, effect.name), fromId);
      db.query('DELETE FROM tags WHERE id = ?').run(fromId);
      result[effect.kind === 'merge' ? 'merged' : 'deleted']++;
    }
  })();
  return result;
}

/** Deletes tags that no folder uses and returns how many were deleted. */
export function clearUnusedTags(db: Database): number {
  return db.query('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM folder_tags) RETURNING id').all().length;
}
