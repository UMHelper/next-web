import React from "react";
import { describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { AD_RATE, fnv1a32, isAdSlot, withAdSlots, type AdConfig } from "@/lib/ads/ad-slots";

const ADS: AdConfig = {
  salt: "test-salt",
  client: "ca-pub-6229219222351733",
  slot: "7484871258",
};

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

function decorate(ads: AdConfig | null, rate?: number) {
  return withAdSlots(CARDS, {
    getKey: (key) => key,
    renderItem: (key) => React.createElement("div", { key }, key),
    ads,
    rate,
  });
}

function adSlots(nodes: React.ReactNode[]) {
  return nodes.filter(
    (node): node is React.ReactElement<{ client: string; slot: string }> =>
      React.isValidElement(node) && node.type === AdSlot,
  );
}

describe("withAdSlots", () => {
  it("inserts no ads when there is no ad config", () => {
    const nodes = decorate(null);
    expect(nodes).toHaveLength(CARDS.length);
    expect(adSlots(nodes)).toHaveLength(0);
  });

  it("inserts no ads when the rate is zero", () => {
    const nodes = decorate(ADS, 0);
    expect(adSlots(nodes)).toHaveLength(0);
  });

  it("inserts one ad per card when the rate is one", () => {
    const nodes = decorate(ADS, 1);
    expect(nodes).toHaveLength(CARDS.length * 2);
    expect(adSlots(nodes)).toHaveLength(CARDS.length);
  });

  it("places the slot right after the selected card", () => {
    const nodes = decorate(ADS);
    expect(adSlots(nodes)).toHaveLength(1);

    const adIndex = nodes.findIndex((node) => React.isValidElement(node) && node.type === AdSlot);
    const card = nodes[adIndex - 1];
    expect(React.isValidElement(card) && (card.props as { children: string }).children).toBe("CARD-8");
  });

  it("hands the unit ids from the ad config to every slot", () => {
    for (const slot of adSlots(decorate(ADS, 1))) {
      expect(slot.props.client).toBe(ADS.client);
      expect(slot.props.slot).toBe(ADS.slot);
    }
  });

  it("keeps the original items untouched", () => {
    const items = [...CARDS];
    withAdSlots(items, { getKey: (key) => key, renderItem: (key) => key, ads: ADS });
    expect(items).toEqual(CARDS);
  });
});
