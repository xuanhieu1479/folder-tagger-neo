import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS, migrate, schemaVersion } from './migrations';

export const MEMORY = ':memory:';

/**
 * Opens (or creates) the database and brings its schema up to date. A database
 * from an older version is copied to `backupDir` before it is migrated.
 */
export function openDatabase(file: string, backupDir?: string): Database {
  if (file !== MEMORY) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { create: true });
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');

  const version = schemaVersion(db);
  if (backupDir && version > 0 && version < MIGRATIONS.length) {
    fs.mkdirSync(backupDir, { recursive: true });
    const copy = path.join(backupDir, `pre-migration-v${version}-${Date.now()}.db`);
    db.prepare('VACUUM INTO ?').run(copy);
  }
  migrate(db);
  return db;
}

export function getJson<T>(db: Database, key: string, fallback: T): T {
  const row = db.query('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | null;
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setJson(db: Database, key: string, value: unknown): void {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}
