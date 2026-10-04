<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import { settings } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  let defaultSearch = $state('');
  let randomAtStartup = $state(false);

  // Start from the saved values each time the dialog opens; closing discards edits.
  $effect(() => {
    if (!ui.settingsOpen) return;
    untrack(() => {
      defaultSearch = settings.value.defaultSearch;
      randomAtStartup = settings.value.randomAtStartup;
    });
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!(await settings.save({ defaultSearch, randomAtStartup }))) return;
    toast.success('Settings saved.');
    ui.settingsOpen = false;
  }
</script>

<Dialog.Root open={ui.settingsOpen} onOpenChange={open => !open && (ui.settingsOpen = false)}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>Both settings take effect the next time the app starts.</Dialog.Description>
    </Dialog.Header>
    <form class="grid gap-4" onsubmit={save}>
      <div class="grid gap-1.5">
        <Label for="setting-search">Search on startup</Label>
        <Input
          id="setting-search"
          placeholder="For example: category:manga"
          spellcheck={false}
          autocomplete="off"
          bind:value={defaultSearch}
        />
      </div>
      <div class="flex items-center justify-between">
        <Label for="setting-random">Random order on startup</Label>
        <Switch id="setting-random" bind:checked={randomAtStartup} />
      </div>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => (ui.settingsOpen = false)}>Cancel</Button>
        <Button type="submit">Save</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
