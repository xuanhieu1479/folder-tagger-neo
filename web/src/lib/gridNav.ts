export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export const isArrowKey = (key: string): key is ArrowKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';

/**
 * Where an arrow key moves the selection in a grid of `count` cards laid out in
 * rows of `columns`. `current` is -1 when nothing is selected.
 *
 * Left and right wrap around the ends. Up and down move by one row and stay put
 * at the top and bottom rows; from the row above a short last row, down lands on
 * the last card.
 */
export function nextIndex(key: ArrowKey, current: number, count: number, columns: number): number {
  if (count === 0) return -1;
  const last = count - 1;
  if (current < 0 || current > last) return key === 'ArrowRight' || key === 'ArrowDown' ? 0 : last;

  switch (key) {
    case 'ArrowLeft':
      return current === 0 ? last : current - 1;
    case 'ArrowRight':
      return current === last ? 0 : current + 1;
    case 'ArrowUp':
      return current - columns >= 0 ? current - columns : current;
    case 'ArrowDown': {
      if (current + columns <= last) return current + columns;
      const onLastRow = Math.floor(current / columns) === Math.floor(last / columns);
      return onLastRow ? current : last;
    }
  }
}

/** How many cards sit on the first row, given each card's distance from the top. */
export function countColumns(tops: number[]): number {
  if (tops.length === 0) return 1;
  let columns = 0;
  while (columns < tops.length && tops[columns] === tops[0]) columns++;
  return columns;
}
