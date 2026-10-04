<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { pageWindow } from '$lib/pageWindow';
  import { library } from '$lib/state/library.svelte';
  import { settings } from '$lib/state/tags.svelte';
  import { selectClass } from '$lib/utils';
  import { PAGE_SIZES } from '$server/shared/types';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
  import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';

  const numbers = $derived(pageWindow(library.page, library.pages));
  const atStart = $derived(library.page <= 1);
  const atEnd = $derived(library.page >= library.pages);

  function setSize(size: number) {
    void settings.save({ pageSize: size });
    void library.setSize(size);
  }
</script>

<footer class="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t px-4 text-sm">
  <div class="font-medium">
    Total folders found: {library.total}
    {#if library.selected.length > 1}
      <span class="ml-3 font-normal text-muted-foreground">{library.selected.length} selected</span>
    {/if}
  </div>

  <div class="flex items-center gap-1">
    {#if library.pages > 1}
      <Button variant="ghost" size="icon" title="First page" disabled={atStart} onclick={() => library.goto(1)}>
        <ChevronsLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Previous page"
        disabled={atStart}
        onclick={() => library.goto(library.page - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      {#each numbers as number (number)}
        <Button
          variant={number === library.page ? 'default' : 'ghost'}
          class="min-w-8 px-2"
          onclick={() => library.goto(number)}
        >
          {number}
        </Button>
      {/each}
      <Button
        variant="ghost"
        size="icon"
        title="Next page"
        disabled={atEnd}
        onclick={() => library.goto(library.page + 1)}
      >
        <ChevronRightIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Last page"
        disabled={atEnd}
        onclick={() => library.goto(library.pages)}
      >
        <ChevronsRightIcon />
      </Button>
    {/if}
  </div>

  <label class="flex items-center justify-end gap-2">
    Show
    <select
      class={[selectClass, 'w-20']}
      value={String(library.size)}
      onchange={event => setSize(Number(event.currentTarget.value))}
    >
      {#each PAGE_SIZES as size (size)}
        <option value={String(size)}>{size}</option>
      {/each}
    </select>
    per page
  </label>
</footer>
