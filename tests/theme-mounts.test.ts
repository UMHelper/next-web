import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("theme entry mounts", () => {
  it("mounts the toggle in the navbar", () => {
    const navbar = read("components/navbar.tsx");
    expect(navbar).toContain('from "@/components/theme-toggle"');
    expect(navbar).toContain("<ThemeToggle />");
  });

  it("mounts the three theme options in the mobile sidebar", () => {
    const sidebar = read("components/mobile-sidebar.tsx");
    expect(sidebar).toContain('from "@/components/theme-toggle"');
    expect(sidebar).toContain("<ThemeOptions />");
  });

  // 这个组件原本 import 了 useTheme 却从不调用，<Sonner> 因此一直用默认的
  // theme="light"：richColors 的 success/error/warning/info 在深色下仍是浅色配色。
  // 未使用的 import 不会被 lint / tsc 拦下，所以用源码契约锁住"确实传了 theme"。
  it("wires the resolved theme into the sonner toaster", () => {
    const sonner = read("components/ui/sonner.tsx");
    expect(sonner).toContain("useTheme()");
    expect(sonner).toMatch(/theme=\{resolvedTheme as ToasterProps\["theme"\]\}/);
  });
});
