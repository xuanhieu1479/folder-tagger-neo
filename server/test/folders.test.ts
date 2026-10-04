import type { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MIGRATIONS, migrate, schemaVersion } from '../src/db/migrations';
import { getJson, openDatabase, setJson } from '../src/db/open';
import { addFolders, getFolder, listFolders, markOpened, removeFolders, renameFolder } from '../src/services/folders';
import { applyTags, folderTags } from '../src/services/tags';
import { findThumbnail, smallThumbnail } from '../src/services/thumbnails';
import { makeFolder, memoryDb, tempDir } from './fixtures';

const tmp = tempDir('folders');
afterAll(tmp.cleanup);

let db: Database;
let root: string;
let counter = 0;
beforeEach(() => {
  db = memoryDb();
  root = path.join(tmp.dir, String(counter++));
  fs.mkdirSync(root);
});

const names = () => listFolders(db, { q: '', sort: 'alpha', page: 1, size: 100 }).items.map(f => f.name);

describe('database', () => {
  test('a new database is at the latest schema version', () => {
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  test('a failing migration changes nothing', () => {
    const broken = [...MIGRATIONS, 'CREATE TABLE extra (x INTEGER); CREATE TABLE folders (dup INTEGER);'];
    expect(() => migrate(db, broken)).toThrow();
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'extra'").get()).toBeNull();
  });

  test('an older database file is copied before it is migrated', () => {
    const file = path.join(root, 'old.db');
    const backups = path.join(root, 'backups');
    const old = openDatabase(file);
    old.exec('PRAGMA user_version = 1');
    old.close();
    const reopened = openDatabase(file, backups);
    reopened.close();
    // Version 1 is current today, so nothing is copied until a second migration exists.
    expect(fs.existsSync(backups)).toBe(MIGRATIONS.length > 1);
  });

  test('key/value storage round-trips JSON', () => {
    expect(getJson(db, 'missing', { a: 1 })).toEqual({ a: 1 });
    setJson(db, 'k', { list: [1, 2] });
    setJson(db, 'k', { list: [3] });
    expect(getJson<unknown>(db, 'k', null)).toEqual({ list: [3] });
  });
});

describe('findThumbnail', () => {
  test('folder.jpg wins, whatever its letter case', () => {
    const dir = makeFolder(root, 'a', ['001.png', 'Folder.JPG', 'zzz.jpg']);
    expect(findThumbnail(dir)).toBe('Folder.JPG');
  });

  test('otherwise the first jpg, jpeg or png in natural order', () => {
    const dir = makeFolder(root, 'b', ['10.png', '2.JPG', 'notes.txt', '1.webp']);
    expect(findThumbnail(dir)).toBe('2.JPG');
  });

  test('none for a folder without images, or one that is missing', () => {
    expect(findThumbnail(makeFolder(root, 'c', ['notes.txt']))).toBeNull();
    expect(findThumbnail(path.join(root, 'does-not-exist'))).toBeNull();
  });
});

describe('smallThumbnail', () => {
  const bigPng = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#a33' } })
      .png()
      .toBuffer();

  test('makes a 500px wide WebP copy and reuses it', async () => {
    const dir = makeFolder(root, 'テスト 100% #1');
    const source = path.join(dir, '元 画像.png');
    fs.writeFileSync(source, await bigPng(1200, 1800));
    const cache = path.join(root, 'thumbs');

    const small = await smallThumbnail(source, cache);
    expect(path.dirname(small)).toBe(cache);
    expect(await sharp(fs.readFileSync(small)).metadata()).toMatchObject({ format: 'webp', width: 500, height: 750 });

    const made = fs.statSync(small).mtimeMs;
    expect(await smallThumbnail(source, cache)).toBe(small);
    expect(fs.statSync(small).mtimeMs).toBe(made);
    expect(fs.readdirSync(cache)).toHaveLength(1);
  });

  test('the folder can be renamed right after', async () => {
    const dir = makeFolder(root, 'before');
    fs.writeFileSync(path.join(dir, '1.png'), await bigPng(800, 800));
    await smallThumbnail(path.join(dir, '1.png'), path.join(root, 'thumbs'));
    fs.renameSync(dir, path.join(root, 'after'));
    expect(fs.existsSync(path.join(root, 'after', '1.png'))).toBe(true);
  });

  test('a changed image gets a new copy', async () => {
    const dir = makeFolder(root, 'changed');
    const source = path.join(dir, '1.png');
    const cache = path.join(root, 'thumbs');
    fs.writeFileSync(source, await bigPng(800, 800));
    const first = await smallThumbnail(source, cache);
    fs.writeFileSync(source, await bigPng(900, 600));
    const second = await smallThumbnail(source, cache);
    expect(second).not.toBe(first);
    expect(await sharp(fs.readFileSync(second)).metadata()).toMatchObject({ width: 500, height: 333 });
  });

  test('a small image is not enlarged', async () => {
    const dir = makeFolder(root, 'small');
    fs.writeFileSync(path.join(dir, '1.png'), await bigPng(200, 100));
    const small = await smallThumbnail(path.join(dir, '1.png'), path.join(root, 'thumbs'));
    expect(await sharp(fs.readFileSync(small)).metadata()).toMatchObject({ width: 200, height: 100 });
  });

  test('a file that is not an image is served as it is', async () => {
    const dir = makeFolder(root, 'broken');
    const source = path.join(dir, '1.jpg');
    fs.writeFileSync(source, 'not an image');
    expect(await smallThumbnail(source, path.join(root, 'thumbs'))).toBe(source);
  });

  test('a missing file is a 404', () => {
    expect(smallThumbnail(path.join(root, 'nope.png'), path.join(root, 'thumbs'))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('addFolders', () => {
  test('adds folders with their name and thumbnail', () => {
    const dir = makeFolder(root, 'テスト フォルダ [1] & 100% #1', ['1.png']);
    expect(addFolders(db, [dir])).toEqual({ added: 1, skipped: [] });
    const [item] = listFolders(db, { q: 'テスト', sort: 'alpha', page: 1, size: 25 }).items;
    expect(item).toMatchObject({ name: 'テスト フォルダ [1] & 100% #1', path: dir, thumbnail: '1.png' });
  });

  test('adding counts as an update', () => {
    addFolders(db, [makeFolder(root, 'a')]);
    const row = db.query('SELECT created_at, updated_at FROM folders').get() as {
      created_at: number;
      updated_at: number;
    };
    expect(row.updated_at).toBe(row.created_at);
    expect(row.updated_at).toBeGreaterThan(Date.now() - 5000);
  });

  test('a folder already in the library is skipped, even with different letter case', () => {
    const dir = makeFolder(root, 'Manga');
    addFolders(db, [dir]);
    const again = addFolders(db, [dir.toUpperCase(), dir + '\\', makeFolder(root, 'Other')]);
    expect(again.added).toBe(1);
    expect(again.skipped.map(s => s.reason)).toEqual(['Already in the library', 'Already in the library']);
    expect(names()).toEqual(['Manga', 'Other']);
  });

  test('a path that is not a folder is skipped', () => {
    const file = path.join(makeFolder(root, 'x', ['1.png']), '1.png');
    const result = addFolders(db, [file, path.join(root, 'missing')]);
    expect(result.added).toBe(0);
    expect(result.skipped).toHaveLength(2);
  });
});

describe('removeFolders', () => {
  test('removes the entry and its tag links, not the folder on disk', () => {
    const dir = makeFolder(root, 'a', ['1.png']);
    addFolders(db, [dir]);
    const id = listFolders(db, { q: '', sort: 'alpha', page: 1, size: 25 }).items[0]!.id;
    applyTags(db, { folderIds: [id], mode: 'add', tags: { author: ['x'] } });
    expect(removeFolders(db, [id, 999])).toBe(1);
    expect(names()).toEqual([]);
    expect(db.query('SELECT COUNT(*) AS n FROM folder_tags').get()).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(dir, '1.png'))).toBe(true);
  });
});

describe('renameFolder', () => {
  const addOne = (name: string, files: string[] = ['1.png']) => {
    const dir = makeFolder(root, name, files);
    addFolders(db, [dir]);
    return { dir, id: (db.query('SELECT id FROM folders WHERE path = ?').get(dir) as { id: number }).id };
  };

  test('renames on disk and in the library, keeping tags and thumbnail', () => {
    const { dir, id } = addOne('Old Name');
    applyTags(db, { folderIds: [id], mode: 'add', tags: { author: ['someone'] } });
    const renamed = renameFolder(db, id, '  New 名前  ');
    const newPath = path.join(root, 'New 名前');
    expect(renamed).toEqual({ id, name: 'New 名前', path: newPath, thumbnail: '1.png' });
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(path.join(newPath, '1.png'))).toBe(true);
    expect(folderTags(db, id).author).toEqual(['someone']);
    expect(listFolders(db, { q: 'name:名前', sort: 'alpha', page: 1, size: 25 }).total).toBe(1);
  });

  test('a rename that only changes letter case is allowed', () => {
    const { id } = addOne('lowercase');
    expect(renameFolder(db, id, 'LowerCase').name).toBe('LowerCase');
    expect(fs.readdirSync(root)).toEqual(['LowerCase']);
  });

  test('the same name changes nothing', () => {
    const { id, dir } = addOne('same');
    const before = getFolder(db, id).updated_at;
    expect(renameFolder(db, id, 'same').path).toBe(dir);
    expect(getFolder(db, id).updated_at).toBe(before);
  });

  test('empty, invalid and duplicate names are refused', () => {
    const { id } = addOne('one');
    makeFolder(root, 'taken');
    expect(() => renameFolder(db, id, '   ')).toThrow('Folder name cannot be empty.');
    expect(() => renameFolder(db, id, 'a/b')).toThrow('cannot contain');
    expect(() => renameFolder(db, id, 'taken')).toThrow('New name is duplicate.');
    expect(fs.existsSync(path.join(root, 'one'))).toBe(true);
  });

  test('a folder missing on disk gives a clear message', () => {
    const { id, dir } = addOne('gone');
    fs.rmSync(dir, { recursive: true });
    expect(() => renameFolder(db, id, 'new')).toThrow('does not exist');
  });
});

test('markOpened counts openings', () => {
  addFolders(db, [makeFolder(root, 'a')]);
  const id = (db.query('SELECT id FROM folders').get() as { id: number }).id;
  markOpened(db, id);
  markOpened(db, id);
  const row = getFolder(db, id);
  expect(row.open_count).toBe(2);
  expect(row.last_opened_at).toBeGreaterThan(Date.now() - 5000);
});
