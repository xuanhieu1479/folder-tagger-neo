import type { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { calculateRelations, getRelations } from '../src/services/relations';
import { emptyRelations, type TagType } from '../src/shared/types';
import { memoryDb, seedFolder } from './fixtures';

let db: Database;
let n = 0;
beforeEach(() => {
  db = memoryDb();
});

const add = (count: number, tags: Partial<Record<TagType, string[]>>) => {
  for (let i = 0; i < count; i++) seedFolder(db, { name: `folder ${n++}`, tags });
};

describe('author relations', () => {
  test('nothing is learned from an empty library', () => {
    expect(calculateRelations(db)).toEqual(emptyRelations());
  });

  test('an author needs at least 5 folders of their own', () => {
    add(4, { author: ['few'], parody: ['p'], genre: ['g'], category: ['manga'] });
    expect(calculateRelations(db).author_parody).toEqual({});
    add(1, { author: ['few'], parody: ['p'], genre: ['g'], category: ['manga'] });
    const relations = calculateRelations(db);
    expect(relations.author_parody).toEqual({ few: ['p'] });
    expect(relations.author_genre).toEqual({ few: ['g'] });
    expect(relations.author_category).toEqual({ few: ['manga'] });
  });

  test('a tag is usual at 51% of the folders, not at 50%', () => {
    // 100 folders: "half" is on exactly 50, "most" on 51.
    add(50, { author: ['ann'], genre: ['half', 'most'] });
    add(1, { author: ['ann'], genre: ['most'] });
    add(49, { author: ['ann'] });
    expect(calculateRelations(db).author_genre).toEqual({ ann: ['most'] });
  });

  test('3 of 5 folders is enough, 2 of 5 is not', () => {
    add(3, { author: ['bob'], parody: ['main'], genre: ['rare'] });
    add(2, { author: ['bob'], parody: ['other'] });
    const relations = calculateRelations(db);
    expect(relations.author_parody).toEqual({ bob: ['main'] });
    expect(relations.author_genre).toEqual({ bob: ['rare'] });
  });

  test('folders with several authors count for none of them', () => {
    add(5, { author: ['solo'], genre: ['own'] });
    add(20, { author: ['solo', 'guest'], genre: ['shared'] });
    const relations = calculateRelations(db);
    expect(relations.author_genre).toEqual({ solo: ['own'] });
  });

  test('usual tags are ordered most frequent first', () => {
    add(6, { author: ['cat'], genre: ['a-second', 'z-first'] });
    add(2, { author: ['cat'], genre: ['z-first'] });
    expect(calculateRelations(db).author_genre).toEqual({ cat: ['z-first', 'a-second'] });
  });
});

describe('parody relations', () => {
  test('characters come from folders with exactly one parody, with no threshold', () => {
    add(1, { parody: ['avengers'], character: ['iron man', 'thor'] });
    add(2, { parody: ['avengers'], character: ['thor'] });
    add(1, { parody: ['avengers', 'x-men'], character: ['wolverine'] });
    add(1, { character: ['nobody'] });
    const relations = calculateRelations(db);
    expect(relations.parody_character).toEqual({ avengers: ['thor', 'iron man'] });
  });

  test('a character points to the parody it is most often seen with', () => {
    add(1, { parody: ['crossover'], character: ['thor'] });
    add(3, { parody: ['avengers'], character: ['thor'] });
    expect(calculateRelations(db).character_parody).toEqual({ thor: 'avengers' });
  });
});

test('the result is stored and read back', () => {
  expect(getRelations(db)).toEqual(emptyRelations());
  add(5, { author: ['ann'], parody: ['p'] });
  const calculated = calculateRelations(db);
  expect(getRelations(db)).toEqual(calculated);
});
