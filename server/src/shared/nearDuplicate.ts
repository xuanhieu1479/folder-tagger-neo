const squash = (name: string) => name.replace(/[\s-]+/g, '');

/** True when the two strings differ by one inserted, deleted or replaced character. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  if (short.length === long.length) return short.slice(i + 1) === long.slice(i + 1);
  return short.slice(i) === long.slice(i + 1);
}

/**
 * Existing tag names that a new name is probably a typo of: the same once spaces
 * and hyphens are removed, or one character away for names of four or more characters.
 */
export function findNearDuplicates(name: string, existing: Iterable<string>): string[] {
  const target = squash(name);
  if (!target) return [];
  const matches: string[] = [];
  for (const other of existing) {
    if (other === name) continue;
    const candidate = squash(other);
    if (candidate === target || (target.length >= 4 && candidate.length >= 4 && withinOneEdit(target, candidate)))
      matches.push(other);
  }
  return matches;
}
