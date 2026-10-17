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
    expect(summarizePlan(undefined)).toBe("当前没有课表方案");
  });

  it("says so when the plan is empty", () => {
    expect(summarizePlan(plan([]))).toBe("学期 2026/1，方案「我的课表」，还没有加入任何课");
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
        "学期 2026/1，方案「我的课表」，共 2 门：",
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
    expect(summary.split("\n")[0]).toBe("学期 2026/1，方案「我的课表」，共 1 门：");
  });

  it("marks sections without meeting times", () => {
    expect(summarizePlan(plan([section("THES4000", "001", [])]))).toContain(
      "THES4000-001 (CHAN TAI MAN) 无上课时间",
    );
  });

  it("lists at most 30 sections", () => {
    const sections = Array.from({ length: 32 }, (_, index) =>
      section(`CRS${1000 + index}`, "001", [{ date: "MON", time: "09:00-10:00", location: "" }]),
    );
    const lines = summarizePlan(plan(sections)).split("\n");
    expect(lines).toHaveLength(32);
    expect(lines[31]).toBe("……另有 2 个 section 未列出");
  });
});
