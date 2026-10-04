<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Label } from '$lib/components/ui/label';
  import { library } from '$lib/state/library.svelte';
  import { tags } from '$lib/state/tags.svelte';
  import { ui, type TagMode } from '$lib/state/ui.svelte';
  import { applySuggestion, type TagForm } from '$lib/suggest';
  import { emptyTagMap, TAG_TYPES, type TagType } from '$server/shared/types';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import TagInput from './TagInput.svelte';

  const TITLES: Record<TagMode, string> = { add: 'Add Tags', edit: 'Edit Tags', remove: 'Remove Tags' };
  const LABELS: Record<TagType, string> = {
    author: 'Author',
    parody: 'Parody',
    character: 'Character',
    genre: 'Genre',
    category: 'Category',
  };

  let form = $state<TagForm>({ selected: emptyTagMap(), order: emptyTagMap() });
  let folderIds = $state<number[]>([]);
  let saving = $state(false);
  // Kept while the dialog animates out, so its title does not flicker.
  let mode = $state<TagMode>('add');

  // Set the form up each time the dialog opens.
  $effect(() => {
    const opened = ui.tagDialog;
    if (opened === null) return;
    // Only opening the dialog resets the form, not later changes to the library or tags.
    untrack(() => {
      mode = opened;
      folderIds = [...library.selected];
      form = { selected: emptyTagMap(), order: structuredClone($state.snapshot(tags.byType)) };
      if (opened === 'edit') void loadCurrentTags(folderIds[0]!);
    });
  });

  async function loadCurrentTags(id: number) {
    const current = await attempt(() => call(api.folders[':id'].tags.$get({ param: { id: String(id) } })));
    if (current) form.selected = current;
  }

  function onPick(type: TagType, name: string, existed: boolean) {
    // Suggestions come from tags the library already knows, and never when removing.
    if (existed && mode !== 'remove') form = applySuggestion($state.snapshot(form), tags.relations, type, name);
  }

  async function save() {
    saving = true;
    const saved = await attempt(() =>
      call(api.tags.apply.$post({ json: { folderIds, mode, tags: $state.snapshot(form.selected) } })),
    );
    saving = false;
    if (!saved) return;
    toast.success('Success');
    ui.tagDialog = null;
    await Promise.all([tags.load(), library.load()]);
  }
</script>

<Dialog.Root open={ui.tagDialog !== null} onOpenChange={open => !open && (ui.tagDialog = null)}>
  <Dialog.Content
    class="sm:max-w-3xl"
    onEscapeKeydown={event => {
      // Escape closes an open suggestion list first, not the dialog.
      if (event.defaultPrevented || document.querySelector('[data-suggestions]')) event.preventDefault();
    }}
  >
    <Dialog.Header>
      <Dialog.Title>{TITLES[mode]}</Dialog.Title>
      <Dialog.Description>
        {#if folderIds.length === 1}
          {library.items.find(folder => folder.id === folderIds[0])?.name}
        {:else}
          {folderIds.length} folders selected
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-[5.5rem_1fr] items-start gap-x-3 gap-y-3">
      {#each TAG_TYPES as type (type)}
        <Label for="tag-input-{type}" class="mt-2.5 justify-end">{LABELS[type]}</Label>
        <TagInput
          id="tag-input-{type}"
          chosen={form.selected[type]}
          order={form.order[type]}
          allowCreate={mode !== 'remove'}
          onchange={chosen => (form.selected[type] = chosen)}
          onpick={(name, existed) => onPick(type, name, existed)}
        />
      {/each}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (ui.tagDialog = null)}>Cancel</Button>
      <Button disabled={saving} onclick={save}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
