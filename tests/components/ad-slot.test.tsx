import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";

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

beforeEach(() => {
  vi.stubEnv(CLIENT_ENV, "ca-pub-6229219222351733");
  vi.stubEnv(SLOT_ENV, "1234567890");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as unknown as { adsbygoogle?: unknown }).adsbygoogle;
});

describe("AdSlot", () => {
  it("renders an AdSense unit wired to the configured ids", () => {
    render(<AdSlot />);

    const ins = document.querySelector("ins.adsbygoogle");
    expect(ins).not.toBeNull();
    expect(ins?.getAttribute("data-ad-client")).toBe("ca-pub-6229219222351733");
    expect(ins?.getAttribute("data-ad-slot")).toBe("1234567890");
    expect(ins?.getAttribute("data-ad-format")).toBe("auto");
    expect(ins?.getAttribute("data-full-width-responsive")).toBe("true");
    expect(screen.getByText("Advertisement")).toBeTruthy();
  });

  it("requests exactly one ad per unit", () => {
    const pushes = adQueue();
    render(<AdSlot />);
    expect(pushes).toHaveLength(1);
  });

  it("does not double request under StrictMode effects", () => {
    const pushes = adQueue();
    render(
      <React.StrictMode>
        <AdSlot />
      </React.StrictMode>,
    );
    expect(pushes).toHaveLength(1);
  });

  it("renders nothing when AdSense is not configured", () => {
    vi.stubEnv(CLIENT_ENV, "");
    const pushes = adQueue();
    const { container } = render(<AdSlot />);
    expect(container.innerHTML).toBe("");
    expect(pushes).toHaveLength(0);
  });
});
