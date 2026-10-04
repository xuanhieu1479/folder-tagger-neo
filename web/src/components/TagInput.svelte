<script lang="ts">
  import { copyText } from '$lib/api';
  import { filterSuggestions } from '$lib/suggest';
  import { findNearDuplicates } from '$server/shared/nearDuplicate';
  import { normalizeTagName } from '$server/shared/normalize';
  import CheckIcon from '@lucide/svelte/icons/check';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';

  type Props = {
    id: string;
    /** The tags chosen so far. */
    chosen: string[];
    /** Existing tag names, most likely first. */
    order: string[];
    /** Whether typing a name that does not exist offers to create it. */
    allowCreate?: boolean;
    onchange: (chosen: string[]) => void;
    /** Called when the user picks a tag (not when one is removed). */
    onpick?: (name: string, existed: boolean) => void;
  };
  let { id, chosen, order, allowCreate = true, onchange, onpick }: Props = $props();

  let typed = $state('');
  let open = $state(false);
  let active = $state(0);
  let list = $state<HTMLElement | null>(null);
  /** A tag that was just created and looks like a typo of existing ones. */
  let warning = $state<{ created: string; similar: string[] } | null>(null);

  const rows = $derived(filterSuggestions(order, chosen, typed));
  const newName = $derived(normalizeTagName(typed));
  const canCreate = $derived(allowCreate && newName !== '' && !order.includes(newName) && !chosen.includes(newName));
  const optionCount = $derived(rows.length + (canCreate ? 1 : 0));

  $effect(() => {
    if (open) list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function show() {
    open = true;
    active = 0;
  }

  function pick(index: number) {
    const row = rows[index];
    if (row) {
      if (row.chosen) onchange(chosen.filter(name => name !== row.name));
      else {
        onchange([...chosen, row.name]);
        onpick?.(row.name, true);
      }
    } else if (canCreate && index === rows.length) {
      const similar = findNearDuplicates(newName, order);
      warning = similar.length ? { created: newName, similar } : null;
      onchange([...chosen, newName]);
      onpick?.(newName, false);
    } else return;
    typed = '';
    open = false;
  }

  function useExisting(existing: string) {
    if (!warning) return;
    const created = warning.created;
    warning = null;
    onchange([...chosen.filter(name => name !== created && name !== existing), existing]);
    onpick?.(existing, true);
  }

  function remove(name: string) {
    if (warning?.created === name) warning = null;
    onchange(chosen.filter(other => other !== name));
  }

  function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) show();
        else if (optionCount > 0) active = (active + 1) % optionCount;
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open && optionCount > 0) active = (active - 1 + optionCount) % optionCount;
        break;
      case 'Enter':
        // Enter never submits the dialog from a tag box.
        event.preventDefault();
        if (open) pick(active);
        break;
      case 'Escape':
        if (open) {
          // Close the list only; the dialog stays open.
          event.preventDefault();
          event.stopPropagation();
          open = false;
        }
        break;
      case 'Backspace':
        if (typed === '' && chosen.length > 0) remove(chosen.at(-1)!);
        break;
    }
  }
</script>

{#snippet option(index: number, content: Snippet)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="option"
    tabindex="-1"
    aria-selected={index === active}
    data-index={index}
    class={['flex cursor-default items-center gap-2 rounded-md px-2 py-1', index === active && 'bg-accent']}
    onclick={() => pick(index)}
    onmousemove={() => (active = index)}
  >
    {@render content()}
  </div>
{/snippet}

<div class="relative">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
    onclick={event => (event.currentTarget.querySelector('input') as HTMLInputElement).focus()}
  >
    {#each chosen as name (name)}
      <span class="flex h-6 items-center rounded-md bg-secondary text-xs text-secondary-foreground">
        <button
          type="button"
          class="cursor-pointer py-1 pr-1 pl-2"
          title="Click to copy"
          tabindex="-1"
          onclick={() => copyText(name)}
        >
          {name}
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-r-md px-1 py-1 text-muted-foreground hover:text-foreground"
          title="Remove"
          tabindex="-1"
          onclick={() => remove(name)}
        >
          <XIcon class="size-3" />
        </button>
      </span>
    {/each}
    <input
      {id}
      class="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
      role="combobox"
      aria-expanded={open}
      aria-controls="{id}-list"
      aria-autocomplete="list"
      autocomplete="off"
      spellcheck={false}
      bind:value={typed}
      oninput={show}
      onkeydown={onKeydown}
      onblur={() => (open = false)}
    />
  </div>

  {#if open && optionCount > 0}
    <!-- Clicks must not take focus from the input, or the list would close first. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={list}
      id="{id}-list"
      data-suggestions
      role="listbox"
      tabindex="-1"
      class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      onmousedown={event => event.preventDefault()}
    >
      {#each rows as row, index (row.name)}
        {#snippet existing()}
          <CheckIcon class={['size-3.5 shrink-0', !row.chosen && 'invisible']} />
          {row.name}
        {/snippet}
        {@render option(index, existing)}
      {/each}
      {#if canCreate}
        {#snippet create()}
          <PlusIcon class="size-3.5 shrink-0" />
          Create "{newName}" tag
        {/snippet}
        {@render option(rows.length, create)}
      {/if}
    </div>
  {/if}

  {#if warning}
    <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-600 dark:text-amber-400">
      New tag "{warning.created}" is close to an existing tag. Use it instead?
      {#each warning.similar.slice(0, 3) as existing (existing)}
        <button
          type="button"
          class="cursor-pointer rounded-md border border-current px-1.5 py-0.5 hover:bg-amber-500/10"
          onclick={() => useExisting(existing)}
        >
          {existing}
        </button>
      {/each}
      <button type="button" class="cursor-pointer underline" onclick={() => (warning = null)}>Keep new tag</button>
    </p>
  {/if}
</div>
