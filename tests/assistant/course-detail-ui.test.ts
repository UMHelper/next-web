import { describe, expect, it } from "vitest";

import {
  GET_COURSE_TOOL_NAME,
  parseCourseDetailResult,
} from "@/lib/assistant/course-detail-ui";
import { SITE_URL } from "@/lib/site";

const fixture = {
  course: {
    courseCode: "APAC1000",
    titleEn: "Introduction to Public Administration",
    titleZh: "公共行政導論",
    credits: "3",
    faculty: "FSS",
    department: "GPA",
    programLevel: null,
    suggestedYear: null,
    medium: null,
    gradingSystem: null,
    courseType: null,
    duration: null,
    description: "Basics.",
    isOffered: true,
    aka: [],
    url: `${SITE_URL}/course/APAC1000`,
  },
  page: 1,
  hasMore: false,
  totalCount: 2,
  instructors: [
    {
      name: "CHAN TAI MAN",
      commentCount: 12,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: true,
      reviewUrl: `${SITE_URL}/review/APAC1000/CHAN%20TAI%20MAN`,
    },
    {
      name: "WONG KA KI",
      commentCount: 0,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: false,
      reviewUrl: `${SITE_URL}/review/APAC1000/WONG%20KA%20KI`,
    },
  ],
};

describe("parseCourseDetailResult", () => {
  it("parses a valid get_course payload", () => {
    const view = parseCourseDetailResult(JSON.stringify(fixture));
    expect(view).toEqual({ kind: "course", data: fixture });
  });

  it.each(["invalid_request", "not_found", "temporarily_unavailable"] as const)(
    "maps %s",
    (error) => {
      expect(parseCourseDetailResult(JSON.stringify({ error }))).toEqual({
        kind: "failure",
        reason: error,
      });
    },
  );

  it("treats non-JSON as malformed", () => {
    expect(parseCourseDetailResult("{not json")).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it("treats a url outside the site as malformed", () => {
    const bad = { ...fixture, course: { ...fixture.course, url: "https://evil.example/x" } };
    expect(parseCourseDetailResult(JSON.stringify(bad))).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });
});

describe("GET_COURSE_TOOL_NAME", () => {
  it("exports the tool name", () => {
    expect(GET_COURSE_TOOL_NAME).toBe("get_course");
  });
});
