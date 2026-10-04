<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { ALL_CATEGORIES, categoryValue, library, NO_CATEGORY } from '$lib/state/library.svelte';
  import { tags } from '$lib/state/tags.svelte';
  import { ui } from '$lib/state/ui.svelte';
  import { selectClass } from '$lib/utils';
  import type { Sort } from '$server/shared/types';
  import InfoIcon from '@lucide/svelte/icons/info';
  import SearchIcon from '@lucide/svelte/icons/search';
  import ShuffleIcon from '@lucide/svelte/icons/shuffle';
  import AppMenu from './AppMenu.svelte';

  const SORT_LABELS: Record<Sort, string> = {
    alpha: 'Alphabetical',
    updated: 'Updated',
    popular: 'Popular',
    random: 'Random',
  };
</script>

<header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
  <AppMenu />

  <select
    class={[selectClass, 'w-36']}
    aria-label="Category"
    value={library.category}
    onchange={event => library.setCategory(event.currentTarget.value)}
  >
    <option value={ALL_CATEGORIES}>All categories</option>
    {#each tags.categories as category (category)}
      <option value={categoryValue(category)}>{category}</option>
    {/each}
    <option value={NO_CATEGORY}>No category</option>
  </select>

  <form
    class="relative flex-1"
    onsubmit={event => {
      event.preventDefault();
      void library.search();
    }}
  >
    <SearchIcon class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
    <Input class="px-8" placeholder="Search" spellcheck={false} autocomplete="off" bind:value={library.query} />
    <button
      type="button"
      class="absolute top-1.5 right-2 text-muted-foreground hover:text-foreground"
      title="Search help"
      onclick={() => (ui.helpOpen = true)}
    >
      <InfoIcon class="size-5" />
    </button>
  </form>

  <select
    class={[selectClass, 'w-36']}
    aria-label="Sort"
    value={library.sort}
    onchange={event => library.setSort(event.currentTarget.value as Sort)}
  >
    {#each Object.entries(SORT_LABELS) as [sort, label] (sort)}
      <option value={sort}>{label}</option>
    {/each}
  </select>

  <Button variant="outline" title="Show everything in a new random order" onclick={() => library.shuffle()}>
    <ShuffleIcon /> Shuffle
  </Button>
  <Button onclick={() => library.search()}>Search</Button>
</header>
