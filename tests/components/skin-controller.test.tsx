// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { SkinController } from "@/components/skin-controller";
import { SKIN_STORAGE_KEY, setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const attr = () => document.documentElement.getAttribute("data-skin");

beforeEach(() => {
  installFakeStorage().setItem(SKIN_STORAGE_KEY, "island");
  usePathnameMock.mockReturnValue("/");
  document.documentElement.removeAttribute("data-skin");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkinController", () => {
  it("writes the stored skin onto <html>", () => {
    render(React.createElement(SkinController));
    expect(attr()).toBe("island");
  });

  it("follows later setSkin calls", () => {
    render(React.createElement(SkinController));
    act(() => setSkin("default"));
    expect(attr()).toBeNull();
    act(() => setSkin("island"));
    expect(attr()).toBe("island");
  });

  it("clears the attribute on /admin and restores it on public pages", () => {
    usePathnameMock.mockReturnValue("/admin/update");
    const view = render(React.createElement(SkinController));
    expect(attr()).toBeNull();
    usePathnameMock.mockReturnValue("/review");
    view.rerender(React.createElement(SkinController));
    expect(attr()).toBe("island");
  });
});
