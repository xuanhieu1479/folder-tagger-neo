import { describe, expect, test } from 'bun:test';
import { parseSearch, type Field, type Term } from '../src/search/parse';

const term = (text: string, options: Partial<Term> = {}): Term => ({
  field: 'any' as Field,
  text,
  exclude: false,
  exact: false,
  whole: false,
  ...options,
});

describe('parseSearch: plain words', () => {
  test('empty and blank input', () => {
    expect(parseSearch('')).toEqual({ terms: [], filters: [] });
    expect(parseSearch('   \t ')).toEqual({ terms: [], filters: [] });
  });

  test('each word is its own term', () => {
    expect(parseSearch('iron man').terms).toEqual([term('iron'), term('man')]);
  });

  test('input is lowercased and extra whitespace is ignored everywhere', () => {
    expect(parseSearch('  Iron \t  MAN   suit ').terms).toEqual([term('iron'), term('man'), term('suit')]);
  });

  test('"the" is ignored', () => {
    expect(parseSearch('the avengers -the').terms).toEqual([term('avengers')]);
  });

  test('duplicates are removed', () => {
    expect(parseSearch('abc abc ABC').terms).toEqual([term('abc')]);
  });

  test('sort words from the old app are ordinary words', () => {
    expect(parseSearch('newly_added newly_updated').terms).toEqual([term('newly_added'), term('newly_updated')]);
  });
});

describe('parseSearch: short words', () => {
  test('no minimum length; one or two letters match whole words only', () => {
    expect(parseSearch('a ai abc').terms).toEqual([
      term('a', { whole: true }),
      term('ai', { whole: true }),
      term('abc'),
    ]);
  });

  test('short Japanese words are matched as substrings', () => {
    expect(parseSearch('東方').terms).toEqual([term('東方')]);
  });

  test('a quoted short word is exact, not whole-word', () => {
    expect(parseSearch('"ai"').terms).toEqual([term('ai', { exact: true })]);
  });
});

describe('parseSearch: exclusion and quotes', () => {
  test('-word excludes', () => {
    expect(parseSearch('-abc -ab').terms).toEqual([
      term('abc', { exclude: true }),
      term('ab', { exclude: true, whole: true }),
    ]);
  });

  test('quotes keep spaces and mean exact', () => {
    expect(parseSearch('"iron  man" suit').terms).toEqual([term('iron man', { exact: true }), term('suit')]);
  });

  test('-"word" excludes an exact match', () => {
    expect(parseSearch('-"iron man"').terms).toEqual([term('iron man', { exclude: true, exact: true })]);
  });

  test('an unclosed quote is dropped', () => {
    expect(parseSearch('genre: "big" small "x').terms).toEqual([
      term('big', { field: 'genre', exact: true }),
      term('small', { field: 'genre' }),
      term('x', { field: 'genre', whole: true }),
    ]);
  });

  test('a lone dash or empty quotes add nothing', () => {
    expect(parseSearch('- "" abc').terms).toEqual([term('abc')]);
  });
});

describe('parseSearch: keys', () => {
  test('a key applies to every word until the next key', () => {
    expect(parseSearch('parody: Avenger character: Iron Man genre: Superhero').terms).toEqual([
      term('avenger', { field: 'parody' }),
      term('iron', { field: 'character' }),
      term('man', { field: 'character' }),
      term('superhero', { field: 'genre' }),
    ]);
  });

  test('$ ends a key', () => {
    expect(parseSearch('author: abc $ foo bar').terms).toEqual([
      term('abc', { field: 'author' }),
      term('foo'),
      term('bar'),
    ]);
    expect(parseSearch('author:abc$foo').terms).toEqual([term('abc', { field: 'author' }), term('foo')]);
  });

  test('words before the first key are plain', () => {
    expect(parseSearch('foo name: bar').terms).toEqual([term('foo'), term('bar', { field: 'name' })]);
  });

  test('keys are case-insensitive and may repeat', () => {
    expect(parseSearch('Author: abc AUTHOR: def').terms).toEqual([
      term('abc', { field: 'author' }),
      term('def', { field: 'author' }),
    ]);
  });

  test('category is a key', () => {
    expect(parseSearch('category:manga').terms).toEqual([term('manga', { field: 'category' })]);
  });

  test('a key inside a longer word is not a key', () => {
    expect(parseSearch('username: foo').terms).toEqual([term('username:'), term('foo')]);
  });

  test('a key with nothing after it adds nothing', () => {
    expect(parseSearch('name:')).toEqual({ terms: [], filters: [] });
  });

  test('quotes and exclusion work after a key', () => {
    expect(parseSearch('author:"ai" -"bob smith"').terms).toEqual([
      term('ai', { field: 'author', exact: true }),
      term('bob smith', { field: 'author', exclude: true, exact: true }),
    ]);
  });
});

describe('parseSearch: filters', () => {
  test('no_, have_ and many_ with a tag type', () => {
    expect(parseSearch('no_author have_genre many_parody no_category')).toEqual({
      terms: [],
      filters: [
        { kind: 'no', type: 'author' },
        { kind: 'have', type: 'genre' },
        { kind: 'many', type: 'parody' },
        { kind: 'no', type: 'category' },
      ],
    });
  });

  test('filters work inside a key and are not repeated', () => {
    expect(parseSearch('genre: no_author no_author')).toEqual({ terms: [], filters: [{ kind: 'no', type: 'author' }] });
  });

  test('only whole words are filters', () => {
    expect(parseSearch('piano_author no_language -no_author').terms).toEqual([
      term('piano_author'),
      term('no_language'),
      term('no_author', { exclude: true }),
    ]);
    expect(parseSearch('piano_author no_language -no_author').filters).toEqual([]);
  });
});
