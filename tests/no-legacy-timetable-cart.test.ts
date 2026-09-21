import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components", "lib"];

const collectFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });

describe("legacy timetable cart cleanup", () => {
  it("removes the old cart component and imports", () => {
    expect(existsSync(join(process.cwd(), "components/timetable-cart.tsx"))).toBe(false);
    const source = ROOTS.flatMap(collectFiles)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toContain("TimetableCart");
  });
});
