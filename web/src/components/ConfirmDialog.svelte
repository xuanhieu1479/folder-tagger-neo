<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { ui } from '$lib/state/ui.svelte';
</script>

<AlertDialog.Root open={ui.confirmation !== null} onOpenChange={open => !open && ui.answer(false)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{ui.confirmation?.title}</AlertDialog.Title>
      <AlertDialog.Description>{ui.confirmation?.description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => ui.answer(false)}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={() => ui.answer(true)}>
        {ui.confirmation?.action}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
