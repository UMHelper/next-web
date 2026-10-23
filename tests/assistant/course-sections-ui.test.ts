import { describe, expect, it } from "vitest";

import {
  formatWeekday,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import { SITE_URL } from "@/lib/site";

const courseUrl = `${SITE_URL}/course/APAC1000`;

const fixture = {
  courseCode: "APAC1000",
  instructor: "CHAN TAI MAN",
  courseUrl,
  sections: [
    {
      section: "001",
      courseUrl,
      schedules: [
        { weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E21-G015" },
        { weekday: "THU", startTime: "09:00", endTime: "10:15", location: null },
      ],
    },
    {
      section: "002",
      courseUrl,
      schedules: [],
    },
  ],
};

describe("parseCourseSectionsResult", () => {
  it("parses sections with several meetings", () => {
    const view = parseCourseSectionsResult(JSON.stringify(fixture));
    expect(view.kind).toBe("sections");
    if (view.kind === "sections") expect(view.data.sections[0].schedules).toHaveLength(2);
  });

  it("maps an empty section list to empty", () => {
    expect(parseCourseSectionsResult(JSON.stringify({ ...fixture, sections: [] }))).toEqual({
      kind: "empty",
      courseCode: "APAC1000",
      instructor: "CHAN TAI MAN",
    });
  });

  it("maps tool errors and malformed JSON", () => {
    expect(parseCourseSectionsResult(JSON.stringify({ error: "not_found" }))).toEqual({
      kind: "failure",
      reason: "not_found",
    });
    expect(parseCourseSectionsResult("")).toEqual({ kind: "failure", reason: "malformed" });
  });
});

describe("formatWeekday", () => {
  it("formats weekdays", () => {
    expect(formatWeekday("MON")).toBe("Mon");
    expect(formatWeekday("SUN")).toBe("Sun");
  });
});
