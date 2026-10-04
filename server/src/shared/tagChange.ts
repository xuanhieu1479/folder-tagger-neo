import { normalizeTagName } from './normalize';

/** Typed as the new name of a tag in Manage Tags, this deletes the tag. */
export const DELETE_KEYWORD = 'delete';

export type TagChangeKind = { kind: 'delete' } | { kind: 'merge' | 'rename'; name: string };

/**
 * What a Manage Tags edit does to the tag `from`: "delete" deletes it, a name that is
 * already a tag merges the two, anything else renames. Null when nothing would change.
 */
export function classifyTagChange(from: string, to: string, exists: (name: string) => boolean): TagChangeKind | null {
  if (to.trim().toLowerCase() === DELETE_KEYWORD) return { kind: 'delete' };
  const name = normalizeTagName(to);
  if (!name || name === from) return null;
  return { kind: exists(name) ? 'merge' : 'rename', name };
}
