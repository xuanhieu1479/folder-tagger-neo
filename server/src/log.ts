import fs from 'node:fs';
import path from 'node:path';
import { dateStamp } from './time';

/** Appends an error to today's log file in `logDir`. Logging never throws. */
export function logError(logDir: string, error: unknown, origin: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const entry = `${new Date().toLocaleTimeString('en-GB')}  ${origin}\n${detail}\n${'-'.repeat(80)}\n`;
    fs.appendFileSync(path.join(logDir, `${dateStamp()}.log`), entry);
  } catch {
    // Nowhere left to report it.
  }
}
