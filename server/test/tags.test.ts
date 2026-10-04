import type { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { getFolder } from '../src/services/folders';
import { applyTags, clearFolderTags, clearUnusedTags, folderTags, listTags, manageTags } from '../src/services/tags';
import { emptyTagMap } from '../src/shared/types';
import { memoryDb, seedFolder } from './fixtures';

let db: Database;
let a: number;
let b: number;
beforeEach(() => {
  db = memoryDb();
  a = seedFolder(db, { name: 'A', tags: { author: ['ann'], genre: ['action', 'comedy'] } });
  b = seedFolder(db, { name: 'B', tags: { author: ['bob'] } });
});

const tagNames = (type: string) =>
  listTags(db)
    .filter(t => t.type === type)
    .map(t => `${t.name}:${t.count}`);

describe('applyTags', () => {
  test('add appends to every selected folder and creates new tags, normalised', () => {
    applyTags(db, { folderIds: [a, b], mode: 'add', tags: { genre: ['  Sci-Fi!! ', 'action'], category: ['Manga'] } });
    expect(folderTags(db, a)).toEqual({
      ...emptyTagMap(),
      author: ['ann'],
      genre: ['action', 'comedy', 'sci-fi'],
      category: ['manga'],
    });
    expect(folderTags(db, b)).toEqual({
      ...emptyTagMap(),
      author: ['bob'],
      genre: ['action', 'sci-fi'],
      category: ['manga'],
    });
  });

  test('a folder may have several categories', () => {
    applyTags(db, { folderIds: [a], mode: 'add', tags: { category: ['manga', 'anime'] } });
    expect(folderTags(db, a).category).toEqual(['anime', 'manga']);
  });

  test('edit replaces all tags of one folder', () => {
    applyTags(db, { folderIds: [a], mode: 'edit', tags: { parody: ['original'] } });
    expect(folderTags(db, a)).toEqual({ ...emptyTagMap(), parody: ['original'] });
  });

  test('edit refuses several folders', () => {
    expect(() => applyTags(db, { folderIds: [a, b], mode: 'edit', tags: {} })).toThrow(
      'Only one folder can be edited at a time!',
    );
  });

  test('remove takes the chosen tags away and ignores unknown ones', () => {
    applyTags(db, { folderIds: [a, b], mode: 'remove', tags: { genre: ['action', 'never-existed'], author: ['bob'] } });
    expect(folderTags(db, a).genre).toEqual(['comedy']);
    expect(folderTags(db, a).author).toEqual(['ann']);
    expect(folderTags(db, b).author).toEqual([]);
    expect(tagNames('genre')).not.toContain('never-existed:0');
  });

  test('every mode marks the folders as updated', () => {
    for (const mode of ['add', 'edit', 'remove'] as const) {
      db.prepare('UPDATE folders SET updated_at = 1').run();
      applyTags(db, { folderIds: [a], mode, tags: { genre: ['action'] } });
      expect(getFolder(db, a).updated_at).toBeGreaterThan(1);
      expect(getFolder(db, b).updated_at).toBe(1);
    }
  });
});

test('clearFolderTags removes every tag and marks the folders as updated', () => {
  db.prepare('UPDATE folders SET updated_at = 1').run();
  clearFolderTags(db, [a]);
  expect(folderTags(db, a)).toEqual(emptyTagMap());
  expect(folderTags(db, b).author).toEqual(['bob']);
  expect(getFolder(db, a).updated_at).toBeGreaterThan(1);
});

test('listTags counts usage, most used first, and includes unused tags', () => {
  applyTags(db, { folderIds: [b], mode: 'add', tags: { genre: ['action'] } });
  applyTags(db, { folderIds: [b], mode: 'remove', tags: { author: ['bob'] } });
  expect(tagNames('genre')).toEqual(['action:2', 'comedy:1']);
  expect(tagNames('author')).toEqual(['ann:1', 'bob:0']);
});

describe('manageTags', () => {
  test('rename keeps the folders', () => {
    expect(manageTags(db, 'author', [{ from: 'ann', to: 'Anna B!' }])).toEqual({ renamed: 1, merged: 0, deleted: 0 });
    expect(folderTags(db, a).author).toEqual(['anna b']);
  });

  test('renaming onto an existing tag merges the two', () => {
    applyTags(db, { folderIds: [b], mode: 'add', tags: { genre: ['comedy', 'funny'] } });
    expect(manageTags(db, 'genre', [{ from: 'funny', to: 'comedy' }])).toEqual({ renamed: 0, merged: 1, deleted: 0 });
    expect(folderTags(db, b).genre).toEqual(['comedy']);
    expect(tagNames('genre')).toEqual(['comedy:2', 'action:1']);
  });

  test('"delete" deletes the tag', () => {
    expect(manageTags(db, 'genre', [{ from: 'action', to: ' Delete ' }])).toEqual({
      renamed: 0,
      merged: 0,
      deleted: 1,
    });
    expect(folderTags(db, a).genre).toEqual(['comedy']);
  });

  test('changes apply in order, and only within the given type', () => {
    applyTags(db, { folderIds: [a], mode: 'add', tags: { parody: ['ann'] } });
    const result = manageTags(db, 'author', [
      { from: 'ann', to: 'bob' },
      { from: 'bob', to: 'carol' },
      { from: 'missing', to: 'x' },
      { from: 'carol', to: '!!!' },
    ]);
    expect(result).toEqual({ renamed: 1, merged: 1, deleted: 0 });
    expect(folderTags(db, a).author).toEqual(['carol']);
    expect(folderTags(db, b).author).toEqual(['carol']);
    expect(folderTags(db, a).parody).toEqual(['ann']);
  });

  test('managing tags does not mark folders as updated', () => {
    db.prepare('UPDATE folders SET updated_at = 1').run();
    manageTags(db, 'author', [{ from: 'ann', to: 'anna' }]);
    expect(getFolder(db, a).updated_at).toBe(1);
  });
});

test('clearUnusedTags deletes only tags without folders', () => {
  applyTags(db, { folderIds: [a], mode: 'remove', tags: { genre: ['action'], author: ['ann'] } });
  expect(clearUnusedTags(db)).toBe(2);
  expect(
    listTags(db)
      .map(t => t.name)
      .sort(),
  ).toEqual(['bob', 'comedy']);
});
