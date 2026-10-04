import { Hono } from 'hono';
import { logDir, type AppContext } from './context';
import { HttpError } from './errors';
import { APP_ID } from './shared/types';
import { logError } from './log';
import { folderRoutes } from './routes/folders';
import { maintenanceRoutes } from './routes/maintenance';
import { relationRoutes, tagRoutes } from './routes/tags';

export function createApp(ctx: AppContext) {
  const app = new Hono().basePath('/api');

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ message: error.message }, error.status);
    logError(logDir(ctx.dataDir), error, `${c.req.method} ${c.req.path}`);
    return c.json({ message: error.message || 'Something went wrong.' }, 500);
  });

  return app
    .get('/health', c => c.json({ ok: true, app: APP_ID }))
    .route('/folders', folderRoutes(ctx))
    .route('/tags', tagRoutes(ctx))
    .route('/relations', relationRoutes(ctx))
    .route('/', maintenanceRoutes(ctx));
}

export type AppType = ReturnType<typeof createApp>;
