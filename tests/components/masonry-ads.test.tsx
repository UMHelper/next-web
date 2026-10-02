import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { Masonry } from "@/components/masonry";
import { withAdSlots } from "@/lib/ads/ad-slots";

process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID = "ca-pub-6229219222351733";
process.env.NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID = "1234567890";

const CARDS = Array.from({ length: 12 }, (_, index) => `CARD-${index}`);

function renderList(salt: string | null): string {
  return renderToStaticMarkup(
    <Masonry col={3}>
      {withAdSlots(CARDS, {
        getKey: (key) => key,
        renderItem: (key) => (
          <div key={key} data-card={key}>
            {key}
          </div>
        ),
        salt,
      })}
    </Masonry>,
  );
}

function slotsIn(html: string): number {
  return (html.match(/class="adsbygoogle/g) ?? []).length;
}

describe("Masonry ad slots", () => {
  it("renders the ad slot into the server HTML, inside the grid", () => {
    const html = renderList("test-salt");

    expect(html).toContain("grid items-start gap-4");
    expect(slotsIn(html)).toBe(1);
    expect(html).toContain("Advertisement");
    expect(html.indexOf('data-card="CARD-8"')).toBeLessThan(html.indexOf("adsbygoogle"));
    expect(html).toContain('data-ad-client="ca-pub-6229219222351733"');
    expect(html).toContain('data-ad-slot="1234567890"');
  });

  it("renders no ad slot when the salt is null", () => {
    const html = renderList(null);
    expect(html).not.toContain("adsbygoogle");
    expect(html).toContain('data-card="CARD-11"');
  });

  it("is stable across renders with the same salt", () => {
    expect(renderList("test-salt")).toBe(renderList("test-salt"));
  });

  it("keeps every card in the server HTML regardless of the salt", () => {
    for (const salt of [null, "test-salt", "salt-a", "salt-b"]) {
      const html = renderList(salt);
      for (const card of CARDS) {
        expect(html, `${salt} lost ${card}`).toContain(`data-card="${card}"`);
      }
    }
  });
});

describe("AdSlot export shape", () => {
  it("is a function component", () => {
    expect(typeof AdSlot).toBe("function");
  });
});
