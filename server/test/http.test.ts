import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { staticPath } from '../src/http';
import { tempDir } from './fixtures';

const tmp = tempDir('http');
afterAll(tmp.cleanup);

describe('staticPath', () => {
  const dist = path.join(tmp.dir, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(tmp.dir, 'dist-old'));
  fs.writeFileSync(path.join(dist, 'assets', 'app 1.js'), 'x');
  fs.writeFileSync(path.join(tmp.dir, 'dist-old', 'secret.txt'), 'x');
  fs.writeFileSync(path.join(tmp.dir, 'outside.txt'), 'x');

  test('finds a file of the web app', () => {
    expect(staticPath(dist, '/assets/app%201.js')).toBe(path.join(dist, 'assets', 'app 1.js'));
  });

  test('a folder, a missing file and the root are not files', () => {
    for (const pathname of ['/', '/assets', '/assets/nope.js']) expect(staticPath(dist, pathname)).toBeNull();
  });

  test('never leaves the web app folder', () => {
    for (const pathname of [
      '/..%2foutside.txt',
      '/..%5coutside.txt',
      '/..%2fdist-old/secret.txt',
      '/%2e%2e/outside.txt',
    ])
      expect(staticPath(dist, pathname)).toBeNull();
  });

  test('a broken escape is not an error', () => {
    expect(staticPath(dist, '/%E0%A4%A')).toBeNull();
    expect(staticPath(dist, '/a%00b')).toBeNull();
  });
});
