import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/skins/island.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("island.css rules", () => {
  it("scopes every selector under html[data-skin=\"island\"] so the default skin is untouched", () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => !s.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(2);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        expect(part.trim().startsWith('html[data-skin="island"]'), part).toBe(true);
      }
    }
  });

  it("presses the 3D button by moving it and shrinking the depth shadow", () => {
    expect(css).toMatch(/\.btn-depth:active[^{]*\{[^}]*translateY\(3px\)/);
    expect(css).toMatch(/\.btn-depth:active[^{]*\{[^}]*--shadow-button:\s*0 1px 0 0 hsl\(var\(--button-depth\)\)/);
  });

  it("clips the dialog to the blob and keeps a rounded fallback", () => {
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*clip-path:\s*url\(#island-modal-clip\)/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*border-radius:\s*24px/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*padding:\s*40px 35px 32px/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*box-shadow:\s*none/);
  });

  it("moves the dialog close button clear of the blob's narrow corner", () => {
    expect(css).toMatch(/\.skin-close\s*\{[^}]*right:\s*28px[^}]*top:\s*24px/);
  });

  it("sets the body font to Nunito plus a Traditional Chinese system stack", () => {
    expect(css).toMatch(/html\[data-skin="island"\] body\s*\{[^}]*font-family:\s*var\(--font-nunito\)/);
    expect(css).not.toMatch(/Noto Sans SC/i);
  });
});
