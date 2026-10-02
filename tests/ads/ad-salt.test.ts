import { afterEach, describe, expect, it, vi } from "vitest";

import { createAdSalt } from "@/lib/ads/ad-salt";

const CLIENT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID";
const SLOT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID";

function configureAdsense(): void {
  vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
  vi.stubEnv(SLOT_ENV, "1234567890");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAdSalt", () => {
  it("returns null when AdSense is not configured", () => {
    vi.stubEnv(CLIENT_ENV, "");
    vi.stubEnv(SLOT_ENV, "");
    expect(createAdSalt()).toBeNull();
  });

  it("returns an 8 character hex salt when AdSense is configured", () => {
    configureAdsense();
    expect(createAdSalt()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns a different salt on each call", () => {
    configureAdsense();
    const salts = new Set(Array.from({ length: 20 }, () => createAdSalt()));
    expect(salts.size).toBeGreaterThan(1);
  });
});
