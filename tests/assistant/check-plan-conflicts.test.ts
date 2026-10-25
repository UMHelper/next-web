import { describe, expect, it, vi } from "vitest";

import {
  checkPlanConflicts,
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
  type CatalogSection,
} from "@/lib/assistant/check-plan-conflicts";
import { normalizePlanSection } from "@/lib/timetable/schema";

const plan = [
  normalizePlanSection({
    code: "EDUC1001",
    prof: "CHAN TAI MAN",
    section: "001",
    schedules: [
      { date: "MON", time: "09:00-10:15", location: "E22-1001" },
      { date: "WED", time: "09:00-10:15", location: "E22-1001" },
    ],
  }),
  normalizePlanSection({
    code: "MATH1000",
    prof: "WONG",
    section: "002",
    schedules: [{ date: "MON", time: "10:00-11:00", location: "" }],
  }),
];

const sections: CatalogSection[] = [
  { section: "001", schedules: [{ date: "TUE", time: "10:00-11:15", location: "" }] },
  { section: "002", schedules: [{ date: "MON", time: "08:00-09:00", location: "" }] },
  { section: "003", schedules: [{ date: "MON", time: "09:30-10:30", location: "" }] },
  {
    section: "004",
    schedules: [
      { date: "MON", time: "09:00-09:30", location: "" },
      { date: "WED", time: "09:00-09:30", location: "" },
    ],
  },
];

const input = (section: string) => ({ code: "econ1001", instructor: "LEE", section });

describe("checkPlanConflicts", () => {
  it("returns no conflicts for a free slot", () => {
    expect(checkPlanConflicts(plan, input("001"), sections)).toEqual({ found: true, conflicts: [] });
  });

  it("does not count end-to-start as a conflict", () => {
    expect(checkPlanConflicts(plan, input("002"), sections)).toEqual({ found: true, conflicts: [] });
  });

  it("reports every plan section that overlaps", () => {
    expect(checkPlanConflicts(plan, input("003"), sections)).toEqual({
      found: true,
      conflicts: [
        { with: "EDUC1001-001", day: "MON" },
        { with: "MATH1000-002", day: "MON" },
      ],
    });
  });

  it("reports a clash once per day", () => {
    expect(checkPlanConflicts(plan, input("004"), sections)).toEqual({
      found: true,
      conflicts: [
        { with: "EDUC1001-001", day: "MON" },
        { with: "EDUC1001-001", day: "WED" },
      ],
    });
  });

  it("ignores other sections of the same course, whatever their stored case", () => {
    const withSameCourse = [
      ...plan,
      {
        ...normalizePlanSection({
          code: "ECON1001",
          prof: "LEE",
          section: "009",
          schedules: [{ date: "TUE", time: "10:00-11:00", location: "" }],
        }),
        courseCode: "econ1001",
      },
    ];
    expect(checkPlanConflicts(withSameCourse, input("001"), sections)).toEqual({
      found: true,
      conflicts: [],
    });
  });

  it("matches the section id ignoring case and surrounding spaces", () => {
    const lettered: CatalogSection[] = [
      { section: "D01", schedules: [{ date: "TUE", time: "10:00-11:00", location: "" }] },
    ];
    expect(checkPlanConflicts(plan, input(" d01 "), lettered)).toEqual({ found: true, conflicts: [] });
  });

  it("returns found false when the section does not exist", () => {
    expect(checkPlanConflicts(plan, input("099"), sections)).toEqual({ found: false });
  });
});

describe("runCheckPlanConflicts", () => {
  it("loads the sections for the asked course and instructor", async () => {
    const loadSections = vi.fn(async () => ({ sections }));
    await expect(runCheckPlanConflicts(plan, input("001"), loadSections)).resolves.toEqual({
      found: true,
      conflicts: [],
    });
    expect(loadSections).toHaveBeenCalledWith("econ1001", "LEE");
  });

  it("reports a failed request instead of throwing", async () => {
    const loadSections = vi.fn(async () => {
      throw new Error("HTTP 401");
    });
    await expect(runCheckPlanConflicts(plan, input("001"), loadSections)).resolves.toEqual({
      found: false,
      error: "request_failed",
    });
  });
});

describe("checkPlanConflictsParameters", () => {
  it("requires code, instructor and section", () => {
    expect(checkPlanConflictsParameters.safeParse({ code: "ECON1001", instructor: "LEE" }).success).toBe(false);
    expect(
      checkPlanConflictsParameters.safeParse({ code: "ECON1001", instructor: "LEE", section: "001" }).success,
    ).toBe(true);
  });
});
