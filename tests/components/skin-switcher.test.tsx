// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SkinOptions, SkinSwitcher } from "@/components/skin-switcher";
import { SKIN_STORAGE_KEY, getSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  storage = installFakeStorage();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkinOptions", () => {
  it("renders a radiogroup with both skins and no selection before mount", () => {
    const html = renderToStaticMarkup(React.createElement(SkinOptions));
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Skin"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-checked="true"');
  });

  it("marks the stored skin after mount and persists a new choice", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(SkinOptions));
    const radios = [...view.container.querySelectorAll("[role='radio']")];
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);

    fireEvent.click(radios[0]);
    expect(getSkin()).toBe("default");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("default");
    expect(
      [...view.container.querySelectorAll("[role='radio']")].map((r) => r.getAttribute("aria-checked")),
    ).toEqual(["true", "false"]);
  });
});

describe("SkinSwitcher", () => {
  it("renders a labelled trigger with a currentColor tree icon", () => {
    const view = render(React.createElement(SkinSwitcher));
    const trigger = screen.getByRole("button", { name: "Skin" });
    expect(trigger.querySelector("svg")?.outerHTML).toContain("currentColor");
    expect(view.container.querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("opens with the keyboard and switches skin", () => {
    render(React.createElement(SkinSwitcher));
    const trigger = screen.getByRole("button", { name: "Skin" });
    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
    });
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["紙本 Paper", "卡通 Cartoon"]);
    fireEvent.click(items[1]);
    expect(getSkin()).toBe("island");
  });
});
