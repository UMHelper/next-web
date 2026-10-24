import { describe, expect, it } from "vitest";
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";
import {
  analyzeTimetable,
  sectionLabel,
  timetableVersion,
} from "@/lib/timetable/analysis";
import { normalizePlanSection, type PlanSection, type Weekday } from "@/lib/timetable/schema";
import { FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

const planSection = (
  key: string,
  code: string,
  section: string,
  date: Weekday,
  time: string,
): PlanSection => ({
  key,
  courseCode: code,
  prof: "P",
  section,
  color: "#000000",
  schedules: [{ date, time, location: "" }],
});

const fixtureSections = () => FIXTURE_PLAN.payload.sections;

const conflictPairKey = (a: string, b: string, day: Weekday) =>
  [a, b].sort().join("|") + `|${day}`;

describe("timetable analysis", () => {
  it("keeps back-to-back meetings apart", () => {
    const a = planSection("A", "ACCT1000", "A", "MON", "09:00-10:00");
    const b = planSection("B", "CISC1000", "B", "MON", "10:00-11:00");
    const result = analyzeTimetable([a, b]);
    expect(result.conflicts).toEqual([]);
    const mon = result.days.find((day) => day.day === "MON");
    expect(mon?.gaps).toEqual([]);
    expect(mon?.first).toBe("09:00");
    expect(mon?.last).toBe("11:00");
  });

  it("reports the overlap window of a conflict", () => {
    const a = planSection("A", "ACCT1000", "A", "MON", "09:00-10:30");
    const b = planSection("B", "CISC1000", "B", "MON", "10:00-11:00");
    expect(analyzeTimetable([a, b]).conflicts).toEqual([
      {
        day: "MON",
        a: "ACCT1000-A",
        b: "CISC1000-B",
        aTime: "09:00-10:30",
        bTime: "10:00-11:00",
        overlap: "10:00-10:30",
      },
    ]);
  });

  it("agrees with detectScheduleConflicts on every pair", () => {
    const sections = fixtureSections();
    const raw = detectScheduleConflicts(sections).map((conflict) =>
      conflictPairKey(sectionLabel(conflict.a), sectionLabel(conflict.b), conflict.date),
    );
    const analyzed = analyzeTimetable(sections).conflicts.map((conflict) =>
      conflictPairKey(conflict.a, conflict.b, conflict.day),
    );
    expect(new Set(analyzed)).toEqual(new Set(raw));
  });

  it("checks every meeting of a multi-meeting section", () => {
    const a = normalizePlanSection({
      courseCode: "MULT1000",
      prof: "P",
      section: "001",
      schedules: [
        { date: "MON", time: "09:00-10:00", location: "" },
        { date: "WED", time: "14:00-15:00", location: "" },
      ],
    });
    const b = normalizePlanSection({
      courseCode: "OTHER1000",
      prof: "P",
      section: "001",
      schedules: [{ date: "WED", time: "14:30-15:30", location: "" }],
    });
    const result = analyzeTimetable([a, b]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.day).toBe("WED");
  });

  it("removes duplicate sections and duplicate meetings", () => {
    const base = fixtureSections();
    const duplicateSection = { ...base[0] };
    const withDuplicateMeetings = normalizePlanSection({
      ...base[1],
      schedules: [
        ...base[1].schedules,
        { date: "TUE", time: "10:00-11:15", location: "duplicate" },
      ],
    });
    const sections = [...base, duplicateSection, withDuplicateMeetings];
    const clean = analyzeTimetable(base);
    const result = analyzeTimetable(sections);
    expect(result.duplicatesRemoved).toBe(2);
    expect(result.meetingCount).toBe(clean.meetingCount);
  });

  it("lists sections without times and is then incomplete", () => {
    const result = analyzeTimetable(fixtureSections());
    expect(result.unscheduled).toEqual(["GEND1001-001"]);
    expect(result.complete).toBe(false);
  });

  it("is incomplete when a partial label is given", () => {
    const result = analyzeTimetable(fixtureSections(), { partial: ["X-001"] });
    expect(result.complete).toBe(false);
    expect(result.partial).toEqual(["X-001"]);
  });

  it("computes gaps between classes only", () => {
    const mon = analyzeTimetable(fixtureSections()).days.find((day) => day.day === "MON");
    expect(mon?.gaps).toEqual([{ start: "11:15", end: "14:00", minutes: 165 }]);
  });

  it("merges overlaps before counting class minutes", () => {
    const tue = analyzeTimetable(fixtureSections()).days.find((day) => day.day === "TUE");
    expect(tue?.classMinutes).toBe(135);
    expect(tue?.gaps).toEqual([]);
  });

  it("uses exclusive day-part boundaries", () => {
    const morningOnly = analyzeTimetable([
      planSection("A", "CISC1000", "A", "MON", "10:30-12:00"),
    ]).days[0]?.parts;
    expect(morningOnly?.morning).toBe("busy");
    expect(morningOnly?.afternoon).toBe("free");

    const afternoonOnly = analyzeTimetable([
      planSection("B", "CISC1000", "B", "MON", "12:00-13:00"),
    ]).days[0]?.parts;
    expect(afternoonOnly?.morning).toBe("free");
    expect(afternoonOnly?.afternoon).toBe("busy");
  });

  it("finds earliest, latest end and busiest days", () => {
    const result = analyzeTimetable(fixtureSections());
    expect(result.earliest).toEqual({
      day: "TUE",
      time: "09:00",
      label: "CISC2001-001",
    });
    expect(result.busiestDays).toEqual(["MON"]);

    const wed = result.days.find((day) => day.day === "WED");
    expect(wed?.parts.morning).toBe("free");
    expect(wed?.parts.afternoon).toBe("busy");

    const tie = analyzeTimetable([
      planSection("A", "CISC1000", "A", "MON", "09:00-10:15"),
      planSection("B", "CISC1000", "B", "TUE", "09:00-10:15"),
    ]);
    expect(tie.busiestDays.sort()).toEqual(["MON", "TUE"]);
  });

  it("changes version on edits but not on section order", () => {
    const sections = fixtureSections();
    const reordered = [...sections].reverse();
    expect(timetableVersion(reordered)).toBe(timetableVersion(sections));

    const edited = sections.map((item, index) =>
      index === 0
        ? {
            ...item,
            schedules: [{ date: "TUE" as const, time: "09:30-10:45", location: "E11-1002" }],
          }
        : item,
    );
    expect(timetableVersion(edited)).not.toBe(timetableVersion(sections));
    expect(timetableVersion(edited)).toMatch(/^[0-9a-f]{8}$/);
  });
});
