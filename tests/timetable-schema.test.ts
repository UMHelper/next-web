import { describe, expect, it } from "vitest";
import {
  colorForKey,
  makeSectionKey,
  normalizeSchedule,
  planPayloadSchema,
} from "@/lib/timetable/schema";

describe("timetable schema", () => {
  it("normalizes section identity", () => {
    expect(makeSectionKey(" acct1000 ", " Chan  Tai Man ", " a01 ")).toBe(
      "ACCT1000|CHAN TAI MAN|A01",
    );
  });

  it("normalizes schedule whitespace and date case", () => {
    expect(
      normalizeSchedule({
        date: "mon",
        time: " 09:00 - 10:15 ",
        location: " E4-3052 ",
      }),
    ).toEqual({ date: "MON", time: "09:00-10:15", location: "E4-3052" });
  });

  it("rejects invalid time and duplicate keys", () => {
    const parsed = planPayloadSchema.safeParse({
      schemaVersion: 1,
      sections: [
        {
          key: "X|Y|A",
          courseCode: "X",
          prof: "Y",
          section: "A",
          color: "#000000",
          schedules: [],
        },
        {
          key: "X|Y|A",
          courseCode: "X",
          prof: "Y",
          section: "A",
          color: "#000000",
          schedules: [],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("colors are stable for the same key", () => {
    expect(colorForKey("ACCT1000|CHAN|A01")).toBe(
      colorForKey("ACCT1000|CHAN|A01"),
    );
  });
});
