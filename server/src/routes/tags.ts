import { Hono } from 'hono';
import * as v from 'valibot';
import type { AppContext } from '../context';
import { calculateRelations, getRelations } from '../services/relations';
import { applyTags, clearFolderTags, clearUnusedTags, listTags, manageTags } from '../services/tags';
import { APPLY_MODES, TAG_TYPES } from '../shared/types';
import { jsonBody, TagMapSchema } from '../validate';

const ApplySchema = v.object({
  folderIds: v.array(v.number()),
  mode: v.picklist(APPLY_MODES),
  tags: TagMapSchema,
});

const ManageSchema = v.object({
  type: v.picklist(TAG_TYPES),
  changes: v.array(v.object({ from: v.string(), to: v.string() })),
});

export const tagRoutes = (ctx: AppContext) =>
  new Hono()
    .get('/', c => c.json(listTags(ctx.db)))
    .post('/apply', jsonBody(ApplySchema), c => {
      applyTags(ctx.db, c.req.valid('json'));
      return c.json({ ok: true });
    })
    .post('/clear-folders', jsonBody(v.object({ folderIds: v.array(v.number()) })), c => {
      clearFolderTags(ctx.db, c.req.valid('json').folderIds);
      return c.json({ ok: true });
    })
    .post('/manage', jsonBody(ManageSchema), c => {
      const { type, changes } = c.req.valid('json');
      return c.json(manageTags(ctx.db, type, changes));
    })
    .post('/clear-unused', c => c.json({ removed: clearUnusedTags(ctx.db) }));

export const relationRoutes = (ctx: AppContext) =>
  new Hono().get('/', c => c.json(getRelations(ctx.db))).post('/calculate', c => c.json(calculateRelations(ctx.db)));
