import type { GetCourseOutput, GetInstructorOutput } from "@/lib/mcp/schemas";

import type { AssistantCourseOutput, AssistantInstructorOutput } from "./assistant-output-schemas";
import { SMALL_REVIEW_SAMPLE } from "./rating-semantics";

export const RATING_SCALE_NOTE = {
  result: "Overall: average of the review rating sliders, 1 to 5; higher is more positive.",
  grade: "Reported grade: 1 is F, 5 is A; higher means higher grades reported, not a stricter grader.",
  difficulty: "Difficulty: 1 Very hard, 5 Very easy; a HIGHER number means EASIER.",
  reward: "Usefulness: 1 Waste of time, 5 Very useful.",
  attendance: "Attendance checks: 1 Always, 5 Never.",
} as const;

export type SampleSize = "none" | "small" | "adequate";

export type RatedRow = {
  commentCount: number;
  result: number | null;
  attendance: number | null;
  grade: number | null;
  difficulty: number | null;
  reward: number | null;
};

export const NOT_AVAILABLE_ON_SITE = [
  "exam or assessment format",
  "prerequisites",
  "seat availability",
  "structured workload measures",
] as const;

export function sampleSizeOf(commentCount: number): SampleSize {
  if (commentCount <= 0) return "none";
  if (commentCount < SMALL_REVIEW_SAMPLE) return "small";
  return "adequate";
}

function nullRating(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  return value;
}

export function withRatingSemantics<T extends RatedRow>(row: T): T & { sampleSize: SampleSize } {
  const sampleSize = sampleSizeOf(row.commentCount);
  if (row.commentCount === 0) {
    return {
      ...row,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      sampleSize,
    };
  }

  return {
    ...row,
    result: nullRating(row.result),
    attendance: nullRating(row.attendance),
    grade: nullRating(row.grade),
    difficulty: nullRating(row.difficulty),
    reward: nullRating(row.reward),
    sampleSize,
  };
}

export function projectCourseForAssistant(output: GetCourseOutput): AssistantCourseOutput {
  return {
    ...output,
    ratingScale: { ...RATING_SCALE_NOTE },
    notAvailableOnSite: [...NOT_AVAILABLE_ON_SITE],
    instructors: output.instructors.map((instructor) => withRatingSemantics(instructor)),
  };
}

export function projectInstructorForAssistant(output: GetInstructorOutput): AssistantInstructorOutput {
  return {
    ...output,
    ratingScale: { ...RATING_SCALE_NOTE },
    courses: output.courses.map((course) => withRatingSemantics(course)),
  };
}
