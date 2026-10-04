import { Hono } from 'hono';
import path from 'node:path';
import * as v from 'valibot';
import { numberParam, type AppContext } from '../context';
import { getJson, setJson } from '../db/open';
import { HttpError } from '../errors';
import {
  addFolders,
  getFolder,
  listFolders,
  markOpened,
  removeFolders,
  renameFolder,
  shuffleFolders,
} from '../services/folders';
import { openInExplorer, pickFolders } from '../services/os';
import { imagePath, openReader } from '../services/reader';
import { folderTags } from '../services/tags';
import { PAGE_SIZES, SORTS } from '../shared/types';
import { jsonBody, queryParams } from '../validate';

const PICKER_DIR_KEY = 'pickerDir';

const numberText = (fallback: number) =>
  v.pipe(v.optional(v.string(), String(fallback)), v.transform(Number), v.integer(), v.minValue(1));

const ListQuery = v.object({
  q: v.optional(v.string(), ''),
  category: v.optional(v.string()),
  noCategory: v.optional(v.string()),
  sort: v.optional(v.picklist(SORTS), 'alpha'),
  page: numberText(1),
  size: numberText(PAGE_SIZES[0]),
});

const Ids = v.object({ ids: v.array(v.number()) });

const imageResponse = (file: string, maxAge: number) => {
  const image = Bun.file(file);
  return new Response(image, { headers: { 'Cache-Control': `private, max-age=${maxAge}` } });
};

export const folderRoutes = (ctx: AppContext) =>
  new Hono()
    .get('/', queryParams(ListQuery), c => {
      const query = c.req.valid('query');
      const size = Math.min(query.size, PAGE_SIZES.at(-1)!);
      return c.json(listFolders(ctx.db, { ...query, size, noCategory: query.noCategory === '1' }));
    })
    .post('/', jsonBody(v.object({ paths: v.array(v.string()) })), c =>
      c.json(addFolders(ctx.db, c.req.valid('json').paths)),
    )
    // Shows the native folder dialog, then adds whatever was chosen.
    .post('/pick', jsonBody(v.object({ multi: v.boolean() })), async c => {
      const paths = await pickFolders(c.req.valid('json').multi, getJson(ctx.db, PICKER_DIR_KEY, ''));
      if (paths[0]) setJson(ctx.db, PICKER_DIR_KEY, path.dirname(paths[0]));
      return c.json({ picked: paths.length, ...addFolders(ctx.db, paths) });
    })
    .post('/remove', jsonBody(Ids), c => c.json({ removed: removeFolders(ctx.db, c.req.valid('json').ids) }))
    .post('/shuffle', c => {
      shuffleFolders(ctx.db);
      return c.json({ ok: true });
    })
    .post('/:id/rename', jsonBody(v.object({ name: v.string() })), c =>
      c.json(renameFolder(ctx.db, numberParam(c, 'id'), c.req.valid('json').name)),
    )
    .post('/:id/explorer', c => {
      const id = numberParam(c, 'id');
      openInExplorer(getFolder(ctx.db, id).path);
      markOpened(ctx.db, id);
      return c.json({ ok: true });
    })
    .get('/:id/tags', c => c.json(folderTags(ctx.db, numberParam(c, 'id'))))
    .get('/:id/thumbnail', c => {
      const folder = getFolder(ctx.db, numberParam(c, 'id'));
      if (!folder.thumbnail) throw new HttpError(404, 'This folder has no thumbnail.');
      // The URL carries the file name as a version, so a changed thumbnail gets a new URL.
      return imageResponse(path.join(folder.path, folder.thumbnail), 86400);
    })
    .post('/:id/read', c => c.json(openReader(ctx.db, numberParam(c, 'id'))))
    .get('/:id/images/:index', c =>
      imageResponse(imagePath(ctx.db, numberParam(c, 'id'), numberParam(c, 'index')), 300),
    );
