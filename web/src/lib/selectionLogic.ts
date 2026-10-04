export type ClickModifiers = { ctrl: boolean; shift: boolean };

/**
 * The selection after a card is clicked. The selection is ordered: its first id is
 * the anchor for Shift ranges and its last id is where arrow keys continue from.
 *
 * - Plain click: select only that card, or clear when it was the only one selected.
 * - Ctrl+click: add or remove that card.
 * - Shift+click: select everything from the anchor to that card.
 */
export function clickSelection(
  selected: number[],
  order: number[],
  clicked: number,
  modifiers: ClickModifiers,
): number[] {
  if (modifiers.shift) {
    const anchor = selected[0];
    if (anchor === undefined || anchor === clicked) return [clicked];
    const from = order.indexOf(anchor);
    const to = order.indexOf(clicked);
    if (from === -1 || to === -1) return [clicked];
    return from < to ? order.slice(from, to + 1) : order.slice(to, from + 1).reverse();
  }
  if (modifiers.ctrl)
    return selected.includes(clicked) ? selected.filter(id => id !== clicked) : [...selected, clicked];
  return selected.length === 1 && selected[0] === clicked ? [] : [clicked];
}

/** A right-click keeps a selection that already includes the card; otherwise it selects just that card. */
export const contextSelection = (selected: number[], clicked: number): number[] =>
  selected.includes(clicked) ? selected : [clicked];
