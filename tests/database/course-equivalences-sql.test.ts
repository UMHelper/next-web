import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261024_course_equivalences.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("course equivalence migration", () => {
  it("creates the equivalence table with a flat primary/equivalent pair", () => {
    expect(sql).toContain("create table if not exists public.course_equivalences");
    expect(sql).toMatch(/primary_code\s+text not null references public\.course_noporf\("New_code"\)/);
    expect(sql).toMatch(/equivalent_code\s+text not null references public\.course_noporf\("New_code"\)/);
    expect(sql).toContain("unique (primary_code, equivalent_code)");
    expect(sql).toContain("check (primary_code <> equivalent_code)");
  });

  it("guards against chains and exposes a primary-only catalog view", () => {
    expect(sql).toContain("create or replace function public.course_equivalences_guard()");
    expect(sql).toContain("is already an equivalent code");
    expect(sql).toContain("is already a primary code");
    expect(sql).toContain("create or replace view public.course_catalog");
    expect(sql).toContain("equivalent_codes");
  });

  it("resolves old codes and searches aliases", () => {
    expect(sql).toContain("create or replace function public.resolve_course_code");
    expect(sql).toContain("create or replace function public.course_group_codes");
    expect(sql).toContain("returns setof public.course_catalog");
    expect(sql).toContain("from unnest(c.equivalent_codes) eq(code)");
  });

  it("keeps the baseline schema in sync", () => {
    expect(snapshot).toContain("create table if not exists public.course_equivalences");
    expect(snapshot).toContain("create or replace view public.course_catalog");
    expect(snapshot).toContain("admin_match_course_equivalences");
  });
});
