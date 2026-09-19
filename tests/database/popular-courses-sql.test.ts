import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("homepage statistics migration", () => {
  it("defines the popular courses RPC and index", () => {
    const sql = readFileSync("supabase/migrations/20260919_homepage_statistics.sql", "utf8");

    expect(sql).toContain("create index if not exists comment_recent_visible_idx");
    expect(sql).toContain("create or replace function public.get_popular_courses");
    expect(sql).toContain("order by");
    expect(sql).toContain("grant execute on function public.get_popular_courses(integer, integer)");
  });
});
