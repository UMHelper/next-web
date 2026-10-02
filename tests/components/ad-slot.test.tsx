import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";

const CLIENT = "ca-pub-6229219222351733";
const SLOT = "7484871258";
const CLIENT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID";
const SLOT_ENV = "NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID";

function adQueue(): unknown[] {
  const pushes: unknown[] = [];
  (window as unknown as { adsbygoogle: { push: (value: unknown) => void } }).adsbygoogle = {
    push: (value: unknown) => {
      pushes.push(value);
    },
  };
  return pushes;
}

function unconfigureAdsense(): void {
  vi.stubEnv(CLIENT_ENV, "");
  vi.stubEnv(SLOT_ENV, "");
}

function openingTag(html: string | undefined): string | undefined {
  return html?.match(/<ins[^>]*>/)?.[0];
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as unknown as { adsbygoogle?: unknown }).adsbygoogle;
});

describe("AdSlot", () => {
  it("renders an AdSense unit wired to the given ids", () => {
    render(<AdSlot client={CLIENT} slot={SLOT} />);

    const ins = document.querySelector("ins.adsbygoogle");
    expect(ins).not.toBeNull();
    expect(ins?.getAttribute("data-ad-client")).toBe(CLIENT);
    expect(ins?.getAttribute("data-ad-slot")).toBe(SLOT);
    expect(ins?.getAttribute("data-ad-format")).toBe("auto");
    expect(ins?.getAttribute("data-full-width-responsive")).toBe("true");
    expect(screen.getByText("Advertisement")).toBeTruthy();
  });

  it("renders from its props even when the public env vars are missing", () => {
    // Regression: production builds that did not inline NEXT_PUBLIC_GOOGLE_ADS_*
    // made the client return null while the server had rendered the unit, which
    // failed hydration and deleted every ad slot on the page.
    unconfigureAdsense();
    const pushes = adQueue();

    render(<AdSlot client={CLIENT} slot={SLOT} />);

    expect(document.querySelector("ins.adsbygoogle")).not.toBeNull();
    expect(pushes).toHaveLength(1);
  });

  it("produces the same markup on the server and on the client", () => {
    unconfigureAdsense();
    const server = renderToStaticMarkup(<AdSlot client={CLIENT} slot={SLOT} />);

    render(<AdSlot client={CLIENT} slot={SLOT} />);
    const client = document.querySelector("ins.adsbygoogle")?.outerHTML;

    expect(openingTag(client)).toBe(openingTag(server));
  });

  it("requests exactly one ad per unit", () => {
    const pushes = adQueue();
    render(<AdSlot client={CLIENT} slot={SLOT} />);
    expect(pushes).toHaveLength(1);
  });

  it("does not double request under StrictMode effects", () => {
    const pushes = adQueue();
    render(
      <React.StrictMode>
        <AdSlot client={CLIENT} slot={SLOT} />
      </React.StrictMode>,
    );
    expect(pushes).toHaveLength(1);
  });

  it("renders nothing when an id is missing", () => {
    const pushes = adQueue();
    const { container } = render(<AdSlot client="" slot={SLOT} />);

    expect(container.innerHTML).toBe("");
    expect(pushes).toHaveLength(0);
  });
});
