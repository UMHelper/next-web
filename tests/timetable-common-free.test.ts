import { describe, expect, it } from "vitest";
import { computeCommonFree } from "@/lib/timetable/common-free";

const section = (key: string, date: string, time: string) => ({
  key,
  courseCode: key,
  prof: "P",
  section: key,
  color: "#2563eb",
  schedules: [{ date: date as any, time, location: "" }],
});

describe("computeCommonFree", () => {
  it("returns the full day when both plans are free", () => {
    const result = computeCommonFree([], []);
    expect(result[0]).toEqual({ date: "MON", start: "08:00", end: "20:00" });
    expect(result).toHaveLength(5);
  });

  it("merges busy intervals and returns gaps >=30 minutes", () => {
    const a = [section("A", "MON", "09:00-10:00")];
    const b = [section("B", "MON", "10:30-12:00")];
    const monday = computeCommonFree(a, b).filter((slot) => slot.date === "MON");
    expect(monday).toEqual([
      { date: "MON", start: "08:00", end: "09:00" },
      { date: "MON", start: "10:00", end: "10:30" },
      { date: "MON", start: "12:00", end: "20:00" },
    ]);
  });

  it("filters out gaps shorter than 30 minutes", () => {
    const a = [section("A", "MON", "09:00-10:00")];
    const b = [section("B", "MON", "10:15-11:00")];
    const monday = computeCommonFree(a, b).filter((slot) => slot.date === "MON");
    expect(monday.some((slot) => slot.start === "10:00")).toBe(false);
  });

  it("clamps classes outside 08:00-20:00", () => {
    const a = [section("A", "MON", "07:00-09:00")];
    const b = [section("B", "MON", "19:00-21:00")];
    const monday = computeCommonFree(a, b).filter((slot) => slot.date === "MON");
    expect(monday).toEqual([
      { date: "MON", start: "09:00", end: "19:00" },
    ]);
  });
});
