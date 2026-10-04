import { api, attempt, call } from '$lib/api';
import { library } from '$lib/state/library.svelte';
import { tags } from '$lib/state/tags.svelte';
import { ui } from '$lib/state/ui.svelte';
import { toast } from 'svelte-sonner';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const idParam = (id: number) => ({ param: { id: String(id) } });

/** Shows the Windows folder dialog and adds what was chosen. */
export async function addFolders(multi: boolean): Promise<void> {
  const result = await attempt(() => call(api.folders.pick.$post({ json: { multi } })));
  if (!result || result.picked === 0) return;
  if (result.added > 0) {
    toast.success(`Added ${plural(result.added, 'folder')}.`);
    await library.showNewest();
  }
  if (result.skipped.length > 0) {
    const reasons = [...new Set(result.skipped.map(skipped => skipped.reason.toLowerCase()))].join('; ');
    toast.info(`Skipped ${plural(result.skipped.length, 'folder')}: ${reasons}.`);
  }
}

export async function openReader(id: number): Promise<void> {
  const opened = await attempt(() => call(api.folders[':id'].read.$post(idParam(id))));
  if (opened) ui.reader = { id, ...opened, version: Date.now() };
}

export async function openInExplorer(id: number): Promise<void> {
  await attempt(() => call(api.folders[':id'].explorer.$post(idParam(id))));
}

/** Removes folders from the library (not from disk). Asks first when there are several. */
export async function removeFromLibrary(ids: number[]): Promise<void> {
  if (
    ids.length > 1 &&
    !(await ui.confirm(
      `Remove ${ids.length} folders from the library?`,
      'Their tags are removed with them. The folders on disk are not touched.',
      'Remove',
    ))
  )
    return;
  const result = await attempt(() => call(api.folders.remove.$post({ json: { ids } })));
  if (!result) return;
  toast.success(`Removed ${plural(result.removed, 'folder')} from the library.`);
  await library.load();
}

/** Removes every tag from the folders. Asks first when there are several. */
export async function removeAllTags(ids: number[]): Promise<void> {
  if (
    ids.length > 1 &&
    !(await ui.confirm(
      `Remove all tags from ${ids.length} folders?`,
      'Every tag on these folders is removed.',
      'Remove tags',
    ))
  )
    return;
  const result = await attempt(() => call(api.tags['clear-folders'].$post({ json: { folderIds: ids } })));
  if (!result) return;
  toast.success('Success');
  await Promise.all([tags.load(), library.load()]);
}

export async function calculateRelations(): Promise<void> {
  const relations = await ui.whileBusy(() => attempt(() => call(api.relations.calculate.$post())));
  if (!relations) return;
  tags.relations = relations;
  const learned = Object.values(relations).some(map => Object.keys(map).length > 0);
  if (learned) toast.success('Tag relations calculated.');
  else toast.info('Not enough information to calculate tag relations');
}

export async function clearUnusedTags(): Promise<void> {
  const result = await attempt(() => call(api.tags['clear-unused'].$post()));
  if (!result) return;
  toast.success(`Removed ${plural(result.removed, 'unused tag')}.`);
  await tags.load();
}

export async function exportData(): Promise<void> {
  const result = await ui.whileBusy(() => attempt(() => call(api.export.$post())));
  if (result) toast.success(`Exported ${plural(result.count, 'folder')} to ${result.file}`);
}
