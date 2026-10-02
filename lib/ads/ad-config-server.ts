import { getAdsenseClientId, getAdsenseSlotId } from "@/lib/ads/ad-config";
import type { AdConfig } from "@/lib/ads/ad-slots";

/**
 * Server-only: builds everything an ad unit needs for one server render — a
 * fresh salt plus the AdSense ids, which are read from the runtime env here and
 * then travel to the client inside the payload.
 *
 * The client must never read `NEXT_PUBLIC_GOOGLE_ADS_*` itself: `NEXT_PUBLIC_*`
 * values are inlined at build time, so a build without them would make the
 * client render `null` while the server had rendered the unit — a hydration
 * failure that removes every ad slot and never pushes an ad request.
 */
export function createAdConfig(): AdConfig | null {
  const client = getAdsenseClientId();
  const slot = getAdsenseSlotId();
  if (!client || !slot) return null;

  return { salt: crypto.randomUUID().slice(0, 8), client, slot };
}
