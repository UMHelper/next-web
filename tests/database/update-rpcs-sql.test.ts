import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_update_rpcs.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("update pipeline RPCs", () => {
  it("defines all five functions as security definer", () => {
    for (const fn of [
      "admin_reset_offered()",
      "admin_resolve_known_codes(codes text[])",
      "admin_mark_offered(codes text[])",
      "admin_upsert_offered_courses(payload jsonb)",
      "admin_apply_schedule(payload jsonb, scope text)",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect((sql.match(/security definer/g) ?? []).length).toBe(5);
  });

  it("uses the hardened unique indexes for idempotent writes", () => {
    expect(sql).toContain("on conflict (\"New_code\") do update set \"Is_Offered\" = 1");
    expect(sql).toContain("on conflict (course_id, prof_id) do update set is_offered = 1");
    expect(sql).toContain("on conflict (date, times, location) do nothing");
    expect(sql).toContain("on conflict (course_id, section, year, sem) do nothing");
    expect(sql).toContain("on conflict (course_id, time_location_id) do nothing");
  });

  it("grants execute to service_role and reloads the schema cache", () => {
    expect(sql).toContain("grant execute on function public.admin_apply_schedule(jsonb, text) to service_role");
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("admin_apply_schedule");
  });
});
