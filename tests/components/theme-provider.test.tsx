import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { providerProps } = vi.hoisted(() => ({ providerProps: vi.fn() }));

// vi.mock 的工厂会被提升到所有 import 之前执行，此时 `React` 还没初始化，
// 因此工厂内必须动态 import react（与 tests/components/admin-entry.test.tsx 的写法一致），
// 否则会报 "ReferenceError: React is not defined"。
vi.mock("next-themes", async () => {
  const ReactModule = await import("react");
  return {
    ThemeProvider: (props: Record<string, unknown>) => {
      providerProps(props);
      return ReactModule.createElement("div", null, props.children as React.ReactNode);
    },
  };
});

import { ThemeProvider } from "@/components/providers/theme-provider";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeProvider", () => {
  it("drives the class attribute with the agreed defaults", () => {
    render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement("span", { "data-testid": "child" }, "child"),
      ),
    );

    const props = providerProps.mock.calls[0][0];
    expect(props.attribute).toBe("class");
    expect(props.defaultTheme).toBe("system");
    expect(props.enableSystem).toBe(true);
    expect(props.disableTransitionOnChange).toBe(true);
    expect(props.storageKey).toBe("umeh-theme");
  });

  it("renders its children", () => {
    const view = render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement("span", { "data-testid": "child" }, "child"),
      ),
    );

    expect(view.container.querySelector("[data-testid='child']")?.textContent).toBe("child");
  });

  it("marks <html> for hydration-safe theme scripting", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
  });
});
