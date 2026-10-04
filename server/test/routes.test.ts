import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app';
import type { AppContext } from '../src/context';
import { makeFolder, memoryDb, PNG, tempDir } from './fixtures';

const tmp = tempDir('routes');
afterAll(tmp.cleanup);

let ctx: AppContext;
let app: ReturnType<typeof createApp>;
let root: string;
let counter = 0;
beforeEach(() => {
  root = path.join(tmp.dir, String(counter++));
  fs.mkdirSync(root);
  ctx = { db: memoryDb(), dataDir: path.join(root, 'data') };
  app = createApp(ctx);
});

const get = (url: string) => app.request(`/api${url}`);
const send = (url: string, body: unknown = {}, method = 'POST') =>
  app.request(`/api${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
// Route tests look at plain JSON; the typed client is checked by the web type check.
const json = async (response: Response | Promise<Response>): Promise<any> => (await response).json();

test('health', async () => {
  expect(await json(get('/health'))).toEqual({ ok: true, app: 'folder-tagger-neo' });
});

describe('folders', () => {
  test('add, list, tag, search and remove', async () => {
    const first = makeFolder(root, 'First Book', ['1.png']);
    const second = makeFolder(root, 'Second Book');
    expect(await json(send('/folders', { paths: [first, second, first] }))).toMatchObject({ added: 2 });

    const list = await json(get('/folders?sort=alpha&page=1&size=25'));
    expect(list).toMatchObject({ total: 2, page: 1, pages: 1 });
    const [a, b] = list.items;
    expect(a).toMatchObject({ name: 'First Book', thumbnail: '1.png' });

    await send('/tags/apply', { folderIds: [a.id, b.id], mode: 'add', tags: { author: ['Ann'], category: ['manga'] } });
    await send('/tags/apply', { folderIds: [b.id], mode: 'add', tags: { genre: ['drama'] } });
    expect(await json(get(`/folders/${b.id}/tags`))).toMatchObject({ author: ['ann'], genre: ['drama'] });
    expect((await json(get('/folders?q=' + encodeURIComponent('genre:drama')))).items.map((f: any) => f.name)).toEqual([
      'Second Book',
    ]);
    expect((await json(get('/folders?category=manga&q=first'))).total).toBe(1);
    expect((await json(get('/folders?noCategory=1'))).total).toBe(0);
    expect(await json(get('/tags'))).toContainEqual({ type: 'author', name: 'ann', count: 2 });

    expect(await json(send('/folders/remove', { ids: [a.id] }))).toEqual({ removed: 1 });
    expect((await json(get('/folders'))).total).toBe(1);
  });

  test('a page past the end is clamped', async () => {
    await send('/folders', { paths: [makeFolder(root, 'Only')] });
    expect(await json(get('/folders?page=40&size=25'))).toMatchObject({ total: 1, page: 1 });
  });

  test('thumbnail and reader images are served as files', async () => {
    const dir = makeFolder(root, 'テスト 100% #1', ['2.png', '1.png']);
    await send('/folders', { paths: [dir] });
    const id = (await json(get('/folders'))).items[0].id;

    const thumbnail = await get(`/folders/${id}/thumbnail`);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get('content-type')).toBe('image/webp');
    expect(
      Buffer.from(await thumbnail.arrayBuffer())
        .subarray(8, 12)
        .toString(),
    ).toBe('WEBP');

    expect(await json(send(`/folders/${id}/read`))).toEqual({ name: 'テスト 100% #1', count: 2 });
    expect((await get(`/folders/${id}/images/1`)).status).toBe(200);
    expect((await get(`/folders/${id}/images/2`)).status).toBe(404);
  });

  test('rename', async () => {
    await send('/folders', { paths: [makeFolder(root, 'Before')] });
    const id = (await json(get('/folders'))).items[0].id;
    expect(await json(send(`/folders/${id}/rename`, { name: 'After' }))).toMatchObject({ name: 'After' });
    expect(fs.existsSync(path.join(root, 'After'))).toBe(true);
    const duplicate = await send(`/folders/${id}/rename`, { name: '' });
    expect(duplicate.status).toBe(400);
    expect(await json(duplicate)).toEqual({ message: 'Folder name cannot be empty.' });
  });
});

describe('errors', () => {
  test('an unknown folder is a 404 with a message', async () => {
    const response = await get('/folders/999/tags');
    expect(response.status).toBe(200); // Tags of an unknown folder are simply empty.
    const missing = await send('/folders/999/rename', { name: 'x' });
    expect(missing.status).toBe(404);
    expect(await json(missing)).toEqual({ message: 'This folder is no longer in the library.' });
  });

  test('a malformed body is a 400', async () => {
    const response = await send('/tags/apply', { folderIds: ['x'], mode: 'add', tags: {} });
    expect(response.status).toBe(400);
    expect((await json(response)).message).toStartWith('Invalid request');
  });

  test('editing several folders at once is refused', async () => {
    const response = await send('/tags/apply', { folderIds: [1, 2], mode: 'edit', tags: {} });
    expect(response.status).toBe(400);
  });
});

describe('maintenance', () => {
  test('manage tags, clear unused, relations', async () => {
    await send('/folders', { paths: [makeFolder(root, 'A')] });
    const id = (await json(get('/folders'))).items[0].id;
    await send('/tags/apply', { folderIds: [id], mode: 'add', tags: { genre: ['funy', 'funny'] } });
    expect(await json(send('/tags/manage', { type: 'genre', changes: [{ from: 'funy', to: 'funny' }] }))).toEqual({
      renamed: 0,
      merged: 1,
      deleted: 0,
    });
    await send('/tags/clear-folders', { folderIds: [id] });
    expect(await json(send('/tags/clear-unused'))).toEqual({ removed: 1 });
    expect(await json(send('/relations/calculate'))).toEqual(await json(get('/relations')));
  });

  test('export, import and clean-up', async () => {
    const dir = makeFolder(root, 'A', ['1.png']);
    await send('/folders', { paths: [dir] });
    const exported = await json(send('/export'));
    expect(exported.count).toBe(1);
    const data = JSON.parse(fs.readFileSync(exported.file, 'utf8'));
    data.folders[0].tags.author = ['imported'];
    expect(await json(send('/import', { mode: 'append', data }))).toMatchObject({ updated: 1, failed: 0 });

    fs.rmSync(dir, { recursive: true });
    const preview = await json(get('/cleanup'));
    expect(preview.missing).toHaveLength(1);
    expect(await json(send('/cleanup', { removeIds: [preview.missing[0].id] }))).toMatchObject({ removed: 1 });
    expect((await json(get('/folders'))).total).toBe(0);
  });

  test('settings', async () => {
    expect(await json(get('/settings'))).toEqual({
      defaultSearch: '',
      randomAtStartup: false,
      pageSize: 25,
      readerScale: 100,
    });
    expect(await json(send('/settings', { pageSize: 50, defaultSearch: 'no_author' }, 'PUT'))).toEqual({
      defaultSearch: 'no_author',
      randomAtStartup: false,
      pageSize: 50,
      readerScale: 100,
    });
    expect((await send('/settings', { pageSize: 33 }, 'PUT')).status).toBe(400);
    expect(await json(send('/settings', { readerScale: 150 }, 'PUT'))).toMatchObject({ readerScale: 150 });
    expect((await send('/settings', { readerScale: 250 }, 'PUT')).status).toBe(400);
  });
});
