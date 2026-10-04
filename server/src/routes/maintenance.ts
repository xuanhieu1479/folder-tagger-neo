import { Hono } from 'hono';
import * as v from 'valibot';
import { backupDir, type AppContext } from '../context';
import { applyCleanup, previewCleanup } from '../services/cleanup';
import { getSettings, saveSettings } from '../services/settings';
import { exportData, importData, ImportSchema } from '../services/transfer';
import { PAGE_SIZES } from '../shared/types';
import { jsonBody } from '../validate';

const ImportBody = v.object({ mode: v.picklist(['append', 'overwrite']), data: ImportSchema });

const SettingsSchema = v.partial(
  v.object({
    defaultSearch: v.string(),
    randomAtStartup: v.boolean(),
    pageSize: v.picklist(PAGE_SIZES),
  }),
);

export const maintenanceRoutes = (ctx: AppContext) =>
  new Hono()
    .get('/cleanup', c => c.json(previewCleanup(ctx.db)))
    .post('/cleanup', jsonBody(v.object({ removeIds: v.array(v.number()) })), c =>
      c.json(applyCleanup(ctx.db, c.req.valid('json').removeIds, backupDir(ctx))),
    )
    .post('/export', c => c.json(exportData(ctx.db, backupDir(ctx))))
    .post('/import', jsonBody(ImportBody), c => {
      const { mode, data } = c.req.valid('json');
      return c.json(importData(ctx.db, data, mode, backupDir(ctx)));
    })
    .get('/settings', c => c.json(getSettings(ctx.db)))
    .put('/settings', jsonBody(SettingsSchema), c => c.json(saveSettings(ctx.db, c.req.valid('json'))));
