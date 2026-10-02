import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { setTheme, useThemeMock } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { ThemeOptions, ThemeToggle } from "@/components/theme-toggle";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeOptions", () => {
  it("renders the three modes and marks the active one", () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme });
    const view = render(React.createElement(ThemeOptions));

    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(buttons[1].getAttribute("aria-checked")).toBe("true");
    expect(buttons[0].getAttribute("aria-checked")).toBe("false");
  });

  it("sets the chosen theme exactly once", () => {
    useThemeMock.mockReturnValue({ theme: "light", setTheme });
    const view = render(React.createElement(ThemeOptions));

    fireEvent.click([...view.container.querySelectorAll("button")][1]);

    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("ThemeToggle", () => {
  it("renders a hydration-safe placeholder before mount", () => {
    useThemeMock.mockReturnValue({ theme: undefined, resolvedTheme: undefined, setTheme });

    const html = renderToStaticMarkup(React.createElement(ThemeToggle));

    expect(html).toContain("h-9 w-9");
    expect(html).not.toContain("lucide-sun");
    expect(html).not.toContain("lucide-moon");
    expect(html).not.toContain("lucide-monitor");
  });

  it("renders the trigger after mount", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });

    const view = render(React.createElement(ThemeToggle));

    expect(view.container.querySelector("[aria-label='Switch theme']")).toBeTruthy();
  });
});
