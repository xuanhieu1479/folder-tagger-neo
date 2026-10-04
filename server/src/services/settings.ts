import type { Database } from 'bun:sqlite';
import { getJson, setJson } from '../db/open';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const SETTINGS_KEY = 'settings';

export const getSettings = (db: Database): Settings => ({
  ...DEFAULT_SETTINGS,
  ...getJson<Partial<Settings>>(db, SETTINGS_KEY, {}),
});

export function saveSettings(db: Database, changes: Partial<Settings>): Settings {
  const settings = { ...getSettings(db), ...changes };
  setJson(db, SETTINGS_KEY, settings);
  return settings;
}
