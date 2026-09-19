import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UM Open Data token", () => {
  it("is not hardcoded in get-course-info.ts", () => {
    const source = readFileSync(join(process.cwd(), "lib/database/get-course-info.ts"), "utf8");
    expect(source).not.toContain("f5aaa86cc5b4424aa621538fceaab34f");
    expect(source).toContain("UM_OPEN_DATA_TOKEN");
  });
});
