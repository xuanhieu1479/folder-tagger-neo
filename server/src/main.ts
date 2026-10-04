import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { backupDir, logDir, type AppContext } from './context';
import { openDatabase } from './db/open';
import { logError } from './log';
import { exportData } from './services/transfer';

/** How long the server keeps running after the last app window closes. */
const EXIT_DELAY_MS = 4000;

const config = loadConfig();
const ctx: AppContext = {
  db: openDatabase(path.join(config.dataDir, 'app.db'), backupDir(config.dataDir)),
  dataDir: config.dataDir,
};
const app = createApp(ctx);

process.on('uncaughtException', error => logError(logDir(ctx.dataDir), error, 'uncaughtException'));
process.on('unhandledRejection', error => logError(logDir(ctx.dataDir), error, 'unhandledRejection'));

try {
  exportData(ctx.db, backupDir(ctx.dataDir), { onlyIfChanged: true });
} catch (error) {
  logError(logDir(ctx.dataDir), error, 'startup export');
}

// Each open app window holds one connection to /api/alive. When the last one
// closes, the server stops (only when started with FT_EXIT_WHEN_IDLE=1).
let windows = 0;
let exitTimer: ReturnType<typeof setTimeout> | undefined;

function alive(request: Request): Response {
  windows++;
  clearTimeout(exitTimer);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
      request.signal.addEventListener('abort', () => {
        windows--;
        if (windows === 0 && process.env.FT_EXIT_WHEN_IDLE === '1')
          exitTimer = setTimeout(() => {
            ctx.db.close();
            process.exit(0);
          }, EXIT_DELAY_MS);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

/** Serves the built web app; any unknown path gets index.html. */
function staticFile(pathname: string): Response {
  const file = path.join(config.webDist, path.normalize(decodeURIComponent(pathname)));
  if (file.startsWith(config.webDist) && fs.statSync(file, { throwIfNoEntry: false })?.isFile())
    return new Response(Bun.file(file));
  const index = path.join(config.webDist, 'index.html');
  if (fs.existsSync(index)) return new Response(Bun.file(index));
  return new Response('The web app has not been built yet. Run: bun run build', { status: 503 });
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: config.port,
  idleTimeout: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/alive') return alive(request);
    if (pathname.startsWith('/api/')) return app.fetch(request);
    return staticFile(pathname);
  },
});

console.log(`Folder Tagger is running at http://127.0.0.1:${server.port}`);
