import { Hono } from 'hono';
import { HttpError } from './errors';

export function createApp() {
  const app = new Hono().basePath('/api');

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ message: error.message }, error.status);
    return c.json({ message: error.message }, 500);
  });

  return app.get('/health', c => c.json({ ok: true }));
}

export type AppType = ReturnType<typeof createApp>;
