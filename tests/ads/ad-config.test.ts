import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAdsenseClientId,
  getAdsenseSlotId,
  isAdsenseConfigured,
} from "@/lib/ads/ad-config";

const CLIENT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID";
const SLOT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ad-config", () => {
  it("is configured only when both env values are present", () => {
    vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
    vi.stubEnv(SLOT_ENV, "1234567890");
    expect(isAdsenseConfigured()).toBe(true);

    vi.stubEnv(SLOT_ENV, "");
    expect(isAdsenseConfigured()).toBe(false);

    vi.stubEnv(CLIENT_ENV, "");
    vi.stubEnv(SLOT_ENV, "1234567890");
    expect(isAdsenseConfigured()).toBe(false);
  });

  it("normalises blank values to null", () => {
    vi.stubEnv(CLIENT_ENV, "   ");
    vi.stubEnv(SLOT_ENV, " 1234567890 ");
    expect(getAdsenseClientId()).toBeNull();
    expect(getAdsenseSlotId()).toBe("1234567890");
  });

  it("returns null when the env vars are not set at all", () => {
    vi.stubEnv(CLIENT_ENV, undefined as unknown as string);
    expect(getAdsenseClientId()).toBeNull();
  });
});
