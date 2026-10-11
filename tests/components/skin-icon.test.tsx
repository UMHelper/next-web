// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SkinIcon } from "@/components/skin-icon";
import { setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

async function mount(name: string) {
  const view = render(<SkinIcon name={name} size={20} />);
  await act(async () => {});
  return view.container.querySelector("svg") as SVGElement;
}

beforeEach(() => {
  installFakeStorage();
});
afterEach(() => {
  cleanup();
});

describe("SkinIcon", () => {
  it("renders the lucide icon under the default skin", async () => {
    const svg = await mount("FAH");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the 48-grid naive icon under the island skin", async () => {
    setSkin("island");
    const svg = await mount("FAH");
    expect(svg.getAttribute("viewBox")).toBe("0 0 48 48");
  });

  it("falls back to the generic faculty icon for unknown names", async () => {
    setSkin("island");
    const known = await mount("faculty");
    cleanup();
    const unknown = await mount("ZZZ");
    expect(unknown.innerHTML).toBe(known.innerHTML);
  });
});
