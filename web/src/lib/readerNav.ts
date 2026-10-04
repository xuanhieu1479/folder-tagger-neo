/** Positions closer than this to the top of the view count as being at the top. */
const SLACK = 1;

/**
 * The image an arrow key jumps to in the reader. `tops` are the top edges of the images
 * and `scrollTop` is the top of the view. Forward goes to the first image starting below
 * the top of the view; backward goes to the last one starting above it, which is the
 * image on screen when the view is in the middle of it. Null when there is none.
 */
export function jumpTarget(tops: number[], scrollTop: number, direction: 1 | -1): number | null {
  if (direction === 1) {
    const next = tops.findIndex(top => top > scrollTop + SLACK);
    return next === -1 ? null : next;
  }
  const previous = tops.findLastIndex(top => top < scrollTop - SLACK);
  return previous === -1 ? null : previous;
}

/** The image at the top of the view, and how far into it the view starts (0 to 1). */
export function viewAnchor(tops: number[], heights: number[], scrollTop: number): { index: number; ratio: number } {
  const index = Math.max(
    0,
    tops.findLastIndex(top => top <= scrollTop + SLACK),
  );
  const height = heights[index] ?? 0;
  const ratio = height > 0 ? Math.min(Math.max((scrollTop - (tops[index] ?? 0)) / height, 0), 1) : 0;
  return { index, ratio };
}
