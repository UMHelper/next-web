import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const UI_FILES = [
  "button", "input", "textarea", "card", "dialog", "sheet",
  "select", "popover", "tooltip", "hover-card", "dropdown-menu",
];

describe("default skin parity", () => {
  const css = read("app/globals.css");

  it("structural tokens default to the legacy radii and a zero shadow", () => {
    expect(css).toMatch(/--radius-control:\s*calc\(var\(--radius\) - 2px\);/);
    expect(css).toMatch(/--radius-float:\s*calc\(var\(--radius\) - 2px\);/);
    expect(css).toMatch(/--radius-card:\s*var\(--radius\);/);
    expect(css).toMatch(/--radius-item:\s*calc\(var\(--radius\) - 4px\);/);
    expect(css).toMatch(/--shadow-button:\s*0 0 #0000;/);
  });

  it("tailwind maps the semantic radius and shadow classes to the tokens", () => {
    const cfg = read("tailwind.config.js");
    for (const k of ["control", "float", "card", "item"]) {
      expect(cfg).toContain(`${k}: "var(--radius-${k})"`);
    }
    expect(cfg).toContain('button: "var(--shadow-button)"');
  });

  it("ui primitives use semantic radius classes instead of sm/md/lg", () => {
    const all = UI_FILES.map((f) => read(`components/ui/${f}.tsx`)).join("\n");
    expect(count(all, /\brounded-control\b/g)).toBe(6);
    expect(count(all, /\brounded-float\b/g)).toBe(7);
    expect(count(all, /\brounded-item\b/g)).toBe(7);
    expect(count(all, /\brounded-card\b/g)).toBe(3);
    expect(count(all, /(?<![-\w])rounded-(sm|md|lg)\b/g)).toBe(0);
  });

  it("only default and destructive buttons get the depth shadow; dialogs opt into the blob", () => {
    expect(count(read("components/ui/button.tsx"), /shadow-button btn-depth/g)).toBe(2);
    expect(count(read("components/ui/dialog.tsx"), /\bskin-modal\b/g)).toBe(2);
  });
});
