import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260921_app_config.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("app_config migration", () => {
  it("creates the single-row config table", () => {
    expect(migration).toContain("create table if not exists public.app_config");
    expect(migration).toContain("check (id = 1)");
    expect(migration).toContain("check (current_sem in (1, 2))");
    expect(migration).toContain("database_last_update date");
  });

  it("seeds a default row and grants only service_role", () => {
    expect(migration).toContain("values (1, 2026, 1, true, current_date)");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("grant select, insert, update on table public.app_config to service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("public.app_config");
  });
});
