import { describe, expect, test } from 'bun:test';
import { naturalCompare } from '../src/shared/naturalSort';
import { findNearDuplicates } from '../src/shared/nearDuplicate';
import { foldKey, normalizeTagName, pathKey, wordsKey } from '../src/shared/normalize';
import { classifyTagChange } from '../src/shared/tagChange';

describe('normalizeTagName', () => {
  test.each([
    ['Iron Man', 'iron man'],
    ['  Big   Sister  ', 'big sister'],
    ['Re:Zero!', 'rezero'],
    ['sci-fi', 'sci-fi'],
    ['東方Project', '東方project'],
    ['ＦＵＬＬ　Ｗｉｄｔｈ', 'full width'],
    ['Café', 'café'],
    ['スーパー', 'スーパー'],
    ['ไทย ภาษา', 'ไทย ภาษา'],
    ['!!!', ''],
    ['D.Va', 'd.va'],
    ['megaman.exe', 'megaman.exe'],
    ['pochi.', 'pochi.'],
    ['...', ''],
    ['- -', ''],
  ])('%p -> %p', (raw, expected) => {
    expect(normalizeTagName(raw)).toBe(expected);
  });
});

test('foldKey folds case and width beyond ASCII', () => {
  expect(foldKey('ÉCOLE Ａ')).toBe('école a');
});

test('wordsKey wraps words in single spaces', () => {
  expect(wordsKey('[Ai] Big-Sister (vol.2)')).toBe(' ai big sister vol 2 ');
  expect(wordsKey('---')).toBe(' ');
});

test('pathKey ignores case, slash direction and trailing separators', () => {
  expect(pathKey('C:\\Users\\Me\\Manga\\')).toBe('c:\\users\\me\\manga');
  expect(pathKey('c:/users/me/MANGA')).toBe('c:\\users\\me\\manga');
});

test('naturalCompare orders numbers by value and ignores case', () => {
  const names = ['10.png', '2.PNG', '1.png', 'b.jpg', 'A.jpg'];
  expect(names.sort(naturalCompare)).toEqual(['1.png', '2.PNG', '10.png', 'A.jpg', 'b.jpg']);
});

describe('findNearDuplicates', () => {
  const existing = ['big sister', 'school uniform', 'ai', 'kimono', 'sci-fi'];

  test('same name apart from spaces, hyphens and dots', () => {
    expect(findNearDuplicates('bigsister', existing)).toEqual(['big sister']);
    expect(findNearDuplicates('big-sister', existing)).toEqual(['big sister']);
    expect(findNearDuplicates('scifi', existing)).toEqual(['sci-fi']);
    expect(findNearDuplicates('sci.fi', existing)).toEqual(['sci-fi']);
  });

  test('one character away', () => {
    expect(findNearDuplicates('kimomo', existing)).toEqual(['kimono']);
    expect(findNearDuplicates('kimon', existing)).toEqual(['kimono']);
    expect(findNearDuplicates('school uniforms', existing)).toEqual(['school uniform']);
  });

  test('short names are only matched when identical once squashed', () => {
    expect(findNearDuplicates('ao', existing)).toEqual([]);
    expect(findNearDuplicates('a i', existing)).toEqual(['ai']);
  });

  test('an identical or unrelated name is not a near duplicate', () => {
    expect(findNearDuplicates('kimono', existing)).toEqual([]);
    expect(findNearDuplicates('swimsuit', existing)).toEqual([]);
  });
});

describe('classifyTagChange', () => {
  const exists = (name: string) => name === 'iron man';

  test.each([
    ['foo', ' Delete ', { kind: 'delete' }],
    ['foo', 'Iron Man!', { kind: 'merge', name: 'iron man' }],
    ['foo', 'Bar', { kind: 'rename', name: 'bar' }],
    ['foo', 'Foo!', null],
    ['foo', '  ', null],
    ['foo', '!!!', null],
  ])('%p -> %p is %p', (from, to, expected) => {
    expect(classifyTagChange(from, to, exists)).toEqual(expected as ReturnType<typeof classifyTagChange>);
  });
});
