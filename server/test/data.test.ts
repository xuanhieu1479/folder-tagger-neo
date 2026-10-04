import type { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { applyCleanup, planCleanup, type Probe } from '../src/services/cleanup';
import { addFolders, getFolder, listFolders } from '../src/services/folders';
import { imagePath, listImages, openReader } from '../src/services/reader';
import { getSettings, saveSettings } from '../src/services/settings';
import { applyTags, folderTags } from '../src/services/tags';
import { exportData, importData, type ImportData } from '../src/services/transfer';
import { emptyTagMap, type ExportFile } from '../src/shared/types';
import { makeFolder, memoryDb, seedFolder, tempDir } from './fixtures';

const tmp = tempDir('data');
afterAll(tmp.cleanup);

let db: Database;
let root: string;
let backups: string;
let counter = 0;
beforeEach(() => {
  db = memoryDb();
  root = path.join(tmp.dir, String(counter++));
  backups = path.join(root, 'backups');
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
    const result = importData(db, { folders: [entry('moved folder', { author: ['Ann!'] })] }, 'append', backups);
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
  const fakeDisk = (present: string[], thumbnails: Record<string, string> = {}): Probe => ({
    exists: target => present.includes(target),
    findThumbnail: dir => thumbnails[dir] ?? null,
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

    const result = applyCleanup(db, [ids.gone, ids.kept], backups);
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
    expect(applyCleanup(db, [], backups)).toEqual({ removed: 0, thumbnailsUpdated: 1, logFile: null });
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

  test('a folder without images just has none', () => {
    addFolders(db, [makeFolder(root, 'audio', ['track.txt'])]);
    const id = (db.query('SELECT id FROM folders').get() as { id: number }).id;
    expect(openReader(db, id)).toEqual({ name: 'audio', count: 0 });
  });
});

test('settings have defaults and keep what is saved', () => {
  expect(getSettings(db)).toEqual({ defaultSearch: '', randomAtStartup: false, pageSize: 25 });
  saveSettings(db, { defaultSearch: 'category:manga' });
  expect(saveSettings(db, { randomAtStartup: true })).toEqual({
    defaultSearch: 'category:manga',
    randomAtStartup: true,
    pageSize: 25,
  });
});
