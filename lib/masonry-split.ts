/**
 * Round-robin column grouping: the first item goes to the first column, the
 * second to the second column, and so on, so reading the columns left to right
 * reproduces the original order. This is what keeps the layout horizontal
 * (row-major) instead of the column-major order CSS multi-column would give.
 */
export function splitIntoColumns<T>(items: readonly T[], columns: number): T[][] {
  const count = Math.floor(columns);
  if (!Number.isFinite(count) || count <= 1) return [items.slice()];

  const groups: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    groups[index % count].push(item);
  });
  return groups;
}

/**
 * Column count for a viewport width, matching the Tailwind breakpoints used by
 * the grid container (`md: 768px`, `xl: 1280px`).
 */
export function columnsForWidth(col: number, width: number): number {
  if (col >= 3) {
    if (width >= 1280) return 3;
    if (width >= 768) return 2;
    return 1;
  }
  if (col === 2) return width >= 768 ? 2 : 1;
  return 1;
}
