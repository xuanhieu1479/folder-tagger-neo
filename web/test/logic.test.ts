import { describe, expect, test } from 'bun:test';
import { emptyRelations, emptyTagMap, type Relations } from '../../server/src/shared/types';
import { countColumns, nextIndex } from '../src/lib/gridNav';
import { pageWindow } from '../src/lib/pageWindow';
import { clickSelection, contextSelection } from '../src/lib/selectionLogic';
import { applySuggestion, filterSuggestions, type TagForm } from '../src/lib/suggest';

describe('nextIndex (10 cards, 4 per row)', () => {
  // 0 1 2 3
  // 4 5 6 7
  // 8 9
  const move = (key: Parameters<typeof nextIndex>[0], from: number) => nextIndex(key, from, 10, 4);

  test('left and right move one card and wrap around', () => {
    expect(move('ArrowRight', 0)).toBe(1);
    expect(move('ArrowRight', 9)).toBe(0);
    expect(move('ArrowLeft', 5)).toBe(4);
    expect(move('ArrowLeft', 0)).toBe(9);
  });

  test('up and down move by one row and stop at the edges', () => {
    expect(move('ArrowDown', 1)).toBe(5);
    expect(move('ArrowUp', 5)).toBe(1);
    expect(move('ArrowUp', 2)).toBe(2);
    expect(move('ArrowDown', 8)).toBe(8);
  });

  test('down onto a short last row lands on the last card', () => {
    expect(move('ArrowDown', 4)).toBe(8);
    expect(move('ArrowDown', 6)).toBe(9);
  });

  test('with nothing selected, right and down start at the first card, left and up at the last', () => {
    expect(move('ArrowRight', -1)).toBe(0);
    expect(move('ArrowDown', -1)).toBe(0);
    expect(move('ArrowLeft', -1)).toBe(9);
    expect(move('ArrowUp', -1)).toBe(9);
  });

  test('an empty grid has nothing to select', () => {
    expect(nextIndex('ArrowRight', -1, 0, 4)).toBe(-1);
  });
});

test('countColumns counts the cards on the first row', () => {
  expect(countColumns([10, 10, 10, 440, 440])).toBe(3);
  expect(countColumns([10])).toBe(1);
  expect(countColumns([])).toBe(1);
});

describe('clickSelection', () => {
  const order = [10, 20, 30, 40, 50];
  const plain = { ctrl: false, shift: false };
  const ctrl = { ctrl: true, shift: false };
  const shift = { ctrl: false, shift: true };

  test('a plain click selects only that card', () => {
    expect(clickSelection([10, 20], order, 30, plain)).toEqual([30]);
    expect(clickSelection([10, 20], order, 20, plain)).toEqual([20]);
  });

  test('a plain click on the only selected card clears the selection', () => {
    expect(clickSelection([30], order, 30, plain)).toEqual([]);
  });

  test('ctrl+click adds or removes a card', () => {
    expect(clickSelection([10], order, 40, ctrl)).toEqual([10, 40]);
    expect(clickSelection([10, 40], order, 10, ctrl)).toEqual([40]);
  });

  test('shift+click selects from the anchor, ending on the clicked card', () => {
    expect(clickSelection([20], order, 40, shift)).toEqual([20, 30, 40]);
    expect(clickSelection([40], order, 20, shift)).toEqual([40, 30, 20]);
    expect(clickSelection([20, 30, 40], order, 50, shift)).toEqual([20, 30, 40, 50]);
  });

  test('shift+click with no anchor selects just that card', () => {
    expect(clickSelection([], order, 30, shift)).toEqual([30]);
    expect(clickSelection([30], order, 30, shift)).toEqual([30]);
  });
});

test('contextSelection keeps a selection that includes the card', () => {
  expect(contextSelection([10, 20], 20)).toEqual([10, 20]);
  expect(contextSelection([10, 20], 30)).toEqual([30]);
});

