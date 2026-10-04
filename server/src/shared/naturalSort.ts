const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Orders "2" before "10" and ignores case. */
export const naturalCompare = (a: string, b: string): number => collator.compare(a, b);
