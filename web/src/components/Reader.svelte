<script lang="ts">
  import { imageUrl } from '$lib/api';
  import { jumpTarget, viewAnchor } from '$lib/readerNav';
  import { settings } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { plural } from '$lib/utils';
  import { READER_SCALE } from '$server/shared/types';
  import XIcon from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
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

  const scale = $derived(settings.value.readerScale);

  const images = () => [...(scroller?.querySelectorAll('img') ?? [])];
  const tops = () => images().map(image => image.offsetTop);

  /** Jumps to the next or the previous image. */
  function jump(direction: 1 | -1) {
    if (!scroller) return;
    const all = tops();
    const target = jumpTarget(all, scroller.scrollTop, direction);
    if (target !== null) scroller.scrollTop = all[target]!;
  }

  /** Changes the scale and keeps the same place of the same image at the top of the view. */
  async function setScale(next: number) {
    if (!scroller) return;
    const anchor = viewAnchor(
      tops(),
      images().map(image => image.offsetHeight),
      scroller.scrollTop,
    );
    settings.value.readerScale = next;
    await tick();
    const image = images()[anchor.index];
    if (image) scroller.scrollTop = image.offsetTop + anchor.ratio * image.offsetHeight;
  }

  /** Remembers the scale for next time, and gives the keys back to the images. */
  function keepScale() {
    void settings.save({ readerScale: scale });
    scroller?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (!reader) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      ui.reader = null;
    } else if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      !(event.target instanceof HTMLInputElement)
    ) {
      event.preventDefault();
      jump(event.key === 'ArrowRight' ? 1 : -1);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if reader}
  <div class="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label={reader.name}>
    <div class="flex h-10 shrink-0 items-center gap-3 bg-neutral-900 px-3 text-sm">
      <span class="truncate font-medium">{reader.name}</span>
      <span class="shrink-0 text-neutral-400">{plural(reader.count, 'image')}</span>
      <label class="ml-auto flex shrink-0 items-center gap-2 text-neutral-300" title="Image size">
        <input
          type="range"
          class="w-40 cursor-pointer accent-sky-500"
          aria-label="Image size"
          min={READER_SCALE.min}
          max={READER_SCALE.max}
          step={READER_SCALE.step}
          value={scale}
          oninput={event => setScale(Number(event.currentTarget.value))}
          onchange={keepScale}
        />
        <span class="w-10 text-right tabular-nums">{scale}%</span>
      </label>
      <button
        type="button"
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-700"
        title="Close (Esc)"
        onclick={() => (ui.reader = null)}
      >
        <XIcon class="size-4" /> Close
      </button>
    </div>
    <!-- The scroller takes focus so Page Up, Page Down, Space and the up and down keys scroll it. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div bind:this={scroller} tabindex="0" class="relative flex-1 overflow-auto outline-none">
      <!-- At 100% the images are as wide as the window, up to 64rem. -->
      <div class="mx-auto flex flex-col items-center" style:width="calc(min(100%, 64rem) * {scale / 100})">
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
