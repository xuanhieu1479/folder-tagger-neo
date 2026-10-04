<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Toaster } from '$lib/components/ui/sonner';
  import { library } from '$lib/state/library.svelte';
  import { settings, tags } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import LoaderIcon from '@lucide/svelte/icons/loader-circle';
  import { onMount } from 'svelte';
  import CleanupDialog from './components/CleanupDialog.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import FolderGrid from './components/FolderGrid.svelte';
  import Footer from './components/Footer.svelte';
  import Header from './components/Header.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import ManageTagsDialog from './components/ManageTagsDialog.svelte';
  import Reader from './components/Reader.svelte';
  import RenameDialog from './components/RenameDialog.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import TagDialog from './components/TagDialog.svelte';

  async function start() {
    await Promise.all([settings.load(), tags.load(), tags.loadRelations()]);
    library.size = settings.value.pageSize;
    library.query = settings.value.defaultSearch;
    if (settings.value.randomAtStartup) {
      await attempt(() => call(api.folders.shuffle.$post()));
      library.sort = 'random';
    }
    await library.search();
  }

  onMount(() => {
    // The server stops a few seconds after the last window drops this connection.
    const alive = new EventSource('/api/alive');
    void start();
    return () => alive.close();
  });
</script>

<div class="flex h-screen flex-col overflow-hidden">
  <Header />
  <FolderGrid />
  <Footer />
</div>

<TagDialog />
<RenameDialog />
<ManageTagsDialog />
<SettingsDialog />
<ImportDialog />
<CleanupDialog />
<HelpDialog />
<ConfirmDialog />
<Reader />

{#if ui.busy}
  <div class="fixed inset-0 z-[60] grid place-items-center bg-background/70">
    <LoaderIcon class="size-10 animate-spin text-muted-foreground" />
  </div>
{/if}

<Toaster position="top-center" richColors />
