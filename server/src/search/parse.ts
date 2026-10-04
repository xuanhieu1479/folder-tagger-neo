import { foldKey } from '../shared/normalize';
import { TAG_TYPES, type TagType } from '../shared/types';

export type Field = 'any' | 'name' | TagType;

export type Term = {
  field: Field;
  text: string;
  /** Written as -word: folders matching it are left out. */
  exclude: boolean;
  /** Written in quotes: a tag must have exactly this name. */
  exact: boolean;
  /** One or two plain letters or digits: only matches a whole word. */
  whole: boolean;
};

export type Filter = { kind: 'no' | 'have' | 'many'; type: TagType };

export type ParsedQuery = { terms: Term[]; filters: Filter[] };

const KEY = new RegExp(`^(name|${TAG_TYPES.join('|')}):`);
const FILTER = new RegExp(`^(no|have|many)_(${TAG_TYPES.join('|')})$`);
const END_OF_KEY = '$';
const IGNORED_WORDS = new Set(['the']);
const SHORT_WORD = /^[a-z0-9]{1,2}$/;

/**
 * Turns the search box text into terms and filters.
 *
 *   iron man                 two plain words, each must match the name or a tag
 *   author: abc def          a key applies to every word after it...
 *   author: abc $ iron       ...until `$` or the next key
 *   -word  "exact name"  -"exact name"
 *   no_author  have_genre  many_parody
 */
export function parseSearch(input: string): ParsedQuery {
  const text = foldKey(input);
  const terms: Term[] = [];
  const filters: Filter[] = [];
  const seen = new Set<string>();
  let field: Field = 'any';
  let i = 0;

  const addTerm = (word: string, exclude: boolean, exact: boolean) => {
    const term: Term = { field, text: word, exclude, exact, whole: !exact && SHORT_WORD.test(word) };
    const key = JSON.stringify(term);
    if (!seen.has(key)) {
      seen.add(key);
      terms.push(term);
    }
  };

  while (i < text.length) {
    const char = text[i]!;
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === END_OF_KEY) {
      field = 'any';
      i++;
      continue;
    }
    const key = KEY.exec(text.slice(i));
    if (key) {
      field = key[1] as Field;
      i += key[0].length;
      continue;
    }

    const exclude = char === '-';
    let start = exclude ? i + 1 : i;
    if (text[start] === '"') {
      const close = text.indexOf('"', start + 1);
      if (close !== -1) {
        const phrase = text
          .slice(start + 1, close)
          .replace(/\s+/g, ' ')
          .trim();
        if (phrase) addTerm(phrase, exclude, true);
        i = close + 1;
        continue;
      }
      start++; // A quote that is never closed is dropped.
    }

    let end = start;
    while (end < text.length && !/\s/.test(text[end]!) && text[end] !== END_OF_KEY) end++;
    const word = text.slice(start, end).replaceAll('"', '');
    i = Math.max(end, i + 1);
    if (!word || IGNORED_WORDS.has(word)) continue;

    const filter = exclude ? null : FILTER.exec(word);
    if (filter) {
      const parsed: Filter = { kind: filter[1] as Filter['kind'], type: filter[2] as TagType };
      if (!filters.some(f => f.kind === parsed.kind && f.type === parsed.type)) filters.push(parsed);
    } else addTerm(word, exclude, false);
  }

  return { terms, filters };
}
