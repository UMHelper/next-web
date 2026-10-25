import { describe, expect, it } from "vitest";

import { summarizePlan } from "@/lib/assistant/plan-summary";
import { normalizePlanSection, type PlanSection } from "@/lib/timetable/schema";
import type { LocalPlan } from "@/lib/timetable/store";

const plan = (sections: PlanSection[]): LocalPlan => ({
  clientRef: "plan-1",
  name: "我的课表",
  year: 2026,
  sem: 1,
  payload: { schemaVersion: 1, sections },
  revision: 1,
  syncState: "idle",
});

const section = (code: string, sectionId: string, schedules: unknown[]) =>
  normalizePlanSection({ code, prof: "CHAN TAI MAN", section: sectionId, schedules });

describe("summarizePlan", () => {
  it("says so when there is no plan", () => {
    expect(summarizePlan(undefined)).toBe("No timetable plan");
  });

  it("says so when the plan is empty", () => {
    expect(summarizePlan(plan([]))).toBe('Term 2026/1, plan "我的课表", no courses added yet');
  });

  it("lists one line per section", () => {
    const summary = summarizePlan(
      plan([
        section("EDUC1001", "002", [
          { date: "MON", time: "09:00-10:15", location: "E22-1001" },
          { date: "WED", time: "09:00-10:15", location: "E22-1001" },
        ]),
        section("MATH1000", "001", [{ date: "TUE", time: "14:00-15:15", location: "" }]),
      ]),
    );
    expect(summary).toBe(
      [
        'Term 2026/1, plan "我的课表", 2 courses:',
        "EDUC1001-002 (CHAN TAI MAN) MON 09:00-10:15, WED 09:00-10:15",
        "MATH1000-001 (CHAN TAI MAN) TUE 14:00-15:15",
      ].join("\n"),
    );
  });

  it("counts courses, not sections", () => {
    const summary = summarizePlan(
      plan([
        section("EDUC1001", "002", [{ date: "MON", time: "09:00-10:15", location: "" }]),
        section("EDUC1001", "003", [{ date: "FRI", time: "09:00-10:15", location: "" }]),
      ]),
    );
    expect(summary.split("\n")[0]).toBe('Term 2026/1, plan "我的课表", 1 course:');
  });

  it("marks sections without meeting times", () => {
    expect(summarizePlan(plan([section("THES4000", "001", [])]))).toContain(
      "THES4000-001 (CHAN TAI MAN) no meeting times",
    );
  });

  it("lists at most 30 sections", () => {
    const sections = Array.from({ length: 32 }, (_, index) =>
      section(`CRS${1000 + index}`, "001", [{ date: "MON", time: "09:00-10:00", location: "" }]),
    );
    const lines = summarizePlan(plan(sections)).split("\n");
    expect(lines).toHaveLength(32);
    expect(lines[31]).toBe("…and 2 more sections not listed");
  });
});
