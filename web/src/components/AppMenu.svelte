<script lang="ts">
  import { addFolders, calculateRelations, clearUnusedTags, exportData, readOutsideFolder } from '$lib/actions';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Menu from '$lib/components/ui/dropdown-menu';
  import { ui } from '$lib/state/ui.svelte';
  import MenuIcon from '@lucide/svelte/icons/menu';
</script>

<Menu.Root>
  <Menu.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })} title="Menu">
    <MenuIcon />
  </Menu.Trigger>
  <Menu.Content align="start" class="w-64">
    <Menu.Item onSelect={() => addFolders(false)}>Add folder…</Menu.Item>
    <Menu.Item onSelect={() => addFolders(true)}>Add several folders…</Menu.Item>
    <Menu.Item onSelect={readOutsideFolder}>Read a folder outside the library…</Menu.Item>
    <Menu.Separator />
    <Menu.Item onSelect={() => (ui.manageOpen = true)}>Manage tags…</Menu.Item>
    <Menu.Item onSelect={calculateRelations}>Calculate tag relations</Menu.Item>
    <Menu.Item onSelect={clearUnusedTags}>Clear unused tags</Menu.Item>
    <Menu.Separator />
    <Menu.Item onSelect={() => (ui.cleanupOpen = true)}>Clean up missing folders…</Menu.Item>
    <Menu.Item onSelect={() => (ui.importOpen = true)}>Import data…</Menu.Item>
    <Menu.Item onSelect={exportData}>Export data</Menu.Item>
    <Menu.Separator />
    <Menu.Item onSelect={() => (ui.settingsOpen = true)}>Settings…</Menu.Item>
  </Menu.Content>
</Menu.Root>
