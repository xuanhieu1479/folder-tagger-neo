/**
 * The page numbers to show as buttons: up to `size` consecutive pages, centred on
 * the current page where possible.
 */
export function pageWindow(current: number, pages: number, size = 10): number[] {
  const length = Math.min(size, pages);
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), pages - length + 1));
  return Array.from({ length }, (_, i) => start + i);
}
