<script lang="ts">
  import { api, attempt, call } from '$lib/api';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { library } from '$lib/state/library.svelte';
  import { tags } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { selectClass } from '$lib/utils';
  import { normalizeTagName } from '$server/shared/normalize';
  import { TAG_TYPES, type TagType } from '$server/shared/types';
  import { toast } from 'svelte-sonner';

  const DELETE_KEYWORD = 'delete';

  let type = $state<TagType>('author');
  let sortBy = $state<'name' | 'count'>('name');
  let search = $state('');
  /** New values typed so far, by current tag name. */
  let edits = $state<Record<string, string>>({});
  let saving = $state(false);

  const ofType = $derived(tags.all.filter(tag => tag.type === type));
  const names = $derived(new Set(ofType.map(tag => tag.name)));
  const rows = $derived(
    ofType
      .filter(tag => tag.name.includes(normalizeTagName(search)))
      .sort((a, b) => (sortBy === 'count' ? a.count - b.count : 0) || a.name.localeCompare(b.name)),
  );
  const changes = $derived(
    Object.entries(edits)
      .filter(([from, to]) => to.trim() !== '' && to.trim() !== from)
      .map(([from, to]) => ({ from, to })),
  );

  type Effect = 'delete' | 'merge' | 'rename' | null;
  function effectOf(name: string): Effect {
    const value = (edits[name] ?? '').trim();
    if (!value || value === name) return null;
    if (value.toLowerCase() === DELETE_KEYWORD) return 'delete';
    const target = normalizeTagName(value);
    return target !== name && names.has(target) ? 'merge' : 'rename';
  }
  const EFFECT_STYLE: Record<Exclude<Effect, null>, string> = {
    delete: 'text-destructive',
    merge: 'text-amber-600 dark:text-amber-400',
    rename: 'text-sky-600 dark:text-sky-400',
  };

  function changeType(next: TagType) {
    type = next;
    edits = {};
  }

  async function save() {
    saving = true;
    const result = await attempt(() => call(api.tags.manage.$post({ json: { type, changes } })));
    saving = false;
    if (!result) return;
    toast.success(`Renamed ${result.renamed}, merged ${result.merged}, deleted ${result.deleted}.`);
    edits = {};
    await Promise.all([tags.load(), library.load()]);
  }

  function close() {
    ui.manageOpen = false;
    edits = {};
    search = '';
  }
</script>

<Dialog.Root open={ui.manageOpen} onOpenChange={open => !open && close()}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Manage Tags</Dialog.Title>
      <Dialog.Description>
        Type a new value to rename a tag. An existing name merges the two tags. Type "{DELETE_KEYWORD}" to delete the
        tag.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex items-center gap-2">
      <select
        class={[selectClass, 'w-32']}
        aria-label="Tag type"
        value={type}
        onchange={event => changeType(event.currentTarget.value as TagType)}
      >
        {#each TAG_TYPES as tagType (tagType)}
          <option value={tagType}>{tagType}</option>
        {/each}
      </select>
      <select class={[selectClass, 'w-40']} aria-label="Sort by" bind:value={sortBy}>
        <option value="name">Sort by name</option>
        <option value="count">Sort by used times</option>
      </select>
      <Input class="flex-1" placeholder="Filter tags" spellcheck={false} bind:value={search} />
    </div>

    <div class="h-[26rem] overflow-y-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-popover text-left text-muted-foreground">
          <tr class="border-b">
            <th class="px-3 py-2 font-medium">Tag name</th>
            <th class="px-3 py-2 font-medium">New value</th>
            <th class="px-3 py-2 text-right font-medium">Used</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as tag (tag.name)}
            {@const effect = effectOf(tag.name)}
            <tr class={['border-b last:border-0', effect && EFFECT_STYLE[effect]]}>
              <td class="px-3 py-1">{tag.name}</td>
              <td class="px-3 py-1">
                <input
                  class="h-7 w-full rounded-md border border-transparent bg-transparent px-2 outline-none hover:border-input focus:border-ring"
                  aria-label="New value for {tag.name}"
                  spellcheck={false}
                  placeholder={effect === null ? '' : undefined}
                  value={edits[tag.name] ?? ''}
                  oninput={event => (edits[tag.name] = event.currentTarget.value)}
                />
              </td>
              <td class="px-3 py-1 text-right tabular-nums">
                {tag.count}
                {#if effect}<span class="ml-1 text-xs">({effect})</span>{/if}
              </td>
            </tr>
          {:else}
            <tr><td colspan="3" class="px-3 py-6 text-center text-muted-foreground">No tags.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={close}>Close</Button>
      <Button disabled={saving || changes.length === 0} onclick={save}>
        Save {changes.length || ''} change{changes.length === 1 ? '' : 's'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
