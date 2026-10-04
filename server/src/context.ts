import type { Database } from 'bun:sqlite';
import type { Context as HonoContext } from 'hono';
import path from 'node:path';
import { HttpError } from './errors';

/** What every route needs: the database and where files are written. */
export type AppContext = {
  db: Database;
  dataDir: string;
};

export const backupDir = (ctx: AppContext) => path.join(ctx.dataDir, 'backups');
export const logDir = (ctx: AppContext) => path.join(ctx.dataDir, 'logs');

/** Reads a numeric route parameter such as :id. */
export function numberParam(c: HonoContext, name: string): number {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value < 0) throw new HttpError(400, `Invalid ${name}.`);
  return value;
}
