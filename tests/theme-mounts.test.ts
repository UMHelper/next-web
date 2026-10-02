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
});
