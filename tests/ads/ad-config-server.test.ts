import { afterEach, describe, expect, it, vi } from "vitest";

import { createAdConfig } from "@/lib/ads/ad-config-server";

const CLIENT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID";
const SLOT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID";

function configureAdsense(): void {
  vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
  vi.stubEnv(SLOT_ENV, "7484871258");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAdConfig", () => {
  it("returns null when AdSense is not configured", () => {
    vi.stubEnv(CLIENT_ENV, "");
    vi.stubEnv(SLOT_ENV, "");
    expect(createAdConfig()).toBeNull();
  });

  it("returns the salt together with the unit ids", () => {
    configureAdsense();
    const config = createAdConfig();

    expect(config?.client).toBe("ca-pub-6229219222351733");
    expect(config?.slot).toBe("7484871258");
    expect(config?.salt).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns a different salt on each call", () => {
    configureAdsense();
    const salts = new Set(Array.from({ length: 20 }, () => createAdConfig()?.salt));
    expect(salts.size).toBeGreaterThan(1);
  });
});
