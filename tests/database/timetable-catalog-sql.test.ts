import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921_timetable_catalog_rpc.sql"),
  "utf8",
);

describe("timetable catalog RPC migration", () => {
  it("defines both search functions as security invoker", () => {
    expect(sql).toContain("create or replace function public.search_planner_courses");
    expect(sql).toContain("create or replace function public.search_planner_instructors");
    expect(sql.match(/security invoker/g)?.length).toBe(2);
  });

  it("applies faculty and department filters plus pagination", () => {
    expect(sql).toContain('c."Offering_Unit"');
    expect(sql).toContain('c."Offering_Department"');
    expect(sql).toContain("limit greatest(page_limit, 1)");
    expect(sql).toContain("offset greatest(page_offset, 0)");
    expect(sql).toContain("count(*) over() as total_count");
  });
});
