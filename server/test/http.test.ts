import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { isOwnRequest, staticPath } from '../src/http';
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

describe('isOwnRequest', () => {
  const request = (url: string, headers: Record<string, string> = {}) => new Request(url, { method: 'POST', headers });
  const own = 'http://127.0.0.1:4710/api/tags/clear-unused';

  test('the app window, the launcher and the dev server are let in', () => {
    expect(isOwnRequest(request(own))).toBe(true);
    expect(isOwnRequest(request(own, { Origin: 'http://127.0.0.1:4710', 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
    expect(isOwnRequest(request(own, { 'Sec-Fetch-Site': 'none' }))).toBe(true);
    expect(isOwnRequest(request('http://localhost:5173/api/tags', { Origin: 'http://localhost:5173' }))).toBe(true);
  });

  test('another web page is kept out', () => {
    expect(isOwnRequest(request(own, { Origin: 'https://evil.example' }))).toBe(false);
    expect(isOwnRequest(request(own, { Origin: 'null' }))).toBe(false);
    expect(isOwnRequest(request(own, { Origin: 'http://127.0.0.1:9999' }))).toBe(false);
    expect(isOwnRequest(request(own, { 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
    expect(isOwnRequest(request(own, { 'Sec-Fetch-Site': 'same-site' }))).toBe(false);
  });

  test('another host name pointed at this computer is kept out', () => {
    expect(isOwnRequest(request('http://evil.example:4710/api/tags'))).toBe(false);
    expect(isOwnRequest(request('http://evil.example:4710/api/tags', { Origin: 'http://evil.example:4710' }))).toBe(
      false,
    );
  });
});