describe('pageWindow', () => {
  test('shows every page when there are few', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  test('shows ten pages around the current one', () => {
    expect(pageWindow(1, 30)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageWindow(15, 30)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(pageWindow(30, 30)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });
});

describe('applySuggestion', () => {
  const relations: Relations = {
    ...emptyRelations(),
    parody_character: { avengers: ['thor', 'iron man'] },
    character_parody: { thor: 'avengers', 'iron man': 'avengers' },
    author_parody: { ann: ['avengers'], bob: ['original'] },
    author_genre: { ann: ['action', 'drama'], bob: ['drama'] },
    author_category: { ann: ['manga'] },
  };
  const form = (selected: Partial<TagForm['selected']> = {}): TagForm => ({
    selected: { ...emptyTagMap(), ...selected },
    order: {
      author: ['zed', 'bob', 'ann'],
      parody: ['original', 'avengers'],
      character: ['loki', 'iron man', 'thor'],
      genre: ['comedy', 'drama', 'action'],
      category: ['voice', 'manga'],
    },
  });

  test('a character fills in its parody when none is set', () => {
    const result = applySuggestion(form({ character: ['thor'] }), relations, 'character', 'thor');
    expect(result.selected.parody).toEqual(['avengers']);
    // Filling the parody also brings its characters and authors to the top.
    expect(result.order.character).toEqual(['thor', 'iron man', 'loki']);
    expect(result.order.author).toEqual(['ann', 'zed', 'bob']);
  });

  test('a character never replaces a parody that is already set', () => {
    const result = applySuggestion(form({ parody: ['original'] }), relations, 'character', 'thor');
    expect(result.selected.parody).toEqual(['original']);
    expect(result.order).toEqual(form().order);
  });

  test('a parody moves its characters and authors to the top', () => {
    const result = applySuggestion(form({ parody: ['avengers'] }), relations, 'parody', 'avengers');
    expect(result.order.character).toEqual(['thor', 'iron man', 'loki']);
    expect(result.order.author).toEqual(['ann', 'zed', 'bob']);
    expect(result.selected.parody).toEqual(['avengers']);
  });

  test('an author fills in their main parody and category and moves their genres up', () => {
    const result = applySuggestion(form({ author: ['ann'] }), relations, 'author', 'ann');
    expect(result.selected.parody).toEqual(['avengers']);
    expect(result.selected.category).toEqual(['manga']);
    expect(result.order.genre).toEqual(['action', 'drama', 'comedy']);
  });

  test('with a parody and category already set, an author only reorders', () => {
    const start = form({ author: ['ann'], parody: ['original'], category: ['voice'] });
    const result = applySuggestion(start, relations, 'author', 'ann');
    expect(result.selected.parody).toEqual(['original']);
    expect(result.selected.category).toEqual(['voice']);
    expect(result.order.genre).toEqual(['action', 'drama', 'comedy']);
    expect(result.order.category).toEqual(['manga', 'voice']);
  });

  test('a genre moves its authors to the top only while no author is set', () => {
    expect(applySuggestion(form({ genre: ['drama'] }), relations, 'genre', 'drama').order.author).toEqual([
      'ann',
      'bob',
      'zed',
    ]);
    const withAuthor = form({ genre: ['drama'], author: ['zed'] });
    expect(applySuggestion(withAuthor, relations, 'genre', 'drama').order.author).toEqual(['zed', 'bob', 'ann']);
  });

  test('a tag with no known relations changes nothing', () => {
    const start = form({ author: ['zed'] });
    expect(applySuggestion(start, relations, 'author', 'zed')).toEqual(start);
    expect(applySuggestion(start, relations, 'category', 'voice')).toEqual(start);
  });
});

describe('filterSuggestions', () => {
  const order = ['big sister', 'sci-fi', 'sister', 'action'];

  test('keeps the given order and marks chosen tags', () => {
    expect(filterSuggestions(order, ['sister'], '')).toEqual([
      { name: 'big sister', chosen: false },
      { name: 'sci-fi', chosen: false },
      { name: 'sister', chosen: true },
      { name: 'action', chosen: false },
    ]);
  });

  test('matches anywhere in the name, ignoring case and punctuation', () => {
    expect(filterSuggestions(order, [], 'SIS').map(r => r.name)).toEqual(['big sister', 'sister']);
    expect(filterSuggestions(order, [], 'Sci-Fi!').map(r => r.name)).toEqual(['sci-fi']);
    expect(filterSuggestions(order, [], 'zzz')).toEqual([]);
  });

  test('a tag typed in full comes first', () => {
    expect(filterSuggestions(order, [], 'Sister').map(r => r.name)).toEqual(['sister', 'big sister']);
    const many = [...Array.from({ length: 150 }, (_, i) => `kai ${i}`), 'ai'];
    const rows = filterSuggestions(many, ['ai'], 'ai');
    expect(rows).toHaveLength(100);
    expect(rows[0]).toEqual({ name: 'ai', chosen: true });
  });
});
