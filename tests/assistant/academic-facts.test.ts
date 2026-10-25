import { describe, expect, it } from "vitest";

import {
  NOT_AVAILABLE_ON_SITE,
  projectCourseForAssistant,
  RATING_SCALE_NOTE,
  sampleSizeOf,
  withRatingSemantics,
} from "@/lib/assistant/academic-facts";
import { getCourseOutputSchema, type GetCourseOutput } from "@/lib/mcp/schemas";

function courseFixture(): GetCourseOutput {
  return {
    course: {
      courseCode: "GELH1000",
      titleEn: "Great Books",
      titleZh: null,
      credits: "3",
      faculty: "FSS",
      department: "GELH",
      programLevel: "UG",
      suggestedYear: "1",
      medium: "English",
      gradingSystem: "Graded",
      courseType: "Compulsory",
      duration: "One semester",
      description: "Read books.",
      aka: [],
      isOffered: true,
      url: "https://umeh.top/course/GELH1000",
    },
    page: 1,
    totalCount: 1,
    hasMore: false,
    instructors: [
      {
        name: "LEE MEI LING",
        commentCount: 31,
        result: 4.1,
        attendance: 3.5,
        grade: 4,
        difficulty: 3.88,
        reward: 4.2,
        isOffered: true,
        reviewUrl: "https://umeh.top/reviews/GELH1000/LEE%20MEI%20LING",
      },
    ],
  };
}

describe("academic facts", () => {
  it("states that a higher difficulty number is easier", () => {
    expect(RATING_SCALE_NOTE.difficulty).toMatch(/1 Very hard, 5 Very easy/);
    expect(RATING_SCALE_NOTE.difficulty).toMatch(/HIGHER number means EASIER/);
  });

  it.each([
    [0, "none"],
    [1, "small"],
    [4, "small"],
    [5, "adequate"],
    [80, "adequate"],
  ] as const)("classifies %i reviews as %s", (count, size) => expect(sampleSizeOf(count)).toBe(size));

  it("nulls coalesced zero aggregates instead of reading them as very hard", () => {
    expect(
      withRatingSemantics({
        commentCount: 0,
        result: 0,
        attendance: 0,
        grade: 0,
        difficulty: 0,
        reward: 0,
      }),
    ).toEqual({
      commentCount: 0,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      sampleSize: "none",
    });
  });

  it("keeps real ratings and adds the scale and data gaps to get_course output", () => {
    const out = projectCourseForAssistant(courseFixture());
    expect(out.instructors[0]).toMatchObject({ difficulty: 3.88, sampleSize: "adequate" });
    expect(out.ratingScale.difficulty).toBe(RATING_SCALE_NOTE.difficulty);
    expect(out.notAvailableOnSite).toContain("exam or assessment format");
    expect(out.notAvailableOnSite).toEqual([...NOT_AVAILABLE_ON_SITE]);
    expect(getCourseOutputSchema.parse(out)).toBeTruthy();
  });
});
