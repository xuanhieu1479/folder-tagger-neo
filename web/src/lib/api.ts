import type { AppType } from '$server/app';
import { hc } from 'hono/client';
import { toast } from 'svelte-sonner';

export const api = hc<AppType>('/').api;

/** Awaits an API call and returns its JSON, throwing the server's message on failure. */
export async function call<T>(request: Promise<{ ok: boolean; json(): Promise<T> }>): Promise<T> {
  const response = await request;
  const body = await response.json();
  if (!response.ok) throw new Error((body as { message?: string }).message ?? 'Request failed');
  return body;
}

/** Runs an action and shows its error as a toast. Returns undefined when it failed. */
export async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

export const thumbnailUrl = (id: number, thumbnail: string) =>
  `/api/folders/${id}/thumbnail?v=${encodeURIComponent(thumbnail)}`;

export const imageUrl = (id: number, index: number, version: number) =>
  `/api/folders/${id}/images/${index}?v=${version}`;

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  toast.info('Copied to clipboard!');
}
