import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_timetable_hardening.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("timetable hardening migration", () => {
  it("normalizes existing values", () => {
    expect(sql).toContain("set date = upper(btrim(date))");
    expect(sql).toContain("replace(btrim(times), ' ', '')");
    expect(sql).toContain("set location = btrim(location)");
    expect(sql).toContain("set section = btrim(section)");
  });

  it("dedupes before adding unique indexes", () => {
    expect(sql).toContain("tmp_time_location_dedupe");
    expect(sql).toContain("tmp_offer_dedupe");
    expect(sql).toContain("tmp_schedule_dedupe");
    expect(sql.indexOf("tmp_time_location_dedupe")).toBeLessThan(sql.indexOf("time_location_slot_unique_idx"));
    expect(sql.indexOf("tmp_offer_dedupe")).toBeLessThan(sql.indexOf("offer_section_unique_idx"));
  });

  it("creates the three unique indexes", () => {
    expect(sql).toContain("unique index if not exists time_location_slot_unique_idx");
    expect(sql).toContain("unique index if not exists offer_section_unique_idx");
    expect(sql).toContain("unique index if not exists schedule_unique_idx");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("time_location_slot_unique_idx");
    expect(snapshot).toContain("offer_section_unique_idx");
    expect(snapshot).toContain("schedule_unique_idx");
  });
});
