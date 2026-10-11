// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: useThemeMock }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { ThemeOptions, ThemeToggle } from "@/components/theme-toggle";
import { SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  useThemeMock.mockReturnValue({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeToggle skin icons", () => {
  it("keeps the lucide icon on the default skin", () => {
    const view = render(React.createElement(ThemeToggle));
    expect(view.container.querySelector("svg.lucide")).not.toBeNull();
    expect(view.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("swaps to the naive icon on the island skin and keeps the label", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(ThemeToggle));
    expect(view.container.querySelector("svg.lucide")).toBeNull();
    const svg = view.container.querySelector("button svg");
    expect(svg?.outerHTML).toContain("currentColor");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(view.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("uses 20px naive icons in the mobile options on the island skin", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(ThemeOptions));
    const svgs = [...view.container.querySelectorAll("button svg")];
    expect(svgs).toHaveLength(2);
    expect(svgs.every((s) => s.getAttribute("width") === "20")).toBe(true);
    expect(view.container.querySelector("svg.lucide")).toBeNull();
  });
});
