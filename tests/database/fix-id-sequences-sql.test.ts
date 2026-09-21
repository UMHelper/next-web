import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_fix_id_sequences.sql", "utf8");

describe("fix id sequences migration", () => {
  it("re-syncs the four identity sequences used by the update pipeline", () => {
    for (const seq of ["time_location", "prof_with_course", "offer", "schedule"]) {
      expect(sql).toContain(`setval('public.${seq}_id_seq'`);
    }
  });

  it("sets the next value to max(id) + 1", () => {
    expect(sql).toContain("coalesce((select max(id) from public.time_location), 0) + 1, false");
    expect(sql).toContain("coalesce((select max(id) from public.prof_with_course), 0) + 1, false");
    expect(sql).toContain("coalesce((select max(id) from public.offer), 0) + 1, false");
    expect(sql).toContain("coalesce((select max(id) from public.schedule), 0) + 1, false");
  });
});
