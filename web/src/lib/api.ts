import type { AppType } from '$server/app';
import { hc } from 'hono/client';

export const api = hc<AppType>('/').api;

/** Awaits an API call and returns its JSON, throwing the server's message on failure. */
export async function call<T>(request: Promise<{ ok: boolean; json(): Promise<T> }>): Promise<T> {
  const response = await request;
  const body = await response.json();
  if (!response.ok) throw new Error((body as { message?: string }).message ?? 'Request failed');
  return body;
}
