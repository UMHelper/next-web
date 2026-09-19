import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("homepage statistics integration", () => {
  it("uses HomeStatistics instead of CommentBank", () => {
    const source = readFileSync("app/page.tsx", "utf8");

    expect(source).toContain('import HomeStatistics from "@/components/home-statistics";');
    expect(source).not.toContain("CommentBank");
  });
});
