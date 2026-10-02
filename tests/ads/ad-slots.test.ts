import React from "react";
import { describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { AD_RATE, fnv1a32, isAdSlot, withAdSlots } from "@/lib/ads/ad-slots";

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

const CARDS = Array.from({ length: 12 }, (_, index) => `CARD-${index}`);

function decorate(salt: string | null, rate?: number) {
  return withAdSlots(CARDS, {
    getKey: (key) => key,
    renderItem: (key) => React.createElement("div", { key }, key),
    salt,
    rate,
  });
}

function adCount(nodes: React.ReactNode[]): number {
  return nodes.filter((node) => React.isValidElement(node) && node.type === AdSlot).length;
}

describe("withAdSlots", () => {
  it("inserts no ads when the salt is null", () => {
    const nodes = decorate(null);
    expect(nodes).toHaveLength(CARDS.length);
    expect(adCount(nodes)).toBe(0);
  });

  it("inserts no ads when the rate is zero", () => {
    const nodes = decorate("test-salt", 0);
    expect(adCount(nodes)).toBe(0);
  });

  it("inserts one ad per card when the rate is one", () => {
    const nodes = decorate("test-salt", 1);
    expect(nodes).toHaveLength(CARDS.length * 2);
    expect(adCount(nodes)).toBe(CARDS.length);
  });

  it("places the slot right after the selected card", () => {
    const nodes = decorate("test-salt");
    expect(adCount(nodes)).toBe(1);

    const adIndex = nodes.findIndex((node) => React.isValidElement(node) && node.type === AdSlot);
    const card = nodes[adIndex - 1];
    expect(React.isValidElement(card) && (card.props as { children: string }).children).toBe("CARD-8");
  });

  it("keeps the original items untouched", () => {
    const items = [...CARDS];
    withAdSlots(items, { getKey: (key) => key, renderItem: (key) => key, salt: "test-salt" });
    expect(items).toEqual(CARDS);
  });
});
