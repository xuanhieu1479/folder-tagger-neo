import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../config';
import { HttpError } from '../errors';

const PICKER_SCRIPT = path.join(PROJECT_ROOT, 'server', 'pick-folder.ps1');
const PICKER_TITLE = 'Folder Tagger - Select folder';

let pickerOpen = false;

/**
 * Shows the native Windows folder dialog and returns the chosen paths (none if cancelled).
 * With `multi`, several folders inside one parent can be chosen with Ctrl or Shift.
 */
export async function pickFolders(multi: boolean, initialPath = ''): Promise<string[]> {
  if (pickerOpen) throw new HttpError(409, 'A folder dialog is already open.');
  pickerOpen = true;
  try {
    const args = ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', PICKER_SCRIPT];
    args.push('-Title', PICKER_TITLE, '-InitialPath', initialPath);
    if (multi) args.push('-Multi');
    const picker = Bun.spawn(['powershell.exe', ...args], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    });
    const [output, errors] = await Promise.all([
      new Response(picker.stdout).text(),
      new Response(picker.stderr).text(),
    ]);
    if ((await picker.exited) !== 0) throw new Error(`The folder dialog failed: ${errors.trim() || 'unknown error'}`);
    return (JSON.parse(output) as { paths: string[] }).paths;
  } finally {
    pickerOpen = false;
  }
}

/** Opens a folder in Windows Explorer without waiting for Explorer to close. */
export function openInExplorer(folderPath: string): void {
  if (!fs.existsSync(folderPath)) throw new HttpError(404, `${folderPath}\ndoes not exist!`);
  // No windowsHide here: Explorer would open its window hidden.
  spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore' }).unref();
}
