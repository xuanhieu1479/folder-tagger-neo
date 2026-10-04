import type { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { applyCleanup, planCleanup, previewCleanup, type Probe } from '../src/services/cleanup';
import { addFolders, getFolder, listFolders } from '../src/services/folders';
import { imagePath, listImages, openOutsideReader, openReader, outsideImagePath } from '../src/services/reader';
import { getSettings, saveSettings } from '../src/services/settings';
import { applyTags, folderTags } from '../src/services/tags';
import { smallThumbnail } from '../src/services/thumbnails';
import { exportData, importData, ImportSchema, type ImportData } from '../src/services/transfer';
import { emptyTagMap, type ExportFile } from '../src/shared/types';
import { makeFolder, memoryDb, PNG, seedFolder, tempDir } from './fixtures';

const tmp = tempDir('data');
afterAll(tmp.cleanup);

let db: Database;
let root: string;
let backups: string;
let thumbs: string;
let counter = 0;
beforeEach(() => {
  db = memoryDb();
  root = path.join(tmp.dir, String(counter++));
  backups = path.join(root, 'backups');
  thumbs = path.join(root, 'thumbs');
  fs.mkdirSync(root);
});

const readJson = <T>(file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const names = () => listFolders(db, { q: '', sort: 'alpha', page: 1, size: 100 }).items.map(f => f.name);

describe('export', () => {
  test('writes every folder with its tags', () => {
    seedFolder(db, { name: 'B', tags: { author: ['bob'], category: ['manga'] }, openCount: 3 });
    seedFolder(db, { name: 'A' });
    const result = exportData(db, backups);
    expect(result.count).toBe(2);
    expect(path.basename(result.file!)).toMatch(/^\d{4}-\d\d-\d\d \d\d-\d\d-\d\d-BACKUP\.json$/);
    const file = readJson<ExportFile>(result.file!);
    expect(file).toMatchObject({ app: 'folder-tagger-neo', version: 1 });
    expect(file.folders.map(f => f.name)).toEqual(['A', 'B']);
    expect(file.folders[1]).toMatchObject({
      path: 'Z:\\library\\B',
      openCount: 3,
      tags: { ...emptyTagMap(), author: ['bob'], category: ['manga'] },
    });
  });

  test('the startup export is skipped when nothing changed', async () => {
    expect(exportData(db, backups, { onlyIfChanged: true }).file).toBeNull(); // Empty library, no backup yet.
    const id = seedFolder(db, { name: 'A' });
    expect(exportData(db, backups, { onlyIfChanged: true }).file).not.toBeNull();
    expect(exportData(db, backups, { onlyIfChanged: true }).file).toBeNull();
    applyTags(db, { folderIds: [id], mode: 'add', tags: { genre: ['new'] } });
    await Bun.sleep(1100); // File names have one-second resolution.
    expect(exportData(db, backups, { onlyIfChanged: true }).file).not.toBeNull();
    expect(fs.readdirSync(backups)).toHaveLength(2);
  });
});

describe('import', () => {
  const entry = (name: string, tags: Partial<ImportData['folders'][number]['tags']>, extra = {}) => ({
    path: `Q:\\elsewhere\\${name}`,
    name,
    tags: { ...emptyTagMap(), ...tags },
    ...extra,
  });

  test('export then import into an empty library restores folders that exist on disk', () => {
    const dir = makeFolder(root, 'Real Folder', ['1.png']);
    addFolders(db, [dir]);
    const id = listFolders(db, { q: '', sort: 'alpha', page: 1, size: 25 }).items[0]!.id;
    applyTags(db, { folderIds: [id], mode: 'add', tags: { author: ['ann'], genre: ['a', 'b'] } });
    const file = readJson<ExportFile>(exportData(db, backups).file!);

    const fresh = memoryDb();
    expect(importData(fresh, file, 'append', backups)).toEqual({ created: 1, updated: 0, failed: 0, failedFile: null });
    const restored = listFolders(fresh, { q: '', sort: 'alpha', page: 1, size: 25 }).items[0]!;
    expect(restored).toMatchObject({ name: 'Real Folder', path: dir, thumbnail: '1.png' });
    expect(folderTags(fresh, restored.id)).toEqual({ ...emptyTagMap(), author: ['ann'], genre: ['a', 'b'] });
    expect(getFolder(fresh, restored.id).created_at).toBe(file.folders[0]!.createdAt);
  });

  test('folders are matched by name, so a moved folder still matches', () => {
    const id = seedFolder(db, { name: 'Moved Folder' });
    const result = importData(db, { folders: [entry('moved folder', { author: ['  ANN '] })] }, 'append', backups);
    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(folderTags(db, id).author).toEqual(['ann']);
    expect(getFolder(db, id).path).toBe('Z:\\library\\Moved Folder');
  });

  test('append only fills folders that have no tags yet', () => {
    const tagged = seedFolder(db, { name: 'Tagged', tags: { author: ['keep'] } });
    const empty = seedFolder(db, { name: 'Empty' });
    const result = importData(
      db,
      { folders: [entry('Tagged', { author: ['new'] }), entry('Empty', { genre: ['g'] })] },
      'append',
      backups,
    );
    expect(result).toMatchObject({ created: 0, updated: 1, failed: 1 });
    expect(folderTags(db, tagged).author).toEqual(['keep']);
    expect(folderTags(db, empty).genre).toEqual(['g']);
  });

  test('overwrite replaces tags, dates and open count', () => {
    const id = seedFolder(db, { name: 'Tagged', tags: { author: ['old'], genre: ['old'] } });
    const result = importData(
      db,
      { folders: [entry('Tagged', { author: ['new'] }, { createdAt: 111, updatedAt: 222, openCount: 7 })] },
      'overwrite',
      backups,
    );
    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(folderTags(db, id)).toEqual({ ...emptyTagMap(), author: ['new'] });
    expect(getFolder(db, id)).toMatchObject({ created_at: 111, updated_at: 222, open_count: 7 });
  });

  test('fractional dates and counts are rounded instead of failing the import', () => {
    const id = seedFolder(db, { name: 'Tagged' });
    const extra = { createdAt: 111.4, updatedAt: 222.5, openCount: 6.6, lastOpenedAt: 333.2 };
    const data = v.parse(ImportSchema, { folders: [entry('Tagged', { author: ['new'] }, extra)] });
    expect(importData(db, data, 'overwrite', backups)).toMatchObject({ updated: 1, failed: 0 });
    expect(getFolder(db, id)).toMatchObject({ created_at: 111, updated_at: 223, open_count: 7, last_opened_at: 333 });
  });

  test("the old app's export is read: Category becomes a tag, Language is dropped", () => {
    const first = makeFolder(root, 'old one', ['1.png']);
    const second = makeFolder(root, 'old two', ['1.png']);
    const old = [
      {
        FolderLocation: first,
        FolderName: 'old one',
        Category: 'manga',
        Language: 'japanese',
        CreatedAt: 1000,
        UpdatedAt: null,
        Tags: { author: ['Ann'], parody: [], character: [], genre: ['School Girl'] },
      },
      {
        FolderLocation: second,
        FolderName: 'old two',
        Category: null,
        Language: null,
        CreatedAt: 2000,
        UpdatedAt: 3000,
        Tags: { author: [], parody: [], character: [], genre: [] },
      },
    ];
    const result = importData(db, v.parse(ImportSchema, old), 'append', backups);
    expect(result).toMatchObject({ created: 2, failed: 0 });

    const rows = db.query('SELECT id, name, created_at, updated_at FROM folders ORDER BY name').all() as {
      id: number;
    }[];
    expect(rows).toMatchObject([
      { name: 'old one', created_at: 1000, updated_at: 1000 },
      { name: 'old two', created_at: 2000, updated_at: 3000 },
    ]);
    expect(folderTags(db, rows[0]!.id)).toEqual({
      ...emptyTagMap(),
      author: ['ann'],
      genre: ['school girl'],
      category: ['manga'],
    });
    expect(folderTags(db, rows[1]!.id)).toEqual(emptyTagMap());
  });

  test('entries that cannot be imported are written to an IMPORT-FAILED file', () => {
    seedFolder(db, { name: 'Tagged', tags: { author: ['keep'] } });
    const result = importData(
      db,
      { folders: [entry('Tagged', { author: ['new'] }), entry('Not Anywhere', { author: ['x'] })] },
      'append',
      backups,
    );
    expect(result.failed).toBe(2);
    expect(path.basename(result.failedFile!)).toMatch(/-IMPORT-FAILED\.json$/);
    const failed = readJson<{ name: string; reason: string }[]>(result.failedFile!);
    expect(failed.map(f => f.name)).toEqual(['Tagged', 'Not Anywhere']);
    expect(failed[0]!.reason).toContain('already has tags');
    expect(names()).toEqual(['Tagged']);
  });
});

describe('clean-up', () => {
  test('deletes small thumbnail copies that no folder uses any more', async () => {
    const kept = makeFolder(root, 'kept', ['1.png']);
    const changed = makeFolder(root, 'changed', ['1.png']);
    const gone = makeFolder(root, 'gone', ['1.png']);
    addFolders(db, [kept, changed, gone]);
    const copy = (dir: string) => smallThumbnail(path.join(dir, '1.png'), thumbs);
    const copies = { kept: await copy(kept), changed: await copy(changed), gone: await copy(gone) };
    fs.writeFileSync(path.join(thumbs, 'notes.txt'), 'not a copy');

    fs.writeFileSync(path.join(changed, '1.png'), Buffer.concat([PNG, PNG]));
    fs.rmSync(gone, { recursive: true });

    const plan = previewCleanup(db, thumbs);
    expect(plan.unusedCopies.sort()).toEqual([copies.changed, copies.gone].map(file => path.basename(file)).sort());
    expect(fs.readdirSync(thumbs)).toHaveLength(4);

    expect(applyCleanup(db, [], backups, thumbs)).toMatchObject({ removed: 0, copiesDeleted: 2 });
    expect(fs.readdirSync(thumbs).sort()).toEqual([path.basename(copies.kept), 'notes.txt'].sort());
  });

  const fakeDisk = (present: string[], thumbnails: Record<string, string> = {}): Probe => ({
    exists: target => present.includes(target),
    findThumbnail: dir => thumbnails[dir] ?? null,
    unusedCopies: sources => sources,
  });
  const entries = [
    { id: 1, name: 'here', path: 'C:\\lib\\here', thumbnail: '1.png' },
    { id: 2, name: 'gone', path: 'C:\\lib\\gone', thumbnail: '1.png' },
    { id: 3, name: 'unplugged', path: 'E:\\lib\\unplugged', thumbnail: null },
    { id: 4, name: 'also unplugged', path: 'E:\\other', thumbnail: null },
    { id: 5, name: 'lost thumbnail', path: 'C:\\lib\\lost', thumbnail: 'old.png' },
    { id: 6, name: 'no images', path: 'C:\\lib\\empty', thumbnail: null },
    { id: 7, name: 'share', path: '\\\\nas\\media\\share', thumbnail: null },
  ];

  test('folders on an unreachable drive are skipped, never removed', () => {
    const disk = fakeDisk(['C:\\', 'C:\\lib\\here', 'C:\\lib\\here\\1.png', 'C:\\lib\\lost', 'C:\\lib\\empty'], {
      'C:\\lib\\lost': 'new.png',
    });
    expect(planCleanup(entries, disk)).toEqual({
      missing: [{ id: 2, name: 'gone', path: 'C:\\lib\\gone' }],
      offline: [
        { root: 'E:\\', count: 2 },
        { root: '\\\\nas\\media\\', count: 1 },
      ],
      thumbnails: [{ id: 5, thumbnail: 'new.png' }],
      // The fake disk hands back the thumbnails in use: those of reachable, present folders.
      unusedCopies: ['C:\\lib\\here\\1.png', 'C:\\lib\\lost\\new.png'],
    });
  });

  test('with every drive unplugged, nothing is missing', () => {
    const plan = planCleanup(entries, fakeDisk([]));
    expect(plan.missing).toEqual([]);
    expect(plan.offline.map(o => o.count)).toEqual([4, 2, 1]);
  });

  test('apply removes only confirmed entries that are still missing, and logs them', () => {
    const kept = makeFolder(root, 'kept', ['1.png']);
    const gone = makeFolder(root, 'gone', ['1.png']);
    const unconfirmed = makeFolder(root, 'unconfirmed');
    addFolders(db, [kept, gone, unconfirmed]);
    const id = (dir: string) => (db.query('SELECT id FROM folders WHERE path = ?').get(dir) as { id: number }).id;
    const ids = { kept: id(kept), gone: id(gone), unconfirmed: id(unconfirmed) };
    fs.rmSync(gone, { recursive: true });
    fs.rmSync(unconfirmed, { recursive: true });
    fs.rmSync(path.join(kept, '1.png'));
    fs.writeFileSync(path.join(kept, 'cover.jpg'), 'x');

    const result = applyCleanup(db, [ids.gone, ids.kept], backups, thumbs);
    expect(result).toMatchObject({ removed: 1, thumbnailsUpdated: 1 });
    expect(names()).toEqual(['kept', 'unconfirmed']);
    expect(getFolder(db, ids.kept).thumbnail).toBe('cover.jpg');
    expect(path.basename(result.logFile!)).toMatch(/-CLEARED\.json$/);
    expect(readJson<string[]>(result.logFile!)).toEqual([gone]);
  });

  test('re-finding a thumbnail does not count as an update', () => {
    const dir = makeFolder(root, 'a');
    addFolders(db, [dir]);
    db.prepare('UPDATE folders SET updated_at = 1').run();
    fs.writeFileSync(path.join(dir, '1.png'), 'x');
    expect(applyCleanup(db, [], backups, thumbs)).toEqual({
      removed: 0,
      thumbnailsUpdated: 1,
      copiesDeleted: 0,
      logFile: null,
    });
    const row = db.query('SELECT updated_at, thumbnail FROM folders').get();
    expect(row).toEqual({ updated_at: 1, thumbnail: '1.png' });
  });
});

describe('reader', () => {
  test('lists only images directly in the folder, in natural order', () => {
    const dir = makeFolder(root, 'book', [
      '10.png',
      '2.JPG',
      '1.webp',
      'a.gif',
      'b.avif',
      'c.jpeg',
      'notes.txt',
      'pack.zip',
    ]);
    makeFolder(dir, 'chapter 2', ['1.png']);
    expect(listImages(dir)).toEqual(['1.webp', '2.JPG', '10.png', 'a.gif', 'b.avif', 'c.jpeg']);
  });

  test('opening counts the opening and serves images by number', () => {
    const dir = makeFolder(root, 'book', ['2.png', '1.png']);
    addFolders(db, [dir]);
    const id = (db.query('SELECT id FROM folders').get() as { id: number }).id;
    expect(openReader(db, id)).toEqual({ name: 'book', count: 2 });
    expect(getFolder(db, id).open_count).toBe(1);
    expect(imagePath(db, id, 0)).toBe(path.join(dir, '1.png'));
    expect(imagePath(db, id, 1)).toBe(path.join(dir, '2.png'));
    expect(() => imagePath(db, id, 2)).toThrow('No such image.');
  });

  test('a folder without images is not opened, and not counted as opened', () => {
    addFolders(db, [makeFolder(root, 'audio', ['track.txt'])]);
    const id = (db.query('SELECT id FROM folders').get() as { id: number }).id;
    expect(() => openReader(db, id)).toThrow('This folder has no images.');
    expect(db.query('SELECT open_count FROM folders WHERE id = ?').get(id)).toEqual({ open_count: 0 });
  });

  test('a folder outside the library is read without being added', () => {
    expect(() => outsideImagePath(db, 0)).toThrow('No such image.');
    const dir = makeFolder(root, 'outside', ['2.png', '1.png']);
    expect(openOutsideReader(db, dir)).toEqual({ name: 'outside', count: 2 });
    expect(outsideImagePath(db, 0)).toBe(path.join(dir, '1.png'));
    expect(outsideImagePath(db, 1)).toBe(path.join(dir, '2.png'));
    expect(() => outsideImagePath(db, 2)).toThrow('No such image.');
    expect(listFolders(db, { q: '', sort: 'alpha', page: 1, size: 25, noCategory: false }).total).toBe(0);

    expect(() => openOutsideReader(db, makeFolder(root, 'empty', ['notes.txt']))).toThrow('This folder has no images.');
    expect(outsideImagePath(db, 0)).toBe(path.join(dir, '1.png'));
  });
});

test('settings have defaults and keep what is saved', () => {
  expect(getSettings(db)).toEqual({ defaultSearch: '', randomAtStartup: false, pageSize: 25, readerScale: 100 });
  saveSettings(db, { defaultSearch: 'category:manga' });
  expect(saveSettings(db, { randomAtStartup: true })).toEqual({
    defaultSearch: 'category:manga',
    randomAtStartup: true,
    pageSize: 25,
    readerScale: 100,
  });
});
