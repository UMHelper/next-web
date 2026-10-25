import { defineTool } from "@copilotkit/runtime/v2";

import {
  CHECK_PLAN_CONFLICTS_DESCRIPTION,
  CHECK_PLAN_CONFLICTS_TOOL_NAME,
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import {
  PREVIEW_TIMETABLE_DESCRIPTION,
  PREVIEW_TIMETABLE_TOOL_NAME,
  previewTimetableParameters,
  runPreviewTimetable,
} from "@/lib/assistant/timetable-preview";
import { bindCourseToolArgs, type CourseReferentSlot } from "@/lib/assistant/course-referent";
import type { TimetableSlot, TimetableState } from "@/lib/assistant/timetable-context";
import { resolveCandidate, type LoadSections } from "@/lib/assistant/timetable-candidates";
import { assistantCourseSectionsOutputSchema } from "@/lib/assistant/assistant-output-schemas";
import { getCourseSections } from "@/lib/mcp/data/get-course-sections";
import { getCourseSectionsInputSchema } from "@/lib/mcp/schemas";

export type { LoadSections } from "@/lib/assistant/timetable-candidates";
export { resolveCandidate };

export type TimetableToolDeps = {
  loadSections: LoadSections;
  loadCatalogTerm: () => Promise<{ year: number; sem: number }>;
};

export const defaultTimetableToolDeps: TimetableToolDeps = {
  loadSections: async (input) => {
    const parsed = getCourseSectionsInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("invalid_request");
    return assistantCourseSectionsOutputSchema.parse(await getCourseSections(parsed.data));
  },
  loadCatalogTerm: async () => {
    const { getAppConfig } = await import("@/lib/config/app-config");
    const config = await getAppConfig();
    return { year: config.currentYear, sem: config.currentSem };
  },
};

const unavailableState: TimetableState = { status: "unavailable" };

export function createTimetableTools(
  timetable: TimetableSlot,
  referent: CourseReferentSlot,
  deps: TimetableToolDeps = defaultTimetableToolDeps,
): ReturnType<typeof defineTool>[] {
  return [
    defineTool({
      name: CHECK_PLAN_CONFLICTS_TOOL_NAME,
      description: CHECK_PLAN_CONFLICTS_DESCRIPTION,
      parameters: checkPlanConflictsParameters,
      execute: async (args) => {
        const bound = bindCourseToolArgs(referent.current, CHECK_PLAN_CONFLICTS_TOOL_NAME, args);
        if (bound.action === "clarify") return bound.result;
        return runCheckPlanConflicts(timetable.current, bound.args, deps);
      },
    }),
    defineTool({
      name: PREVIEW_TIMETABLE_TOOL_NAME,
      description: PREVIEW_TIMETABLE_DESCRIPTION,
      parameters: previewTimetableParameters,
      execute: async (args) => runPreviewTimetable(timetable.current, args, deps),
    }),
  ];
}

export const unavailableTimetableSlot: TimetableSlot = { current: unavailableState };
