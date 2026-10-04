import type { Database } from 'bun:sqlite';
import type { Context as HonoContext } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './errors';
import { fileStamp } from './time';

/** What every route needs: the database and where files are written. */
export type AppContext = {
  db: Database;
  dataDir: string;
};

export const backupDir = (dataDir: string) => path.join(dataDir, 'backups');
export const logDir = (dataDir: string) => path.join(dataDir, 'logs');

/** Writes `data` as JSON to a new file named after the current time plus `suffix`, and returns its path. */
export function writeStampedJson(dir: string, suffix: string, data: unknown): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${fileStamp()}${suffix}`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Reads a numeric route parameter such as :id. */
export function numberParam(c: HonoContext, name: string): number {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value < 0) throw new HttpError(400, `Invalid ${name}.`);
  return value;
}
