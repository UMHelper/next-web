import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));

vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { ThemeColorMeta } from "@/components/theme-color-meta";

function ensureMeta(): HTMLMetaElement {
  const existing = document.head.querySelector("meta[name='theme-color']");
  if (existing) return existing as HTMLMetaElement;
  const created = document.createElement("meta");
  created.setAttribute("name", "theme-color");
  document.head.appendChild(created);
  return created;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.head.querySelector("meta[name='theme-color']")?.remove();
});

describe("ThemeColorMeta", () => {
  it("uses the light surface color for light", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "light", resolvedTheme: "light" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#FFFFFF");
  });

  it("uses the dark background for dark", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#020817");
  });

  it("follows the system preference through resolvedTheme", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "system", resolvedTheme: "dark" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#020817");
  });

  it("survives a missing meta tag", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark" });

    expect(() => render(React.createElement(ThemeColorMeta))).not.toThrow();
  });

  // R9：ThemeProvider / ClerkProviderClient 的嵌套顺序没有任何自动化保护。
  // 如果把 </ThemeProvider> 提到 </ClerkProviderClient> 之前，所有既有测试与 tsc
  // 依然会通过，而两个 <Toaster /> 会静默退回到无 provider 的默认主题。
  // 这里用字符串下标断言真实的嵌套顺序（只断言 contains 抓不到顺序错误）。
  it("keeps the theme provider wrapping the Clerk provider so toasts inherit the theme", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    const themeOpen = layout.indexOf("<ThemeProvider>");
    const clerkOpen = layout.indexOf("<ClerkProviderClient>");
    const clerkClose = layout.indexOf("</ClerkProviderClient>");
    const themeClose = layout.indexOf("</ThemeProvider>");

    expect(themeOpen).toBeGreaterThanOrEqual(0);
    expect(clerkOpen).toBeGreaterThanOrEqual(0);
    expect(clerkClose).toBeGreaterThanOrEqual(0);
    expect(themeClose).toBeGreaterThanOrEqual(0);

    expect(themeOpen).toBeLessThan(clerkOpen);
    expect(clerkClose).toBeLessThan(themeClose);

    expect(layout).toMatch(/<html[^>]*lang="zh-Hant"/);
  });

  // 删掉 app/layout.tsx 里的 <ThemeColorMeta /> 时，其余测试全绿（theme-mounts 只查
  // navbar / mobile-sidebar），而深色状态栏色因此静默失效。补一条挂载断言：
  // 组件必须在 <ThemeProvider> 与 </ThemeProvider> 之间，不能只写在别处或被挪出 provider。
  it("mounts ThemeColorMeta inside the theme provider in the root layout", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    const themeOpen = layout.indexOf("<ThemeProvider>");
    const themeClose = layout.indexOf("</ThemeProvider>");
    const meta = layout.indexOf("<ThemeColorMeta />");

    expect(meta).toBeGreaterThanOrEqual(0);
    expect(themeOpen).toBeGreaterThanOrEqual(0);
    expect(themeClose).toBeGreaterThanOrEqual(0);
    expect(themeOpen).toBeLessThan(meta);
    expect(meta).toBeLessThan(themeClose);
  });
});
