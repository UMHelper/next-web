import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const island = readFileSync(join(root, "app/skins/island.css"), "utf8");
const globals = readFileSync(join(root, "app/globals.css"), "utf8");

function blockOf(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function tokensOf(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function rgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.split(/\s+/).map(parseFloat);
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const sector: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, b] = sector[Math.min(5, Math.floor(h / 60))];
  return [r + m, g + m, b + m];
}

function luminance(triple: string): number {
  const [r, g, b] = rgb(triple).map((k) =>
    k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "0 0% 100%";
const LIGHT = tokensOf(blockOf(island, 'html[data-skin="island"]'));
const DARK = tokensOf(blockOf(island, 'html[data-skin="island"].dark'));
const BASE_KEYS = [...tokensOf(blockOf(globals, ":root")).keys()].filter(
  (k) =>
    !["--radius", "--radius-control", "--radius-float", "--radius-card", "--radius-item", "--shadow-button"].includes(k),
);

const TEXT_PAIRS: [string, string][] = [
  ["--foreground", "--background"], ["--foreground", "--card"],
  ["--foreground", "--secondary"], ["--foreground", "--accent"],
  ["--card-foreground", "--card"], ["--popover-foreground", "--popover"],
  ["--secondary-foreground", "--secondary"], ["--accent-foreground", "--accent"],
  ["--muted-foreground", "--background"], ["--muted-foreground", "--card"],
  ["--muted-foreground", "--muted"], ["--muted-foreground", "--accent"],
  ["--primary-foreground", "--primary"],
  ["--destructive-foreground", "--destructive"],
  ["--destructive-strong", "--background"], ["--destructive-strong", "--card"],
  ["--brand", "--background"], ["--brand", "--card"],
  ["--brand-strong", "--background"], ["--brand-strong", "--card"],
  ["--brand-foreground", "--brand"],
  ["--success", "--background"], ["--success", "--card"],
  ["--warning", "--background"], ["--warning", "--card"],
  ["--wordmark-to", "--background"],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ["--subtle-foreground", "--background"], ["--subtle-foreground", "--card"],
  ["--ring", "--background"], ["--ring", "--card"],
  ["--brand-logo", "--background"],
  ["--grade-none-from", "--background"], ["--grade-none-to", "--background"],
  ["--grade-low-from", "--background"], ["--grade-low-to", "--background"],
  ["--grade-mid-from", "--background"], ["--grade-mid-to", "--background"],
  ["--grade-high-from", "--background"], ["--grade-high-to", "--background"],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
] as const)("island %s tokens", (_name, tokens) => {
  it("defines every color variable that :root defines", () => {
    const missing = BASE_KEYS.filter((k) => !tokens.has(k));
    expect(missing).toEqual([]);
  });

  it("keeps text pairs at >= 4.5:1", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      if (fg === "--brand-foreground" && _name === "dark") continue;
      expect(ratio(tokens.get(fg)!, tokens.get(bg)!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps subtle / ring / grade / logo pairs at >= 3:1", () => {
    for (const [fg, bg] of NON_TEXT_PAIRS) {
      expect(ratio(tokens.get(fg)!, tokens.get(bg)!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps literal white readable on the brand gradient ends", () => {
    for (const key of ["--brand-from", "--brand-to"]) {
      expect(ratio(WHITE, tokens.get(key)!), key).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("island structural tokens", () => {
  it("declares the pill / float / card / item radii and the button depth", () => {
    expect(LIGHT.get("--radius-control")).toBe("50px");
    expect(LIGHT.get("--radius-float")).toBe("16px");
    expect(LIGHT.get("--radius-card")).toBe("18px");
    expect(LIGHT.get("--radius-item")).toBe("12px");
    expect(LIGHT.get("--shadow-button")).toBe("0 4px 0 0 hsl(var(--button-depth))");
    expect(LIGHT.get("--button-depth")).toBe("172 42.9% 52%");
    expect(DARK.get("--button-depth")).toBe("174.1 64.4% 34.1%");
  });

  it("overrides the library font stack with !important and no Noto Sans SC", () => {
    expect(island).toMatch(/--animal-font-family:[^;]*var\(--font-nunito\)[^;]*!important;/);
    expect(island).not.toMatch(/Noto Sans SC/i);
  });
});
