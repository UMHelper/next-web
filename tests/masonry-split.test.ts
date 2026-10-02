import { describe, expect, it } from "vitest";

import { columnsForWidth, splitIntoColumns } from "@/lib/masonry-split";

const ITEMS = Array.from({ length: 11 }, (_, index) => `item-${index}`);

describe("splitIntoColumns", () => {
  it("distributes items round-robin so the columns read left to right", () => {
    expect(splitIntoColumns(ITEMS, 3)).toEqual([
      ["item-0", "item-3", "item-6", "item-9"],
      ["item-1", "item-4", "item-7", "item-10"],
      ["item-2", "item-5", "item-8"],
    ]);
  });

  it("keeps the original order when the columns are read row by row", () => {
    const groups = splitIntoColumns(ITEMS, 3);
    const readBack = ITEMS.map((_, index) => groups[index % 3][Math.floor(index / 3)]);

    expect(readBack).toEqual(ITEMS);
  });

  it("returns a single group for one or fewer columns", () => {
    expect(splitIntoColumns(ITEMS, 1)).toEqual([ITEMS]);
    expect(splitIntoColumns(ITEMS, 0)).toEqual([ITEMS]);
    expect(splitIntoColumns(ITEMS, -2)).toEqual([ITEMS]);
  });

  it("does not mutate the input array", () => {
    const items = [...ITEMS];
    splitIntoColumns(items, 3);
    expect(items).toEqual(ITEMS);
  });

  it("handles an empty list", () => {
    expect(splitIntoColumns([], 3)).toEqual([[], [], []]);
  });
});

describe("columnsForWidth", () => {
  it("matches the grid breakpoints for a three column layout", () => {
    expect(columnsForWidth(3, 1400)).toBe(3);
    expect(columnsForWidth(3, 1280)).toBe(3);
    expect(columnsForWidth(3, 1279)).toBe(2);
    expect(columnsForWidth(3, 768)).toBe(2);
    expect(columnsForWidth(3, 767)).toBe(1);
    expect(columnsForWidth(3, 390)).toBe(1);
  });

  it("matches the grid breakpoints for a two column layout", () => {
    expect(columnsForWidth(2, 1400)).toBe(2);
    expect(columnsForWidth(2, 768)).toBe(2);
    expect(columnsForWidth(2, 767)).toBe(1);
  });

  it("never goes above one column for a single column layout", () => {
    expect(columnsForWidth(1, 1400)).toBe(1);
  });
});
