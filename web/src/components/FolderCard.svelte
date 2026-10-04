<script lang="ts">
  import { copyText, thumbnailUrl } from '$lib/api';
  import { library } from '$lib/state/library.svelte';
  import { clickSelection, contextSelection } from '$lib/selectionLogic';
  import type { FolderItem } from '$server/shared/types';
  import FolderIcon from '@lucide/svelte/icons/folder';

  let { folder }: { folder: FolderItem } = $props();

  const selected = $derived(library.selected.includes(folder.id));

  function select(event: MouseEvent) {
    const order = library.items.map(item => item.id);
    library.selected = clickSelection(library.selected, order, folder.id, {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
    });
  }

  function copyName(event: MouseEvent) {
    event.stopPropagation();
    void copyText(folder.name);
    if (!selected) library.selected = [folder.id];
  }
</script>

<!-- Cards are driven by the mouse and by the grid's arrow keys, not by focus. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  data-card
  role="option"
  aria-selected={selected}
  tabindex="-1"
  class={[
    'w-[250px] overflow-hidden rounded-xl border bg-card text-card-foreground outline-offset-2 transition-shadow hover:shadow-md',
    selected && 'border-sky-400 bg-sky-500/25 outline-4 outline-sky-400',
  ]}
  onclick={select}
  oncontextmenu={() => (library.selected = contextSelection(library.selected, folder.id))}
>
  {#if folder.thumbnail}
    <img
      class="h-[350px] w-full bg-muted object-cover"
      src={thumbnailUrl(folder.id, folder.thumbnail)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
    />
  {:else}
    <div class="grid h-[350px] place-items-center bg-muted text-muted-foreground/50">
      <FolderIcon class="size-20" strokeWidth={1} />
    </div>
  {/if}
  <div class="flex h-14 items-center justify-center px-2 text-center text-sm leading-tight">
    <button type="button" class="line-clamp-2 cursor-pointer hover:underline" title="Click to copy" onclick={copyName}>
      {folder.name}
    </button>
  </div>
</div>
