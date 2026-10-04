<script lang="ts">
  import { imageUrl } from '$lib/api';
  import { ui } from '$lib/state/ui.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { SvelteSet } from 'svelte/reactivity';

  const reader = $derived(ui.reader);
  /** Images that have finished loading and so have their real height. */
  let loaded = new SvelteSet<number>();
  let scroller = $state<HTMLElement | null>(null);

  $effect(() => {
    if (reader) {
      loaded.clear();
      scroller?.focus();
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (reader && event.key === 'Escape') {
      event.preventDefault();
      ui.reader = null;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if reader}
  <div class="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label={reader.name}>
    <div class="flex h-10 shrink-0 items-center gap-3 bg-neutral-900 px-3 text-sm">
      <span class="truncate font-medium">{reader.name}</span>
      <span class="shrink-0 text-neutral-400">{reader.count} image{reader.count === 1 ? '' : 's'}</span>
      <button
        type="button"
        class="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-700"
        title="Close (Esc)"
        onclick={() => (ui.reader = null)}
      >
        <XIcon class="size-4" /> Close
      </button>
    </div>
    <!-- The scroller takes focus so Page Up, Page Down, Space and the arrow keys scroll it. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div bind:this={scroller} tabindex="0" class="flex-1 overflow-y-auto outline-none">
      <div class="mx-auto flex max-w-5xl flex-col items-center">
        {#each { length: reader.count }, index (index)}
          <!-- Until an image loads it keeps a screen's height, so lazy loading fetches a few at a time. -->
          <img
            class="h-auto w-full"
            style:min-height={loaded.has(index) ? undefined : '100vh'}
            src={imageUrl(reader.id, index, reader.version)}
            alt="Image {index + 1}"
            loading="lazy"
            draggable="false"
            onload={() => loaded.add(index)}
            onerror={() => loaded.add(index)}
          />
        {/each}
      </div>
    </div>
  </div>
{/if}
