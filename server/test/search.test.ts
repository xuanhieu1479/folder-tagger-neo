import type { Database } from 'bun:sqlite';
import { beforeAll, describe, expect, test } from 'bun:test';
import { listFolders, shuffleFolders } from '../src/services/folders';
import type { Sort } from '../src/shared/types';
import { memoryDb, seedFolder } from './fixtures';

let db: Database;

beforeAll(() => {
  db = memoryDb();
  seedFolder(db, {
    name: '[Ai] Iron Suit vol.2',
    tags: {
      author: ['ai'],
      parody: ['avengers'],
      character: ['iron man'],
      genre: ['action', 'sci-fi'],
      category: ['manga'],
    },
    updatedAt: 30,
    openCount: 5,
  });
  seedFolder(db, {
    name: 'Rainy Day',
    tags: { author: ['kai'], genre: ['romance'], category: ['manga'] },
    updatedAt: 20,
    openCount: 9,
  });
  seedFolder(db, {
    name: 'ÉCOLE Café',
    tags: { author: ['bob smith', 'ann'], parody: ['original'], genre: ['school'], category: ['voice'] },
    updatedAt: 40,
  });
  seedFolder(db, {
    name: '東方Project 紅魔郷',
    tags: { parody: ['東方'], character: ['霊夢'], genre: ['ai'] },
    updatedAt: 10,
  });
  seedFolder(db, { name: 'Untagged Folder', updatedAt: 50 });
});

const search = (q: string, extra: { category?: string; noCategory?: boolean; sort?: Sort } = {}) =>
  listFolders(db, { q, sort: 'alpha', page: 1, size: 100, ...extra }).items.map(f => f.name);

