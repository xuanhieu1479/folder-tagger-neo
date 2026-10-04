// Builds a fake library for trying the app without touching real data:
// folders with generated images in data/dev-fixtures and a database in data/dev.
// Run the app on it with: bun run dev
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PROJECT_ROOT } from '../server/src/config';
import { openDatabase } from '../server/src/db/open';
import { addFolders, findByPath } from '../server/src/services/folders';
import { calculateRelations } from '../server/src/services/relations';
import { applyTags } from '../server/src/services/tags';
import type { TagType } from '../server/src/shared/types';

const FOLDER_COUNT = 300;
const fixtures = path.join(PROJECT_ROOT, 'data', 'dev-fixtures');
const dataDir = path.join(PROJECT_ROOT, 'data', 'dev');

// A fixed seed, so every run builds the same library.
let seed = 20240501;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (probability: number) => random() < probability;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** A PNG with a vertical gradient between two colours. */
function gradientPng(width: number, height: number, top: number[], bottom: number[]): Buffer {
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const offset = y * (1 + width * 3);
    const mix = y / (height - 1);
    const colour = top.map((value, i) => Math.round(value + (bottom[i]! - value) * mix));
    for (let x = 0; x < width; x++) rows.set(colour, offset + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const colour = () => [0, 0, 0].map(() => 40 + Math.floor(random() * 190));

const AUTHORS = ['ai', 'kai', 'miyamoto issa', 'bob smith', 'ann', 'studio north', '山田', 'tanaka', 'el'];
const PARODIES = ['original', 'avengers', '東方', 'fate', 'star trek'];
const CHARACTERS: Record<string, string[]> = {
  avengers: ['iron man', 'thor', 'black widow'],
  東方: ['霊夢', '魔理沙'],
  fate: ['saber', 'rin'],
  'star trek': ['spock', 'kirk'],
};
const GENRES = ['action', 'comedy', 'drama', 'romance', 'sci-fi', 'school', 'fantasy', 'horror', 'slice of life'];
const CATEGORIES = ['manga', 'voice', 'game', 'anime'];
const WORDS = [
  'Iron',
  'Rainy',
  'Day',
  'Suit',
  'École',
  'Café',
  '紅魔郷',
  'Summer',
  'Night',
  'Story',
  'Vol',
  'Ai',
  'Blue',
];

fs.rmSync(fixtures, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(fixtures, { recursive: true });

const db = openDatabase(path.join(dataDir, 'app.db'));
const mainCategory = new Map(AUTHORS.map(author => [author, pick(CATEGORIES)]));
const mainParody = new Map(AUTHORS.map(author => [author, pick(PARODIES)]));

for (let i = 1; i <= FOLDER_COUNT; i++) {
  const author = pick(AUTHORS);
  const title = Array.from({ length: 2 + Math.floor(random() * 3) }, () => pick(WORDS)).join(' ');
  const dir = path.join(fixtures, `[${author}] ${title} ${i}`);
  fs.mkdirSync(dir);

  // One in ten folders has no images, like a voice work or a game.
  const images = chance(0.1) ? 0 : 3 + Math.floor(random() * 6);
  for (let n = 1; n <= images; n++)
    fs.writeFileSync(path.join(dir, `${n}.png`), gradientPng(250, 350, colour(), colour()));
  if (images === 0) fs.writeFileSync(path.join(dir, 'readme.txt'), 'No images here.');

  addFolders(db, [dir]);
  if (chance(0.08)) continue; // Left untagged.

  const parody = chance(0.75) ? mainParody.get(author)! : pick(PARODIES);
  const tags: Partial<Record<TagType, string[]>> = {
    author: chance(0.1) ? [author, pick(AUTHORS)] : [author],
    parody: [parody],
    character: (CHARACTERS[parody] ?? []).filter(() => chance(0.6)),
    genre: [pick(GENRES), pick(GENRES)],
    category: [chance(0.85) ? mainCategory.get(author)! : pick(CATEGORIES)],
  };
  applyTags(db, { folderIds: [findByPath(db, dir)!.id], mode: 'add', tags });
}

// Spread the dates and open counts so the Updated and Popular sorts have something to show.
db.exec(`UPDATE folders SET updated_at = updated_at - (abs(random()) % 8640000000),
           open_count = abs(random()) % 30`);
calculateRelations(db);
db.close();

console.log(`Created ${FOLDER_COUNT} folders in ${fixtures}`);
console.log(`Database: ${path.join(dataDir, 'app.db')}`);
