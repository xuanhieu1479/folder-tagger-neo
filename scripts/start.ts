// Starts Folder Tagger: runs the server if it is not running yet, then opens the app window.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, PROJECT_ROOT } from '../server/src/config';
import { logDir } from '../server/src/context';
import { APP_ID } from '../server/src/shared/types';

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const START_TIMEOUT_MS = 15000;

const config = loadConfig();
const url = `http://127.0.0.1:${config.port}`;

async function isRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    return ((await response.json()) as { app?: string }).app === APP_ID;
  } catch {
    return false;
  }
}

/** When the server's code last changed. */
function codeChangedAt(): number {
  const dir = path.join(PROJECT_ROOT, 'server', 'src');
  const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
  return Math.max(...files.map(file => fs.statSync(path.join(file.parentPath, file.name)).mtimeMs));
}

/** Stops a running server that was started before its code last changed. */
async function stopOutdatedServer(): Promise<void> {
  const response = await fetch(`${url}/api/server`, { signal: AbortSignal.timeout(1000) });
  const startedAt = response.ok ? ((await response.json()) as { startedAt: number }).startedAt : 0;
  if (startedAt >= codeChangedAt()) return;
  await fetch(`${url}/api/quit`, { method: 'POST', signal: AbortSignal.timeout(1000) });
  const deadline = Date.now() + 5000;
  while (await isRunning()) {
    if (Date.now() > deadline) {
      console.error('An older Folder Tagger server is still running. Close its window, wait a moment and try again.');
      process.exit(1);
    }
    await Bun.sleep(150);
  }
}

const detached = (command: string, args: string[], env = process.env) =>
  spawn(command, args, { cwd: PROJECT_ROOT, env, detached: true, windowsHide: true, stdio: 'ignore' }).unref();

if (await isRunning()) await stopOutdatedServer();

if (!(await isRunning())) {
  if (!fs.existsSync(path.join(config.webDist, 'index.html'))) {
    console.log('Building the web app (first start only)...');
    const build = Bun.spawnSync([process.execPath, 'run', 'build'], {
      cwd: PROJECT_ROOT,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
  }
  // The server stops by itself a few seconds after the app window closes.
  detached(process.execPath, [path.join('server', 'src', 'main.ts')], { ...process.env, FT_EXIT_WHEN_IDLE: '1' });

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!(await isRunning())) {
    if (Date.now() > deadline) {
      console.error(`The server did not start. Check the log files in ${logDir(config.dataDir)}.`);
      process.exit(1);
    }
    await Bun.sleep(150);
  }
}

const edge = EDGE_PATHS.find(candidate => fs.existsSync(candidate));
if (edge) detached(edge, [`--app=${url}`]);
else detached('cmd.exe', ['/c', 'start', '', url]); // No Edge: fall back to the default browser.
