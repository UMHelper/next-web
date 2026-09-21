import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921_timetable_plan.sql"),
  "utf8",
);

describe("timetable_plan migration", () => {
  it("creates the table with constraints and indexes", () => {
    expect(sql).toContain("create table public.timetable_plan");
    expect(sql).toContain("timetable_plan_owner_client_ref_key unique");
    expect(sql).toContain("timetable_plan_share_token_key unique");
    expect(sql).toContain("timetable_plan_owner_term_updated_idx");
  });

  it("enables RLS and grants service_role", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      "revoke all on public.timetable_plan from anon, authenticated",
    );
    expect(sql).toContain("grant all on public.timetable_plan to service_role");
  });
});
