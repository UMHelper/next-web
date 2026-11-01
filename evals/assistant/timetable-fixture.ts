import { buildTimetableContextPayload } from "@/lib/assistant/timetable-context";
import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";
import type { GetCourseInput, GetCourseOutput, GetCourseSectionsInput, GetCourseSectionsOutput } from "@/lib/mcp/schemas";
import { plannerCurrentTerm } from "@/lib/timetable/current-term";
import type { LocalPlan } from "@/lib/timetable/store";
import { FIXTURE_CATALOG_SECTIONS, FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";
import { plannerState } from "@/tests/helpers/planner-state";

import * as catalog from "./catalog";

const FIXTURE_SECTIONS_BY_CODE = new Map(
  FIXTURE_CATALOG_SECTIONS.map((entry) => [entry.courseCode.toUpperCase(), entry]),
);

export async function getCourseSections(input: GetCourseSectionsInput): Promise<GetCourseSectionsOutput> {
  const code = input.code.trim().toUpperCase();
  const fixture = FIXTURE_SECTIONS_BY_CODE.get(code);
  if (fixture) return fixture;
  return catalog.getCourseSections(input);
}

const fixtureCourseOutput = (code: string, titleEn: string, instructor: string): GetCourseOutput => {
  const url = `https://umeh.top/course/${code}`;
  return {
    course: {
      courseCode: code,
      titleEn,
      titleZh: titleEn,
      credits: "3",
      faculty: "FST",
      department: "CIS",
      programLevel: "Undergraduate",
      suggestedYear: null,
      medium: "English",
      gradingSystem: null,
      courseType: null,
      duration: null,
      description: "Timetable eval fixture course.",
      isOffered: true,
      aka: [],
      url,
    },
    page: 1,
    hasMore: false,
    totalCount: 1,
    instructors: [
      {
        name: instructor,
        commentCount: 1,
        result: 3,
        attendance: 3,
        grade: 3,
        difficulty: 3,
        reward: 3,
        isOffered: true,
        reviewUrl: url,
      },
    ],
  };
};

export async function getCourse(input: GetCourseInput): Promise<GetCourseOutput> {
  const code = input.code.trim().toUpperCase();
  if (code === "MATH1010") return fixtureCourseOutput(code, "Calculus I", "HO SIU MING");
  if (code === "ECON1001") return fixtureCourseOutput(code, "Microeconomics", "CHEUNG WAI");
  return catalog.getCourse(input);
}

export function timetablePayload(plan?: LocalPlan): TimetableContextPayload {
  return buildTimetableContextPayload(plannerState(plan), plannerCurrentTerm());
}

export const DEFAULT_TIMETABLE_PLAN = FIXTURE_PLAN;
