import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Masonry } from "@/components/masonry";
import { withAdSlots, type AdConfig } from "@/lib/ads/ad-slots";

const ADS: AdConfig = {
  salt: "test-salt",
  client: "ca-pub-6229219222351733",
  slot: "7484871258",
};

const CARDS = Array.from({ length: 12 }, (_, index) => `CARD-${index}`);

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderList(ads: AdConfig | null): string {
  return renderToStaticMarkup(
    <Masonry col={3}>
      {withAdSlots(CARDS, {
        getKey: (key) => key,
        renderItem: (key) => (
          <div key={key} data-card={key}>
            {key}
          </div>
        ),
        ads,
      })}
    </Masonry>,
  );
}

function slotsIn(html: string): number {
  return (html.match(/class="adsbygoogle/g) ?? []).length;
}

describe("Masonry ad slots", () => {
  it("renders the ad slot into the server HTML, inside the grid", () => {
    const html = renderList(ADS);

    expect(html).toContain("grid items-start gap-4");
    expect(slotsIn(html)).toBe(1);
    expect(html).toContain("Advertisement");
    expect(html.indexOf('data-card="CARD-8"')).toBeLessThan(html.indexOf("adsbygoogle"));
    expect(html).toContain('data-ad-client="ca-pub-6229219222351733"');
    expect(html).toContain('data-ad-slot="7484871258"');
  });

  it("renders the unit from the ad config, not from the process env", () => {
    // Regression: a production build without the NEXT_PUBLIC_GOOGLE_ADS_* vars
    // inlined made the client render null where the server rendered a unit,
    // which failed hydration and deleted every ad slot.
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID", "");

    const html = renderList(ADS);

    expect(slotsIn(html)).toBe(1);
    expect(html).toContain('data-ad-client="ca-pub-6229219222351733"');
  });

  it("renders no ad slot without an ad config", () => {
    const html = renderList(null);
    expect(html).not.toContain("adsbygoogle");
    expect(html).toContain('data-card="CARD-11"');
  });

  it("is stable across renders with the same ad config", () => {
    expect(renderList(ADS)).toBe(renderList(ADS));
  });

  it("keeps every card in the server HTML regardless of the ad config", () => {
    for (const ads of [null, ADS, { ...ADS, salt: "salt-a" }, { ...ADS, salt: "salt-b" }]) {
      const html = renderList(ads);
      for (const card of CARDS) {
        expect(html, `${ads?.salt ?? "null"} lost ${card}`).toContain(`data-card="${card}"`);
      }
    }
  });
});
