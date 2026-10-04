/**
 * Folds text for comparison. SQLite only folds ASCII case, so every searchable
 * column stores this form and every query is folded the same way.
 */
export const foldKey = (text: string): string => text.normalize('NFKC').toLowerCase();

/**
 * A tag name as stored: letters, marks and digits of any language, spaces, hyphens and
 * dots, lowercased. A name without any letter or digit is no name.
 */
export function normalizeTagName(raw: string): string {
  const name = foldKey(raw)
    .replace(/[^\p{L}\p{N}\p{M}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(name) ? name : '';
}

/** Words separated and wrapped by single spaces (' iron man '), so ' x ' finds whole words. */
export function wordsKey(text: string): string {
  const words = foldKey(text)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
  return words ? ` ${words} ` : ' ';
}

/** Windows paths differ only by case or a trailing separator when they name the same folder. */
export function pathKey(folderPath: string): string {
  return folderPath.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
}
