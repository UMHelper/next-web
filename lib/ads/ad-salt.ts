import { isAdsenseConfigured } from "@/lib/ads/ad-config";

/**
 * Server-only: the salt decides where ad slots land for one server render.
 * Never call this from a client component — a client-side salt would differ
 * from the server value and break hydration.
 */
export function createAdSalt(): string | null {
  if (!isAdsenseConfigured()) return null;
  return crypto.randomUUID().slice(0, 8);
}
