import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("global assistant mount", () => {
  it("mounts the launcher once in the root layout, inside the planner provider", () => {
    const layout = read("app/layout.tsx");
    const open = layout.indexOf("<TimetablePlannerProvider>");
    const launcher = layout.indexOf("<AssistantLauncher />");
    const close = layout.indexOf("</TimetablePlannerProvider>");
    expect(launcher).toBeGreaterThan(open);
    expect(launcher).toBeLessThan(close);
    expect(layout.indexOf("<AssistantLauncher", launcher + 1)).toBe(-1);
  });

  it("is not mounted anywhere else under app/", () => {
    const others = sourceFiles("app").filter(
      (path) => path !== "app/layout.tsx" && read(path).includes("assistant-launcher"),
    );
    expect(others).toEqual([]);
  });
});
