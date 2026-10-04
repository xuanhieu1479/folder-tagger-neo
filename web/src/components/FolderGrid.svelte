<script lang="ts">
  import { openInExplorer, openReader, removeAllTags, removeFromLibrary } from '$lib/actions';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import { countColumns, isArrowKey, nextIndex } from '$lib/gridNav';
  import { library } from '$lib/state/library.svelte';
  import { ui, type TagMode } from '$lib/state/ui.svelte';
  import FolderCard from './FolderCard.svelte';

  let grid = $state<HTMLElement | null>(null);

  const count = $derived(library.selected.length);
  const single = $derived(count === 1 ? library.selected[0]! : null);

  library.onloaded = () => grid?.scrollTo({ top: 0 });

  const cards = () => [...(grid?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
  const onCard = (event: Event) => (event.target as Element).closest('[data-card]') !== null;

  function onKeydown(event: KeyboardEvent) {
    if (!isArrowKey(event.key) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (ui.modalOpen || document.querySelector('[role="menu"]') || library.items.length === 0) return;

    const target = event.target as HTMLElement;
    if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    if (target.tagName === 'INPUT') {
      // Left and right belong to the text cursor; up and down leave the search box.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return;
      target.blur();
    }

    event.preventDefault();
    const elements = cards();
    const ids = library.items.map(folder => folder.id);
    const current = ids.indexOf(library.selected.at(-1) ?? -1);
    const next = nextIndex(event.key, current, ids.length, countColumns(elements.map(card => card.offsetTop)));
    library.selected = [ids[next]!];
    elements[next]?.scrollIntoView({ block: 'nearest' });
  }

  function openTags(mode: TagMode) {
    ui.tagDialog = mode;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<ContextMenu.Root>
  <!-- A right-click on the empty space between cards opens nothing. -->
  <ContextMenu.Trigger
    bind:ref={grid}
    class="flex flex-1 flex-wrap content-start gap-5 overflow-y-auto p-5"
    onclick={event => {
      if (!onCard(event)) library.selected = [];
    }}
    oncontextmenucapture={event => {
      if (!onCard(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }}
  >
    {#each library.items as folder (folder.id)}
      <FolderCard {folder} />
    {/each}
  </ContextMenu.Trigger>

  <ContextMenu.Content class="w-56">
    <ContextMenu.Item disabled={single === null} onSelect={() => openReader(single!)}>Open in Reader</ContextMenu.Item>
    <ContextMenu.Item disabled={single === null} onSelect={() => openInExplorer(single!)}>
      Open in Explorer
    </ContextMenu.Item>
    <ContextMenu.Item disabled={single === null} onSelect={() => (ui.renameOpen = true)}>
      Rename Folder…
    </ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item disabled={count === 0} onSelect={() => openTags('add')}>Add Tags…</ContextMenu.Item>
    <ContextMenu.Item disabled={single === null} onSelect={() => openTags('edit')}>Edit Tags…</ContextMenu.Item>
    <ContextMenu.Item disabled={count === 0} onSelect={() => openTags('remove')}>Remove Tags…</ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item disabled={count === 0} onSelect={() => removeAllTags([...library.selected])}>
      Remove All Tags
    </ContextMenu.Item>
    <ContextMenu.Item
      variant="destructive"
      disabled={count === 0}
      onSelect={() => removeFromLibrary([...library.selected])}
    >
      Remove from Library
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>