describe('plain words', () => {
  test('no search returns everything, alphabetically', () => {
    expect(search('')).toEqual(
      ['[Ai] Iron Suit vol.2', 'Rainy Day', 'Untagged Folder', 'école café', '東方Project 紅魔郷'].map(n =>
        n === 'école café' ? 'ÉCOLE Café' : n,
      ),
    );
  });

  test('a word matches the folder name or a tag of any type', () => {
    expect(search('rainy')).toEqual(['Rainy Day']);
    expect(search('romance')).toEqual(['Rainy Day']);
    expect(search('avengers')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('every word must match', () => {
    expect(search('iron action')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('iron romance')).toEqual([]);
  });

  test('matching ignores case, including accents and Japanese', () => {
    expect(search('école')).toEqual(['ÉCOLE Café']);
    expect(search('CAFÉ')).toEqual(['ÉCOLE Café']);
    expect(search('紅魔')).toEqual(['東方Project 紅魔郷']);
    expect(search('霊夢')).toEqual(['東方Project 紅魔郷']);
  });

  test('punctuation in the search is ignored when matching tags', () => {
    expect(search('sci-fi')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('avengers!')).toEqual(['[Ai] Iron Suit vol.2']);
  });
});

describe('short words', () => {
  test('one or two letters match whole words only', () => {
    // "ai" is a word in a folder name, an author and a genre; it is inside "rainy" and "kai".
    expect(search('ai')).toEqual(['[Ai] Iron Suit vol.2', '東方Project 紅魔郷']);
    expect(search('2')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('a hyphenated tag is split into words', () => {
    expect(search('fi')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('three letters match anywhere', () => {
    expect(search('ain')).toEqual(['Rainy Day']);
  });

  test('a short typed word never matches another tag type', () => {
    expect(search('author:ai')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('genre:ai')).toEqual(['東方Project 紅魔郷']);
    expect(search('parody:ai')).toEqual([]);
  });

  test('short Japanese words match as substrings', () => {
    expect(search('東方')).toEqual(['東方Project 紅魔郷']);
  });
});

describe('typed words', () => {
  test('a typed word only looks at tags of that type', () => {
    expect(search('author:kai')).toEqual(['Rainy Day']);
    expect(search('genre:kai')).toEqual([]);
    expect(search('character: iron man')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('name: only looks at the folder name', () => {
    expect(search('name:iron')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('name:avengers')).toEqual([]);
  });

  test('category: works like any other type', () => {
    expect(search('category:manga')).toEqual(['[Ai] Iron Suit vol.2', 'Rainy Day']);
  });
});

describe('exclusion and exact match', () => {
  test('-word leaves out folders that match', () => {
    expect(search('-manga')).toEqual(['Untagged Folder', 'ÉCOLE Café', '東方Project 紅魔郷']);
    expect(search('category:manga -author:kai')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('-name:folder -name:project')).toEqual(['[Ai] Iron Suit vol.2', 'Rainy Day', 'ÉCOLE Café']);
  });

  test('a quoted word must be the whole tag name', () => {
    expect(search('author:"bob"')).toEqual([]);
    expect(search('author:"bob smith"')).toEqual(['ÉCOLE Café']);
    expect(search('author:"ai"')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('a quoted plain word still matches inside a folder name', () => {
    expect(search('"untagged fol"')).toEqual(['Untagged Folder']);
    expect(search('"iron"')).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('-"word" excludes an exact tag', () => {
    expect(search('have_author -author:"ai"')).toEqual(['Rainy Day', 'ÉCOLE Café']);
  });
});

describe('filters', () => {
  test('no_, have_ and many_', () => {
    expect(search('no_author')).toEqual(['Untagged Folder', '東方Project 紅魔郷']);
    expect(search('have_parody')).toEqual(['[Ai] Iron Suit vol.2', 'ÉCOLE Café', '東方Project 紅魔郷']);
    expect(search('many_author')).toEqual(['ÉCOLE Café']);
    expect(search('many_genre')).toEqual(['[Ai] Iron Suit vol.2']);
    expect(search('no_category')).toEqual(['Untagged Folder', '東方Project 紅魔郷']);
  });

  test('filters combine with words', () => {
    expect(search('no_author 東方')).toEqual(['東方Project 紅魔郷']);
  });
});

describe('category dropdown', () => {
  test('one category', () => {
    expect(search('', { category: 'voice' })).toEqual(['ÉCOLE Café']);
    expect(search('ai', { category: 'manga' })).toEqual(['[Ai] Iron Suit vol.2']);
  });

  test('no category', () => {
    expect(search('', { noCategory: true })).toEqual(['Untagged Folder', '東方Project 紅魔郷']);
  });
});

describe('sorting and paging', () => {
  test('updated: newest first', () => {
    expect(search('', { sort: 'updated' })).toEqual([
      'Untagged Folder',
      'ÉCOLE Café',
      '[Ai] Iron Suit vol.2',
      'Rainy Day',
      '東方Project 紅魔郷',
    ]);
  });

  test('popular: most opened first', () => {
    expect(search('', { sort: 'popular' }).slice(0, 2)).toEqual(['Rainy Day', '[Ai] Iron Suit vol.2']);
  });

  test('random: stable across pages until the next shuffle', () => {
    const page = (n: number) => listFolders(db, { q: '', sort: 'random', page: n, size: 2 }).items.map(f => f.name);
    const first = [...page(1), ...page(2), ...page(3)];
    expect(new Set(first).size).toBe(5);
    expect([...page(1), ...page(2), ...page(3)]).toEqual(first);

    let changed = false;
    for (let i = 0; i < 20 && !changed; i++) {
      shuffleFolders(db);
      changed = JSON.stringify([...page(1), ...page(2), ...page(3)]) !== JSON.stringify(first);
    }
    expect(changed).toBe(true);
  });

  test('pages and totals', () => {
    const result = listFolders(db, { q: '', sort: 'alpha', page: 2, size: 2 });
    expect(result).toMatchObject({ total: 5, page: 2, pages: 3 });
    expect(result.items.map(f => f.name)).toEqual(['Untagged Folder', 'ÉCOLE Café']);
  });

  test('a page past the end is clamped, never an error', () => {
    expect(listFolders(db, { q: 'rainy', sort: 'alpha', page: 9, size: 25 })).toMatchObject({
      total: 1,
      page: 1,
      pages: 1,
    });
    expect(listFolders(db, { q: 'nothing-matches-this', sort: 'alpha', page: 3, size: 25 })).toMatchObject({
      total: 0,
      page: 1,
      pages: 1,
      items: [],
    });
  });
});
