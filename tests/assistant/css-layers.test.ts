import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import tailwindcss from "tailwindcss";
import type { Config } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

const tailwindConfig = createRequire(import.meta.url)(
  join(process.cwd(), "tailwind.config.js"),
) as Config;

function layerOf(rule: Rule): string | null {
  for (let node = rule.parent as postcss.Node | undefined; node; node = node.parent as postcss.Node | undefined) {
    if (node.type === "atrule" && (node as AtRule).name === "layer") return (node as AtRule).params;
  }
  return null;
}

function findRule(root: postcss.Root, match: (rule: Rule) => boolean): Rule {
  let found: Rule | undefined;
  root.walkRules((rule) => {
    if (!found && match(rule)) found = rule;
  });
  if (!found) throw new Error("rule not found");
  return found;
}

/**
 * The site preflight lives in a cascade layer so third-party CSS cannot be reset by it. Keep that
 * contract: an unlayered preflight would also beat every utility the assistant loads.
 */
describe("site CSS cascade layers", () => {
  let root: postcss.Root;

  beforeAll(async () => {
    const from = join(process.cwd(), "app/globals.css");
    const result = await postcss([tailwindcss({ ...tailwindConfig, content: [{ raw: "", extension: "html" }] })]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    root = postcss.parse(result.css);
  }, 30_000);

  it("keeps the Tailwind preflight inside a cascade layer", () => {
    const transformDefaults = findRule(root, (rule) =>
      rule.some((decl) => decl.type === "decl" && decl.prop === "--tw-translate-x"),
    );
    const buttonReset = findRule(root, (rule) => rule.selector.startsWith("button,"));
    expect(layerOf(transformDefaults)).toBe("site-base");
    expect(layerOf(buttonReset)).toBe("site-base");
  });

  it("keeps the site's color tokens defined", () => {
    const rootTokens = findRule(root, (rule) => rule.selector === ":root" && rule.toString().includes("--background:"));
    expect(rootTokens).toBeTruthy();
  });
});
