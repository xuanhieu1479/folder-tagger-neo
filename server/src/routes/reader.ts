import { Hono } from 'hono';
import path from 'node:path';
import { numberParam, type AppContext } from '../context';
import { getJson, setJson } from '../db/open';
import { pickFolders } from '../services/os';
import { openOutsideReader, outsideImagePath } from '../services/reader';
import { imageResponse } from './folders';

const PICKER_DIR_KEY = 'readerPickerDir';

/** The reader for a folder that is not in the library. */
export const readerRoutes = (ctx: AppContext) =>
  new Hono()
    // Shows the native folder dialog, then opens whatever was chosen. Answers null when cancelled.
    .post('/pick', async c => {
      const [dir] = await pickFolders(false, getJson(ctx.db, PICKER_DIR_KEY, ''));
      if (!dir) return c.json(null);
      setJson(ctx.db, PICKER_DIR_KEY, path.dirname(dir));
      return c.json(openOutsideReader(ctx.db, dir));
    })
    .get('/images/:index', c => imageResponse(outsideImagePath(ctx.db, numberParam(c, 'index')), 300));
