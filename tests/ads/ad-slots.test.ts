import { describe, expect, it } from "vitest";

import { AD_RATE, fnv1a32, isAdSlot } from "@/lib/ads/ad-slots";

function keys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `COURSE-${index}`);
}

describe("isAdSlot", () => {
  it("is deterministic for the same key and salt", () => {
    expect(isAdSlot("COMP1001", "salt-a")).toBe(isAdSlot("COMP1001", "salt-a"));
    expect(isAdSlot("COMP1002", "salt-a")).toBe(isAdSlot("COMP1002", "salt-a"));
  });

  it("defaults to a 10% rate", () => {
    expect(AD_RATE).toBe(0.1);
  });

  it("selects roughly 10% of a 1000 key corpus", () => {
    const hits = keys(1000).filter((key) => isAdSlot(key, "salt-density")).length;
    expect(hits).toBeGreaterThanOrEqual(70);
    expect(hits).toBeLessThanOrEqual(130);
  });

  it("moves slots when the salt changes", () => {
    const withA = keys(200).filter((key) => isAdSlot(key, "salt-a")).join(",");
    const withB = keys(200).filter((key) => isAdSlot(key, "salt-b")).join(",");
    expect(withA).not.toBe(withB);
  });

  it("honours the rate boundaries", () => {
    expect(isAdSlot("COMP1001", "salt-a", 0)).toBe(false);
    expect(isAdSlot("COMP1001", "salt-a", 1)).toBe(true);
    expect(isAdSlot("COMP1001", "salt-a", 0.5)).toBe(isAdSlot("COMP1001", "salt-a", 0.5));
  });
});

describe("fnv1a32", () => {
  it("returns the FNV-1a offset basis for an empty string", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
  });

  it("returns an unsigned 32-bit value and distinguishes inputs", () => {
    const value = fnv1a32("COMP1001:salt-a");
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(2 ** 32);
    expect(fnv1a32("a")).not.toBe(fnv1a32("b"));
  });
});
