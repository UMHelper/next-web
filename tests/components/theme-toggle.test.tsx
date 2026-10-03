import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { setTheme, useThemeMock } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { ThemeOptions, ThemeToggle } from "@/components/theme-toggle";

/**
 * jsdom provides neither matchMedia nor a usable localStorage (the Node 25
 * localStorage throws unless --localstorage-file points at a real path), so both
 * are replaced. `stored` stands in for the persisted "umeh-theme" value.
 */
let stored: string | null = null;

beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "umeh-theme" ? stored : null),
    setItem: (key: string, value: string) => {
      if (key === "umeh-theme") stored = value;
    },
    removeItem: () => {
      stored = null;
    },
    clear: () => {
      stored = null;
    },
    key: () => null,
    length: 0,
  } satisfies Partial<Storage>);

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  stored = null;
});

describe("ThemeOptions", () => {
  it("renders the two modes and marks the active one", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });
    const view = render(React.createElement(ThemeOptions));

    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Light", "Dark"]);
    expect(buttons[1].getAttribute("aria-checked")).toBe("true");
    expect(buttons[0].getAttribute("aria-checked")).toBe("false");

    const group = view.container.querySelector("[role='radiogroup']");
    expect(group).toBeTruthy();
    expect(group?.getAttribute("aria-label")).toBe("Theme");
    expect(group?.querySelectorAll("[role='radio']")).toHaveLength(2);
  });

  it("marks the resolved theme while the preference is still following the system", () => {
    useThemeMock.mockReturnValue({ theme: "system", resolvedTheme: "dark", setTheme });
    const view = render(React.createElement(ThemeOptions));

    const buttons = [...view.container.querySelectorAll("button")];
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

    expect(html).toContain("h-5 w-5");
    expect(html).not.toContain("lucide-sun");
    expect(html).not.toContain("lucide-moon");
    expect(html).not.toContain("lucide-monitor");
  });

  it("renders a single toggle button with no dropdown", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });

    const view = render(React.createElement(ThemeToggle));

    expect(view.container.querySelector("[aria-label='Switch to light theme']")).toBeTruthy();
    // 下拉菜单已移除：不再有 trigger/menu 角色与 portal 内容
    expect(view.container.querySelector("[aria-haspopup]")).toBeNull();
    expect(document.querySelector("[role='menu']")).toBeNull();
    expect(document.querySelector("[role='menuitem']")).toBeNull();
  });

  it("clicking while dark switches to light exactly once", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });

    const view = render(React.createElement(ThemeToggle));
    fireEvent.click(view.container.querySelector("[aria-label='Switch to light theme']")!);

    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("clicking while light switches to dark exactly once", () => {
    useThemeMock.mockReturnValue({ theme: "light", resolvedTheme: "light", setTheme });

    const view = render(React.createElement(ThemeToggle));
    fireEvent.click(view.container.querySelector("[aria-label='Switch to dark theme']")!);

    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("shows the sun and follows the system while no explicit choice was made", () => {
    useThemeMock.mockReturnValue({ theme: "system", resolvedTheme: "light", setTheme });

    const view = render(React.createElement(ThemeToggle));

    expect(view.container.querySelector(".lucide-sun")).toBeTruthy();
    expect(view.container.querySelector("[aria-label='Switch to dark theme']")).toBeTruthy();
  });
});

describe("ThemeOptions hydration", () => {
  const PROVIDER_PROPS = {
    attribute: "class" as const,
    defaultTheme: "system",
    enableSystem: true,
    storageKey: "umeh-theme",
  };

  /**
   * A stored value matching neither option. On a real server,
   * next-themes' `isServer` flag is captured when the module loads and is true,
   * so `theme` is `undefined` there. jsdom defines `window`, so the provider in
   * this environment always resolves *some* theme; pointing it at an
   * unrecognised stored value is what makes the real component render the
   * server's markup (both rows unchecked). The resulting string is
   * byte-identical to the markup the same tree produces in a node environment
   * with no `window` at all.
   */
  const STORED_VALUE_MATCHING_NO_OPTION = "auto";

  async function realModules() {
    // The cases above need a controllable useTheme; this one must exercise the
    // genuine library, so the module mock is dropped and a fresh copy of the
    // component is imported (which is why it runs last in this file).
    vi.doUnmock("next-themes");
    vi.resetModules();
    const nextThemes = await import("next-themes");
    const component = await import("@/components/theme-toggle");
    // If the mock were still in effect the assertions below could pass for the
    // wrong reason, so prove the library is the real one.
    expect(nextThemes.useTheme).not.toBe(useThemeMock);
    return {
      ThemeProvider: nextThemes.ThemeProvider,
      RealThemeOptions: component.ThemeOptions,
    };
  }

  it("hydrates server markup that has no theme without a mismatch", async () => {
    const { ThemeProvider, RealThemeOptions } = await realModules();
    const tree = () =>
      React.createElement(
        ThemeProvider,
        PROVIDER_PROPS,
        React.createElement(RealThemeOptions),
      );

    // 1. The server's markup: the provider cannot resolve a theme, so nothing is checked.
    stored = STORED_VALUE_MATCHING_NO_OPTION;
    const serverHtml = renderToStaticMarkup(tree());
    // A first-time visitor: the client follows the system, which jsdom reports as light.
    stored = null;

    expect(serverHtml.match(/aria-checked="false"/g)).toHaveLength(2);
    expect(serverHtml).not.toContain('aria-checked="true"');

    // 2. Hydrate that exact markup with the real provider.
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const recoverableErrors: string[] = [];
    const consoleErrors: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleErrors.push(args.map(String).join(" "));
    });

    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      act(() => {
        root = hydrateRoot(container, tree(), {
          onRecoverableError: (error) => recoverableErrors.push(String(error)),
        });
      });
    } finally {
      consoleError.mockRestore();
    }

    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    // 3. Only after mount does the real active row light up.
    const radios = [...container.querySelectorAll("[aria-checked]")];
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(radios[0].textContent).toBe("Light");

    act(() => root?.unmount());
  });
});
