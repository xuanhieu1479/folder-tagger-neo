import path from 'node:path';

export const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');

export type Config = {
  port: number;
  /** Database, backups and logs. Always inside the project unless FT_DATA_DIR says otherwise. */
  dataDir: string;
  webDist: string;
};

export function loadConfig(): Config {
  return {
    port: Number(process.env.FT_PORT ?? 4710),
    dataDir: path.resolve(process.env.FT_DATA_DIR ?? path.join(PROJECT_ROOT, 'data')),
    webDist: path.join(PROJECT_ROOT, 'web', 'dist'),
  };
}
