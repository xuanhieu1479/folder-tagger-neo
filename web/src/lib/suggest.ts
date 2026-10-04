import { normalizeTagName } from '$server/shared/normalize';
import type { Relations, TagMap, TagType } from '$server/shared/types';

/** The tag dialog's state that smart suggestions can change. */
export type TagForm = {
  /** Chosen tags per type. */
  selected: TagMap;
  /** Suggestion order per type: what Down arrow reaches first comes first. */
  order: TagMap;
};

const toFront = (list: string[], names: string[]): string[] => [
  ...names,
  ...list.filter(name => !names.includes(name)),
];

const parentsOf = (map: Record<string, string[]>, child: string): string[] =>
  Object.keys(map).filter(parent => map[parent]!.includes(child));

/**
 * Applies the smart suggestions for a tag the user just picked. Nothing the user
 * already chose is replaced; the most likely tags are filled in or moved to the top.
 *
 * - character (no parody yet): fills in the character's parody.
 * - parody: its characters and the authors who draw it move to the top.
 * - author: fills in their main parody (if none yet) and main category (if none yet,
 *   otherwise it moves to the top); their usual genres move to the top.
 * - genre (no author yet): the authors who use it move to the top.
 */
export function applySuggestion(form: TagForm, relations: Relations, type: TagType, name: string): TagForm {
  const selected: TagMap = { ...form.selected };
  const order: TagMap = { ...form.order };

  const parodyAdded = (parody: string) => {
    order.character = toFront(order.character, relations.parody_character[parody] ?? []);
    order.author = toFront(order.author, parentsOf(relations.author_parody, parody));
  };
  const fillParody = (parody: string | undefined) => {
    if (!parody || selected.parody.length > 0) return;
    selected.parody = [parody];
    parodyAdded(parody);
  };

  if (type === 'character') fillParody(relations.character_parody[name]);
  else if (type === 'parody') parodyAdded(name);
  else if (type === 'author') {
    fillParody(relations.author_parody[name]?.[0]);
    order.genre = toFront(order.genre, relations.author_genre[name] ?? []);
    const categories = relations.author_category[name] ?? [];
    if (selected.category.length === 0 && categories[0]) selected.category = [categories[0]];
    else order.category = toFront(order.category, categories);
  } else if (type === 'genre' && selected.author.length === 0)
    order.author = toFront(order.author, parentsOf(relations.author_genre, name));

  return { selected, order };
}

export type SuggestionRow = { name: string; chosen: boolean };

/** How many suggestions are shown at once. */
export const MAX_SUGGESTIONS = 100;

/**
 * Suggestions containing the typed text, in their given order. A tag typed in full
 * comes first, so Enter picks it.
 */
export function filterSuggestions(order: string[], chosen: string[], typed: string): SuggestionRow[] {
  const query = normalizeTagName(typed);
  const rows: SuggestionRow[] = [];
  const add = (name: string) => rows.push({ name, chosen: chosen.includes(name) });
  if (order.includes(query)) add(query);
  for (const name of order) {
    if (rows.length === MAX_SUGGESTIONS) break;
    if (name !== query && name.includes(query)) add(name);
  }
  return rows;
}
