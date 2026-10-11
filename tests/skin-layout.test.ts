import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("root layout skin wiring", () => {
  const layout = read("app/layout.tsx");

  it("loads the island token sheet after globals.css", () => {
    const globals = layout.indexOf("'./globals.css'");
    const island = layout.indexOf("'./skins/island.css'");
    expect(globals).toBeGreaterThanOrEqual(0);
    expect(island).toBeGreaterThan(globals);
  });

  it("runs the blocking init script inside <head>", () => {
    const head = layout.indexOf("<head>");
    const script = layout.indexOf("__html: SKIN_INIT_SCRIPT");
    const headClose = layout.indexOf("</head>");
    expect(layout).toMatch(/<script\s+dangerouslySetInnerHTML=\{\{\s*__html:\s*SKIN_INIT_SCRIPT\s*\}\}\s*\/>/);
    expect(script).toBeGreaterThan(head);
    expect(layout.lastIndexOf("SKIN_INIT_SCRIPT")).toBeLessThan(headClose);
  });

  it("puts the Nunito variable on <html> without preloading it", () => {
    expect(layout).toMatch(/Nunito\(\{[^}]*preload:\s*false[^}]*\}\)/s);
    expect(layout).toContain("variable: '--font-nunito'");
    expect(layout).toMatch(/<html[^>]*className=\{nunito\.variable\}/);
  });

  it("mounts the clip path defs and the controller inside the theme provider", () => {
    const open = layout.indexOf("<ThemeProvider>");
    const close = layout.indexOf("</ThemeProvider>");
    const controller = layout.indexOf("<SkinController />");
    expect(layout).toContain("<SkinDefs />");
    expect(controller).toBeGreaterThan(open);
    expect(controller).toBeLessThan(close);
    const island = layout.indexOf("<IslandLayer />");
    expect(island).toBeGreaterThan(controller);
    expect(island).toBeLessThan(close);
  });

  it("keeps lib/skin.ts importable from server components", () => {
    const skin = read("lib/skin.ts");
    expect(skin).not.toMatch(/["']use client["']/);
    expect(skin).not.toMatch(/from ["'](react|next\/[^"']+)["']/);
  });
});
