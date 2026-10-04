<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { library } from '$lib/state/library.svelte';
  import { tags } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import type { ImportMode } from '$server/shared/types';
  import { toast } from 'svelte-sonner';

  let files = $state<FileList | undefined>();
  let mode = $state<ImportMode>('append');

  const MODES = [
    { value: 'append', label: 'Append', detail: 'Only fills folders that have no tags yet.' },
    { value: 'overwrite', label: 'Overwrite', detail: 'Replaces the tags, dates and open count of matching folders.' },
  ] as const;

  async function runImport() {
    const file = files?.[0];
    if (!file) return;
    const result = await ui.whileBusy(() =>
      attempt(async () => {
        let data: unknown;
        try {
          data = JSON.parse(await file.text());
        } catch {
          throw new Error('This file is not valid JSON.');
        }
        return call(api.import.$post({ json: { mode, data: data as never } }));
      }),
    );
    if (!result) return;
    toast.success(`Imported: ${result.created} added, ${result.updated} updated.`);
    if (result.failed > 0)
      toast.warning(`${result.failed} could not be imported. They are listed in ${result.failedFile}`, {
        duration: 15000,
      });
    ui.importOpen = false;
    files = undefined;
    await Promise.all([tags.load(), library.showNewest()]);
  }
</script>

<Dialog.Root bind:open={ui.importOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Import Data</Dialog.Title>
      <Dialog.Description>
        Choose a file made by Export, here or in the old Folder Tagger. Folders are matched by folder name, so folders
        that were moved still match.
      </Dialog.Description>
    </Dialog.Header>

    <Input type="file" accept=".json,application/json" aria-label="Export file" bind:files />

    <div class="grid gap-2">
      {#each MODES as option (option.value)}
        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input type="radio" class="mt-1" name="import-mode" value={option.value} bind:group={mode} />
          <span><span class="font-medium">{option.label}.</span> {option.detail}</span>
        </label>
      {/each}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (ui.importOpen = false)}>Cancel</Button>
      <Button disabled={!files?.length} onclick={runImport}>Import</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
