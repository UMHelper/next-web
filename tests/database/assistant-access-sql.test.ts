import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261018_assistant_access.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("assistant access migration", () => {
  it("adds the mode column defaulting to off", () => {
    expect(migration).toContain("alter table public.app_config");
    expect(migration).toContain("add column if not exists ai_assistant_access text not null default 'off'");
    expect(migration).toContain("check (ai_assistant_access in ('off', 'testers', 'everyone'))");
  });

  it("creates the tester table with lowercase emails", () => {
    expect(migration).toContain("create table if not exists public.assistant_testers");
    expect(migration).toContain("email text primary key check (email = lower(email) and position('@' in email) > 1)");
    expect(migration).toContain("added_by text not null");
  });

  it("locks the tester table to service_role", () => {
    expect(migration).toContain("alter table public.assistant_testers enable row level security");
    expect(migration).toContain("revoke all on public.assistant_testers from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, delete on public.assistant_testers to service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("ai_assistant_access");
    expect(snapshot).toContain("create table if not exists public.assistant_testers");
  });
});
