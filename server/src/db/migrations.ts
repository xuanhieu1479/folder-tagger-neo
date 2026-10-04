import type { Database } from 'bun:sqlite';

/**
 * Schema changes in order. Never edit an entry that has shipped; append a new one.
 * The database's PRAGMA user_version is the number of entries already applied.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE folders (
    id             INTEGER PRIMARY KEY,
    path           TEXT NOT NULL,
    path_key       TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    name_key       TEXT NOT NULL,
    name_words     TEXT NOT NULL,
    thumbnail      TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    open_count     INTEGER NOT NULL DEFAULT 0,
    last_opened_at INTEGER,
    shuffle_key    INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  CREATE INDEX folders_name_key ON folders(name_key);
  CREATE INDEX folders_updated ON folders(updated_at);

  CREATE TABLE tags (
    id         INTEGER PRIMARY KEY,
    type       TEXT NOT NULL CHECK (type IN ('author', 'parody', 'character', 'genre', 'category')),
    name       TEXT NOT NULL,
    name_words TEXT NOT NULL,
    UNIQUE (type, name)
  ) STRICT;

  CREATE TABLE folder_tags (
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (folder_id, tag_id)
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX folder_tags_tag ON folder_tags(tag_id, folder_id);

  CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT, WITHOUT ROWID;
  `,
];

export const schemaVersion = (db: Database): number =>
  (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;

/** Applies every migration the database has not seen yet, each in its own transaction. */
export function migrate(db: Database, migrations: string[] = MIGRATIONS): void {
  for (let i = schemaVersion(db); i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }
}
