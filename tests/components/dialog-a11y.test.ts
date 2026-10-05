import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_ROOT = path.join(process.cwd(), "components");

function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listTsxFiles(full));
    else if (entry.endsWith(".tsx")) files.push(full);
  }
  return files;
}

/**
 * Radix logs a dev-time console error when a `DialogContent` has no `DialogTitle`,
 * and a warning when it has neither a `DialogDescription` nor an explicit
 * `aria-describedby={undefined}`. This contract keeps both out of the console.
 */
describe("dialog accessibility contract", () => {
  const files = listTsxFiles(COMPONENTS_ROOT).filter((file) =>
    readFileSync(file, "utf8").includes("<DialogContent"),
  );

  it("finds dialog components", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s gives every DialogContent a title and description semantics", (file) => {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(process.cwd(), file);
    const contentCount = (source.match(/<DialogContent\b/g) ?? []).length;
    const titleCount = (source.match(/<DialogTitle/g) ?? []).length;

    expect(
      titleCount,
      `${relative}: ${contentCount} <DialogContent> but ${titleCount} <DialogTitle>`,
    ).toBeGreaterThanOrEqual(contentCount);

    const hasDescriptionSemantics =
      source.includes("<DialogDescription") || source.includes("aria-describedby");
    expect(
      hasDescriptionSemantics,
      `${relative}: add a <DialogDescription> or aria-describedby={undefined} to silence the Radix description warning`,
    ).toBe(true);
  });
});
