import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldSelfHostAdsenseLoader } from "@/lib/ads/ad-config";

const CLIENT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shouldSelfHostAdsenseLoader", () => {
  it("does not self host when GTM already loads AdSense", () => {
    vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
    vi.stubEnv("GTM_ID", "GTM-KGF3BFS");
    expect(shouldSelfHostAdsenseLoader()).toBe(false);
  });

  it("self hosts when there is a client id but no GTM", () => {
    vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
    vi.stubEnv("GTM_ID", "");
    expect(shouldSelfHostAdsenseLoader()).toBe(true);
  });

  it("never self hosts without a client id", () => {
    vi.stubEnv(CLIENT_ENV, "");
    vi.stubEnv("GTM_ID", "");
    expect(shouldSelfHostAdsenseLoader()).toBe(false);
  });
});

// next/script only renders inside a Next runtime (it renders nothing under a
// bare renderToStaticMarkup), so the loader tag itself is asserted from source:
// the URL must be built from the configured client id.
describe("AdsenseScript source", () => {
  const source = readFileSync("components/ads/adsense-script.tsx", "utf8");

  it("uses the AdSense loader URL with the configured client id", () => {
    expect(source).toContain(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}",
    );
    expect(source).toContain('strategy="afterInteractive"');
    expect(source).toContain('crossOrigin="anonymous"');
  });

  it("is mounted from the root layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("<AdsenseScript />");
  });
});
