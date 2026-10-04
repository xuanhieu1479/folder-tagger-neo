import type { ApplyMode } from '$server/shared/types';

export type TagMode = ApplyMode;

type Confirmation = { title: string; description: string; action: string; resolve: (confirmed: boolean) => void };

/** Which dialogs and overlays are open. */
class Ui {
  tagDialog = $state<TagMode | null>(null);
  renameOpen = $state(false);
  manageOpen = $state(false);
  settingsOpen = $state(false);
  importOpen = $state(false);
  cleanupOpen = $state(false);
  helpOpen = $state(false);
  reader = $state<{ id: number; name: string; count: number; version: number } | null>(null);
  confirmation = $state<Confirmation | null>(null);
  /** A long task is running; the app shows a blocking spinner. */
  busy = $state(false);

  /** True while anything sits on top of the grid, so grid keys and clicks are ignored. */
  get modalOpen(): boolean {
    return (
      this.tagDialog !== null ||
      this.renameOpen ||
      this.manageOpen ||
      this.settingsOpen ||
      this.importOpen ||
      this.cleanupOpen ||
      this.helpOpen ||
      this.reader !== null ||
      this.confirmation !== null ||
      this.busy
    );
  }

  /** Asks the user to confirm something; resolves to their answer. */
  confirm(title: string, description: string, action: string): Promise<boolean> {
    return new Promise(resolve => {
      this.confirmation = { title, description, action, resolve };
    });
  }

  answer(confirmed: boolean): void {
    this.confirmation?.resolve(confirmed);
    this.confirmation = null;
  }

  /** Shows the blocking spinner while a long task runs. */
  async whileBusy<T>(task: () => Promise<T>): Promise<T> {
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }
}

export const ui = new Ui();
