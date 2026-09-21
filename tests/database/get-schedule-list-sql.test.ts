import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_get_schedule_list.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("get_schedule_list rewrite", () => {
  it("drops the old two-arg signature and defines the four-arg one", () => {
    expect(sql).toContain("drop function if exists public.get_schedule_list(text, text)");
    expect(sql).toContain("target_year integer");
    expect(sql).toContain("target_sem integer");
    expect(sql).toContain("where o.year = target_year and o.sem = target_sem");
  });

  it("grants only service_role and reloads the schema cache", () => {
    expect(sql).toContain("grant execute on function public.get_schedule_list(text, text, integer, integer) to service_role");
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("target_year integer");
  });
});
