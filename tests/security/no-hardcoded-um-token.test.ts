import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UM Open Data token", () => {
  it("is not hardcoded and is not part of the page read path", () => {
    const source = readFileSync(join(process.cwd(), "lib/database/get-course-info.ts"), "utf8");
    const syncSource = readFileSync(join(process.cwd(), "scripts/sync-um.mjs"), "utf8");

    expect(source).not.toContain("f5aaa86cc5b4424aa621538fceaab34f");
    expect(source).not.toContain("api.data.um.edu.mo");
    expect(syncSource).toContain("UM_OPEN_DATA_TOKEN");
    expect(syncSource).toContain("api.data.um.edu.mo");
  });
});
