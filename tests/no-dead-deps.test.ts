import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("phase 2c cleanup", () => {
  it("does not keep confirmed dead dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const name of [
      "axios",
      "embla-carousel-react",
      "motion",
      "framer-motion",
      "@radix-ui/themes",
      "three",
      "hastscript",
    ]) {
      expect(deps[name]).toBeUndefined();
    }
  });

  it("does not keep the removed SparklesText component", () => {
    expect(existsSync(join(process.cwd(), "components/magicui/sparkles-text.tsx"))).toBe(false);
  });
});
