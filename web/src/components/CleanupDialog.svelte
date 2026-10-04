<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { library } from '$lib/state/library.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  type Plan = {
    missing: { id: number; name: string; path: string }[];
    offline: { root: string; count: number }[];
    thumbnails: { id: number; thumbnail: string | null }[];
  };

  let plan = $state<Plan | null>(null);
  let working = $state(false);

  const nothingToDo = $derived(plan !== null && plan.missing.length === 0 && plan.thumbnails.length === 0);

  // Check the disk each time the dialog opens. Nothing is changed until the user confirms.
  $effect(() => {
    if (!ui.cleanupOpen) return;
    untrack(() => {
      plan = null;
      void attempt(() => call(api.cleanup.$get())).then(result => {
        if (result) plan = result;
        else ui.cleanupOpen = false;
      });
    });
  });

  async function apply() {
    if (!plan) return;
    working = true;
    const removeIds = plan.missing.map(entry => entry.id);
    const result = await attempt(() => call(api.cleanup.$post({ json: { removeIds } })));
    working = false;
    if (!result) return;
    toast.success(`Removed ${result.removed} entries, updated ${result.thumbnailsUpdated} thumbnails.`);
    if (result.logFile) toast.info(`The removed paths are saved in ${result.logFile}`, { duration: 15000 });
    ui.cleanupOpen = false;
    await library.load();
  }
</script>

<Dialog.Root open={ui.cleanupOpen} onOpenChange={open => !open && (ui.cleanupOpen = false)}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Clean Up Missing Folders</Dialog.Title>
      <Dialog.Description>
        Removes library entries whose folders no longer exist and finds missing thumbnails. Nothing on disk is deleted.
      </Dialog.Description>
    </Dialog.Header>

    {#if plan === null}
      <p class="py-6 text-center text-muted-foreground">Checking folders…</p>
    {:else}
      <div class="grid gap-3 text-sm">
        {#each plan.offline as drive (drive.root)}
          <p class="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
            <span class="font-medium">{drive.root}</span> can't be reached.
            {drive.count} folder{drive.count === 1 ? '' : 's'} on it will be left alone.
          </p>
        {/each}

        {#if nothingToDo}
          <p class="py-4 text-center text-muted-foreground">Nothing to clean up.</p>
        {:else}
          <p>
            <span class="font-medium">{plan.missing.length}</span>
            entr{plan.missing.length === 1 ? 'y' : 'ies'} to remove,
            <span class="font-medium">{plan.thumbnails.length}</span>
            thumbnail{plan.thumbnails.length === 1 ? '' : 's'} to update.
          </p>
          {#if plan.missing.length > 0}
            <ul class="max-h-72 overflow-y-auto rounded-lg border px-3 py-2">
              {#each plan.missing as entry (entry.id)}
                <li class="truncate py-0.5" title={entry.path}>{entry.path}</li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (ui.cleanupOpen = false)}>{nothingToDo ? 'Close' : 'Cancel'}</Button>
      {#if plan !== null && !nothingToDo}
        <Button variant={plan.missing.length > 0 ? 'destructive' : 'default'} disabled={working} onclick={apply}>
          {plan.missing.length > 0 ? `Remove ${plan.missing.length} and update thumbnails` : 'Update thumbnails'}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
