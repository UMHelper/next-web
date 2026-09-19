import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components", "lib"];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("bbs-updates cleanup", () => {
  it("has no source references to the removed module", () => {
    const source = ROOTS.flatMap(collectFiles)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toContain("bbs-updates");
    expect(source).not.toContain("BBSAd");
  });
});
