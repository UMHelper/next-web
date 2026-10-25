import { z } from "zod";

import { formatAcademicYear } from "@/lib/config/term-format";
import { analyzeTimetable, sectionLabel } from "@/lib/timetable/analysis";
import {
  detectScheduleConflicts,
  minutesToTime,
  timeToMinutes,
} from "@/lib/timetable/conflicts";
import {
  normalizeCourseCode,
  type PlanSection,
  type Weekday,
} from "@/lib/timetable/schema";

import { resolveCandidate } from "@/lib/assistant/timetable-candidates";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import type { TimetableToolDeps } from "@/lib/assistant/timetable-tools";

export const CHECK_PLAN_CONFLICTS_TOOL_NAME = "check_plan_conflicts";
export const CHECK_PLAN_CONFLICTS_DESCRIPTION =
  "Check whether sections of one instructor's offering of a course clash with the student's saved timetable, using this term's catalog class times. It needs the instructor: call get_course first when you do not know who teaches the course, then check each instructor teaching this term, at most three (list any others and ask). When the page names a course, check that code even if get_course fails, using an instructor from the page context, courseReferent or get_course_sections. Omit section to check every listed section; do that, and answer in text, when the student asks what if they take a course without naming a section. A section with complete false, or a result with sectionListComplete false, was not fully checked. Read-only; never changes the timetable.";

export const checkPlanConflictsParameters = z.object({
  code: z.string().min(1).max(20).describe("Course code, e.g. ECON1001"),
  instructor: z.string().min(1).max(80).describe("Instructor name in English, e.g. CHAN TAI MAN"),
  section: z.string().min(1).max(20).optional().describe("Section number, e.g. 001"),
});

export type CheckPlanConflictsInput = z.infer<typeof checkPlanConflictsParameters>;

export type SectionCheck = {
  section: string;
  meetings: string[];
  conflicts: Array<{ with: string; day: Weekday; overlap: string }>;
  complete: boolean;
  replaces?: string;
};

export type CheckPlanConflictsResult =
  | {
      status: "checked";
      courseCode: string;
      instructor: string;
      plan: { name: string; term: string };
      planComplete: boolean;
      unscheduled: string[];
      sectionListComplete: boolean;
      sections: SectionCheck[];
    }
  | { status: "no_timetable"; timetable: "no_plan" | "loading" | "unavailable" }
  | { status: "term_mismatch"; planTerm: string; catalogTerm: string }
  | { status: "not_found" }
  | { status: "invalid_request" }
  | { status: "temporarily_unavailable" }
  | { status: "needs_clarification"; ask: string };

const overlapWindow = (aTime: string, bTime: string) => {
  const [aStart, aEnd] = aTime.split("-").map(timeToMinutes);
  const [bStart, bEnd] = bTime.split("-").map(timeToMinutes);
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return `${minutesToTime(start)}-${minutesToTime(end)}`;
};

const sectionConflictSchema = z
  .object({
    section: z.string(),
    meetings: z.array(z.string()),
    conflicts: z.array(
      z.object({ with: z.string(), day: z.enum(["MON", "TUE", "WED", "THU", "FRI"]), overlap: z.string() }).strict(),
    ),
    complete: z.boolean(),
    replaces: z.string().optional(),
  })
  .strict();

export const checkPlanConflictsResultSchema: z.ZodType<CheckPlanConflictsResult> = z.union([
  z
    .object({
      status: z.literal("checked"),
      courseCode: z.string(),
      instructor: z.string(),
      plan: z.object({ name: z.string(), term: z.string() }).strict(),
      planComplete: z.boolean(),
      unscheduled: z.array(z.string()),
      sectionListComplete: z.boolean(),
      sections: z.array(sectionConflictSchema),
    })
    .strict(),
  z.object({ status: z.literal("no_timetable"), timetable: z.enum(["no_plan", "loading", "unavailable"]) }).strict(),
  z
    .object({
      status: z.literal("term_mismatch"),
      planTerm: z.string(),
      catalogTerm: z.string(),
    })
    .strict(),
  z.object({ status: z.literal("not_found") }).strict(),
  z.object({ status: z.literal("invalid_request") }).strict(),
  z.object({ status: z.literal("temporarily_unavailable") }).strict(),
  z.object({ status: z.literal("needs_clarification"), ask: z.string() }).strict(),
]);

const planWithoutCourse = (plan: PlanSection[], courseCode: string) =>
  plan.filter((section) => normalizeCourseCode(section.courseCode) !== normalizeCourseCode(courseCode));

const replacesForCourse = (plan: PlanSection[], courseCode: string) => {
  const saved = plan.find(
    (section) => normalizeCourseCode(section.courseCode) === normalizeCourseCode(courseCode),
  );
  return saved ? sectionLabel(saved) : undefined;
};

const conflictsForCandidate = (plan: PlanSection[], candidate: PlanSection) => {
  const base = planWithoutCourse(plan, candidate.courseCode);
  const seen = new Set<string>();
  const conflicts: SectionCheck["conflicts"] = [];

  for (const conflict of detectScheduleConflicts([...base, candidate])) {
    if (conflict.a.key !== candidate.key && conflict.b.key !== candidate.key) continue;
    const other = conflict.a.key === candidate.key ? conflict.b : conflict.a;
    const label = sectionLabel(other);
    const overlap = overlapWindow(conflict.aTime, conflict.bTime);
    const id = `${label}|${conflict.date}|${overlap}`;
    if (seen.has(id)) continue;
    seen.add(id);
    conflicts.push({ with: label, day: conflict.date, overlap });
  }

  conflicts.sort((a, b) => a.day.localeCompare(b.day) || a.with.localeCompare(b.with));
  return conflicts;
};

export async function runCheckPlanConflicts(
  state: TimetableState,
  args: unknown,
  deps: TimetableToolDeps,
): Promise<CheckPlanConflictsResult> {
  const parsed = checkPlanConflictsParameters.safeParse(args);
  if (!parsed.success) return { status: "invalid_request" };

  if (state.status !== "ready") {
    return { status: "no_timetable", timetable: state.status };
  }

  let catalogTerm: { year: number; sem: number };
  try {
    catalogTerm = await deps.loadCatalogTerm();
  } catch {
    return { status: "temporarily_unavailable" };
  }
  if (state.plan.year !== catalogTerm.year || state.plan.sem !== catalogTerm.sem) {
    return {
      status: "term_mismatch",
      planTerm: formatAcademicYear(state.plan.year, state.plan.sem),
      catalogTerm: formatAcademicYear(catalogTerm.year, catalogTerm.sem),
    };
  }

  const resolution = await resolveCandidate(parsed.data, deps.loadSections);
  if (resolution.status !== "resolved") return resolution;

  const analysis = analyzeTimetable(state.plan.sections);
  const replaces = replacesForCourse(state.plan.sections, resolution.courseCode);

  const sections = resolution.options.map((option) => ({
    section: option.section,
    meetings: option.meetings,
    conflicts: conflictsForCandidate(state.plan.sections, option.planSection),
    complete: option.meetings.length > 0 && option.unsupportedMeetings === 0,
    ...(replaces ? { replaces } : {}),
  }));

  return {
    status: "checked",
    courseCode: resolution.courseCode,
    instructor: resolution.instructor,
    plan: {
      name: state.plan.name,
      term: formatAcademicYear(state.plan.year, state.plan.sem),
    },
    planComplete: analysis.complete,
    unscheduled: analysis.unscheduled,
    sectionListComplete: resolution.sectionListComplete,
    sections,
  };
}
