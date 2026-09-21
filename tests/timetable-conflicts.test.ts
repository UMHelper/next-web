import { describe, expect, it } from "vitest";
import {
  detectScheduleConflicts,
  findSameCourseSections,
} from "@/lib/timetable/conflicts";
import type { PlanSection, Weekday } from "@/lib/timetable/schema";

const section = (
  key: string,
  code: string,
  date: Weekday,
  time: string,
): PlanSection => ({
  key,
  courseCode: code,
  prof: "P",
  section: key,
  color: "#000000",
  schedules: [{ date, time, location: "" }],
});

describe("timetable conflicts", () => {
  it("detects overlapping schedules on the same day", () => {
    const a = section("A", "ACCT1000", "MON", "09:00-10:30");
    const b = section("B", "CISC1000", "MON", "10:00-11:00");
    expect(detectScheduleConflicts([a, b])).toHaveLength(1);
  });

  it("does not report adjacent or different-day schedules", () => {
    const a = section("A", "ACCT1000", "MON", "09:00-10:00");
    const b = section("B", "CISC1000", "MON", "10:00-11:00");
    const c = section("C", "ISOM1000", "TUE", "09:00-10:00");
    expect(detectScheduleConflicts([a, b, c])).toHaveLength(0);
  });

  it("finds same-course different sections", () => {
    const a = section("A", "ACCT1000", "MON", "09:00-10:00");
    const b = section("B", "ACCT1000", "TUE", "09:00-10:00");
    expect(findSameCourseSections([a], b).map((s) => s.key)).toEqual(["A"]);
  });
});
