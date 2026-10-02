import React, { type ReactNode } from "react";

import { AdSlot } from "@/components/ads/ad-slot";

export const AD_RATE = 0.1;

/**
 * Everything the client needs to render one ad unit. It is produced on the
 * server (see `createAdConfig`) and travels down as a prop / RSC payload, so
 * the server and the client never decide independently from their own env.
 */
export type AdConfig = {
  salt: string;
  client: string;
  slot: string;
};

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function isAdSlot(key: string, salt: string, rate: number = AD_RATE): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return fnv1a32(`${salt}:${key}`) % 1000 < Math.round(rate * 1000);
}

export type WithAdSlotsOptions<T> = {
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  ads: AdConfig | null;
  rate?: number;
};

/**
 * Renders a list and inserts one AdSlot after every item that the deterministic
 * picker selects. Pure: the same (items, ads, rate) always produce the same
 * children, so server rendering and hydration agree. `ads === null` (AdSense
 * not configured) leaves the list untouched instead of rendering empty holes.
 */
export function withAdSlots<T>(items: T[], options: WithAdSlotsOptions<T>): ReactNode[] {
  const { getKey, renderItem, ads, rate = AD_RATE } = options;

  return items.flatMap((item, index) => {
    const rendered = renderItem(item, index);
    if (ads === null) return [rendered];

    const key = getKey(item, index);
    if (!isAdSlot(key, ads.salt, rate)) return [rendered];

    return [rendered, <AdSlot key={`ad-${key}`} client={ads.client} slot={ads.slot} />];
  });
}
