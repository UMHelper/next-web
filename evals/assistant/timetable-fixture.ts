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

export async function getCourse(input: GetCourseInput): Promise<GetCourseOutput> {
  return catalog.getCourse(input);
}

export function timetablePayload(plan?: LocalPlan): TimetableContextPayload {
  return buildTimetableContextPayload(plannerState(plan), plannerCurrentTerm());
}

export const DEFAULT_TIMETABLE_PLAN = FIXTURE_PLAN;
