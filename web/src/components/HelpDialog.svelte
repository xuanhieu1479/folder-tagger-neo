<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { ui } from '$lib/state/ui.svelte';

  const ROWS: [string, string][] = [
    ['iron man', 'Folders matching both words, in the folder name or in any tag.'],
    ['author: abc', 'Only looks at author tags. Also: parody, character, genre, category, name.'],
    ['author: abc $ iron', '$ ends the key, so "iron" is a plain word again.'],
    ['-word  -author:abc', 'Leaves out folders that match.'],
    ['"iron man"', 'The tag must have exactly this name. A folder name still only has to contain it.'],
    ['ai', 'One or two letters only match a whole word, so "ai" does not match "rain".'],
    ['no_author', 'Folders with no author tag. Works with every tag type.'],
    ['have_genre', 'Folders with at least one genre tag.'],
    ['many_parody', 'Folders with more than one parody tag.'],
  ];
</script>

<Dialog.Root open={ui.helpOpen} onOpenChange={open => !open && (ui.helpOpen = false)}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Search</Dialog.Title>
      <Dialog.Description>Every word and filter must match. Letter case never matters.</Dialog.Description>
    </Dialog.Header>
    <table class="text-sm">
      <tbody>
        {#each ROWS as [example, meaning] (example)}
          <tr class="border-b last:border-0">
            <td class="py-1.5 pr-4 font-mono whitespace-nowrap">{example}</td>
            <td class="py-1.5 text-muted-foreground">{meaning}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Dialog.Content>
</Dialog.Root>
