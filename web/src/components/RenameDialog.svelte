<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { library } from '$lib/state/library.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  let id = $state<number | null>(null);
  let name = $state('');
  let saving = $state(false);

  $effect(() => {
    if (!ui.renameOpen) return;
    untrack(() => {
      const folder = library.selectedFolders[0];
      id = folder?.id ?? null;
      name = folder?.name ?? '';
    });
  });

  async function rename(event: SubmitEvent) {
    event.preventDefault();
    if (id === null) return;
    const folderId = id;
    saving = true;
    const renamed = await attempt(() =>
      call(api.folders[':id'].rename.$post({ param: { id: String(folderId) }, json: { name } })),
    );
    saving = false;
    if (!renamed) return;
    const index = library.items.findIndex(folder => folder.id === folderId);
    if (index !== -1) library.items[index] = renamed;
    toast.success('Success');
    ui.renameOpen = false;
  }
</script>

<Dialog.Root open={ui.renameOpen} onOpenChange={open => !open && (ui.renameOpen = false)}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Rename Folder</Dialog.Title>
      <Dialog.Description>The folder is renamed on disk. Its tags are kept.</Dialog.Description>
    </Dialog.Header>
    <form class="grid gap-4" onsubmit={rename}>
      <Input bind:value={name} aria-label="New folder name" spellcheck={false} autocomplete="off" />
      <Dialog.Footer>
        <Button variant="outline" onclick={() => (ui.renameOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={saving}>Rename</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
