// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { requestAd } from "@/lib/ads/request-ad";

function makeIns(): Element {
  return document.createElement("ins");
}

describe("requestAd", () => {
  it("pushes one request for a fresh element", () => {
    const queue: unknown[] = [];
    const ins = makeIns();
    expect(requestAd(ins, queue)).toBe(true);
    expect(queue).toHaveLength(1);
  });

  it("never pushes twice for the same element", () => {
    const queue: unknown[] = [];
    const ins = makeIns();
    requestAd(ins, queue);
    expect(requestAd(ins, queue)).toBe(false);
    expect(queue).toHaveLength(1);
  });

  it("skips elements AdSense already filled", () => {
    const queue: unknown[] = [];
    const ins = makeIns();
    ins.setAttribute("data-adsbygoogle-status", "done");
    expect(requestAd(ins, queue)).toBe(false);
    expect(queue).toHaveLength(0);
  });

  it("ignores a missing element", () => {
    const queue: unknown[] = [];
    expect(requestAd(null, queue)).toBe(false);
    expect(queue).toHaveLength(0);
  });

  it("swallows errors thrown by an ad blocker queue", () => {
    const ins = makeIns();
    const queue = {
      push: vi.fn(() => {
        throw new Error("blocked");
      }),
    } as unknown as unknown[];
    expect(() => requestAd(ins, queue)).not.toThrow();
    expect(requestAd(ins, queue)).toBe(false);
  });
});
