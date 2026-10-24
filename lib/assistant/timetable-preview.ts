import { z } from "zod";

import { formatAcademicYear } from "@/lib/config/term-format";
import { resolveCandidate } from "@/lib/assistant/timetable-candidates";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import type { TimetableToolDeps } from "@/lib/assistant/timetable-tools";
import {
  analyzeTimetable,
  sectionLabel,
  timetableVersion,
  type AnalyzedConflict,
} from "@/lib/timetable/analysis";
import { normalizeCourseCode, planSectionSchema, type PlanSection, type Weekday } from "@/lib/timetable/schema";

export const PREVIEW_TIMETABLE_TOOL_NAME = "preview_timetable";
export const PREVIEW_TIMETABLE_DESCRIPTION =
  "Show the student a read-only visual preview of their saved timetable, or of it with up to three hypothetical sections added; a section of a course already in the timetable replaces that course in the preview only. Call only when the student wants to see their timetable or week, see where a conflict is, or see a week with specific sections. Never saves anything.";
export const MAX_PREVIEW_ADDITIONS = 3;

const weekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI"]);

export const previewTimetableParameters = z.object({
  add: z
    .array(
      z.object({
        code: z.string().min(1).max(20).describe("Course code, e.g. ECON1001"),
        instructor: z.string().min(1).max(80).describe("Instructor name in English, e.g. CHAN TAI MAN"),
        section: z.string().min(1).max(20).optional().describe("Section number, e.g. 001"),
      }),
    )
    .max(MAX_PREVIEW_ADDITIONS)
    .optional()
    .describe("Hypothetical sections to add to the preview, at most three"),
  focusDay: weekdaySchema.optional().describe("Weekday to focus the preview on"),
});

export type PreviewTimetableInput = z.infer<typeof previewTimetableParameters>;

export type PreviewSection = PlanSection & { origin: "saved" | "added"; replaces?: string };

export type TimetablePreviewResult =
  | {
      status: "ready";
      kind: "saved" | "hypothetical";
      plan: { name: string; year: number; sem: number } | null;
      term: string;
      version: string | null;
      focusDay: Weekday;
      sections: PreviewSection[];
      replaced: string[];
      partial: string[];
      facts: { conflicts: AnalyzedConflict[]; unscheduled: string[]; complete: boolean };
    }
  | {
      status: "needs_section";
      courseCode: string;
      instructor: string;
      options: Array<{ section: string; meetings: string[] }>;
    }
  | { status: "no_timetable"; timetable: "no_plan" | "loading" | "unavailable" }
  | { status: "term_mismatch"; planTerm: string; catalogTerm: string }
  | { status: "not_found"; courseCode: string; instructor: string; section?: string }
  | { status: "invalid_request" }
  | { status: "temporarily_unavailable" };

const analyzedConflictSchema = z
  .object({
    day: weekdaySchema,
    a: z.string(),
    b: z.string(),
    aTime: z.string(),
    bTime: z.string(),
    overlap: z.string(),
  })
  .strict();

const previewSectionSchema = planSectionSchema
  .extend({
    origin: z.enum(["saved", "added"]),
    replaces: z.string().optional(),
  })
  .strict();

export const timetablePreviewResultSchema = z.union([
  z
    .object({
      status: z.literal("ready"),
      kind: z.enum(["saved", "hypothetical"]),
      plan: z
        .object({ name: z.string(), year: z.number(), sem: z.number() })
        .strict()
        .nullable(),
      term: z.string(),
      version: z.string().nullable(),
      focusDay: weekdaySchema,
      sections: z.array(previewSectionSchema),
      replaced: z.array(z.string()),
      partial: z.array(z.string()),
      facts: z
        .object({
          conflicts: z.array(analyzedConflictSchema),
          unscheduled: z.array(z.string()),
          complete: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      status: z.literal("needs_section"),
      courseCode: z.string(),
      instructor: z.string(),
      options: z.array(z.object({ section: z.string(), meetings: z.array(z.string()) }).strict()),
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
  z
    .object({
      status: z.literal("not_found"),
      courseCode: z.string(),
      instructor: z.string(),
      section: z.string().optional(),
    })
    .strict(),
  z.object({ status: z.literal("invalid_request") }).strict(),
  z.object({ status: z.literal("temporarily_unavailable") }).strict(),
]);

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

const planTermMismatch = (state: Extract<TimetableState, { status: "ready" }>, catalogTerm: { year: number; sem: number }) =>
  state.plan.year !== catalogTerm.year || state.plan.sem !== catalogTerm.sem;

const stripPreviewSection = (section: PreviewSection): PlanSection => {
  const { origin: _origin, replaces: _replaces, ...plan } = section;
  return plan;
};

const focusDayForPreview = (
  requested: Weekday | undefined,
  analysis: ReturnType<typeof analyzeTimetable>,
  sections: PlanSection[],
): Weekday => {
  if (requested) return requested;
  const firstConflict = analysis.conflicts[0]?.day;
  if (firstConflict) return firstConflict;
  for (const day of WEEKDAYS) {
    if (sections.some((section) => section.schedules.some((schedule) => schedule.date === day))) {
      return day;
    }
  }
  return "MON";
};

const readyPreview = (
  input: {
    kind: "saved" | "hypothetical";
    plan: { name: string; year: number; sem: number } | null;
    term: string;
    version: string | null;
    focusDay: Weekday | undefined;
    sections: PreviewSection[];
    replaced: string[];
    partial: string[];
  },
): TimetablePreviewResult => {
  const planSections = input.sections.map(stripPreviewSection);
  const analysis = analyzeTimetable(planSections, { partial: input.partial });
  return {
    status: "ready",
    kind: input.kind,
    plan: input.plan,
    term: input.term,
    version: input.version,
    focusDay: focusDayForPreview(input.focusDay, analysis, planSections),
    sections: input.sections,
    replaced: input.replaced,
    partial: input.partial,
    facts: {
      conflicts: analysis.conflicts,
      unscheduled: analysis.unscheduled,
      complete: analysis.complete,
    },
  };
};

export async function runPreviewTimetable(
  state: TimetableState,
  args: unknown,
  deps: TimetableToolDeps,
): Promise<TimetablePreviewResult> {
  const parsed = previewTimetableParameters.safeParse(args);
  if (!parsed.success) return { status: "invalid_request" };

  const additions = parsed.data.add ?? [];
  const catalogTerm = await deps.loadCatalogTerm();
  const catalogTermLabel = formatAcademicYear(catalogTerm.year, catalogTerm.sem);

  if (additions.length === 0) {
    if (state.status !== "ready") {
      return { status: "no_timetable", timetable: state.status };
    }
    if (planTermMismatch(state, catalogTerm)) {
      return {
        status: "term_mismatch",
        planTerm: formatAcademicYear(state.plan.year, state.plan.sem),
        catalogTerm: catalogTermLabel,
      };
    }
    const savedSections = state.plan.sections.map(
      (section): PreviewSection => ({ ...section, origin: "saved" }),
    );
    return readyPreview({
      kind: "saved",
      plan: { name: state.plan.name, year: state.plan.year, sem: state.plan.sem },
      term: formatAcademicYear(state.plan.year, state.plan.sem),
      version: timetableVersion(state.plan.sections),
      focusDay: parsed.data.focusDay,
      sections: savedSections,
      replaced: [],
      partial: [],
    });
  }

  if (state.status === "loading" || state.status === "unavailable") {
    return { status: "no_timetable", timetable: state.status };
  }

  if (state.status === "ready" && planTermMismatch(state, catalogTerm)) {
    return {
      status: "term_mismatch",
      planTerm: formatAcademicYear(state.plan.year, state.plan.sem),
      catalogTerm: catalogTermLabel,
    };
  }

  const savedSections = state.status === "ready" ? state.plan.sections : [];
  let previewPlanSections: PlanSection[] = [...savedSections];
  const addedKeys = new Set<string>();
  const replaced: string[] = [];
  const partial: string[] = [];
  const replacesByKey = new Map<string, string>();

  for (const addition of additions) {
    const resolution = await resolveCandidate(
      { code: addition.code, instructor: addition.instructor, section: addition.section },
      deps.loadSections,
    );

    if (resolution.status === "not_found") {
      return {
        status: "not_found",
        courseCode: addition.code.toUpperCase(),
        instructor: addition.instructor,
        ...(addition.section !== undefined ? { section: addition.section } : {}),
      };
    }
    if (resolution.status === "temporarily_unavailable") {
      return { status: "temporarily_unavailable" };
    }

    if (addition.section === undefined && resolution.options.length > 1) {
      return {
        status: "needs_section",
        courseCode: resolution.courseCode,
        instructor: resolution.instructor,
        options: resolution.options.map((option) => ({
          section: option.section,
          meetings: option.meetings,
        })),
      };
    }

    const option = resolution.options[0];
    const label = sectionLabel(option.planSection);
    if (option.unsupportedMeetings > 0) {
      partial.push(label);
    }

    const savedMatch = previewPlanSections.find(
      (section) =>
        normalizeCourseCode(section.courseCode) === normalizeCourseCode(option.planSection.courseCode),
    );
    if (savedMatch) {
      const savedLabel = sectionLabel(savedMatch);
      replaced.push(savedLabel);
      previewPlanSections = previewPlanSections.filter(
        (section) =>
          normalizeCourseCode(section.courseCode) !== normalizeCourseCode(option.planSection.courseCode),
      );
    }

    previewPlanSections.push(option.planSection);
    addedKeys.add(option.planSection.key);
    if (savedMatch) {
      replacesByKey.set(option.planSection.key, sectionLabel(savedMatch));
    }
  }

  const previewSections: PreviewSection[] = previewPlanSections.map((section) => {
    if (addedKeys.has(section.key)) {
      return {
        ...section,
        origin: "added",
        ...(replacesByKey.has(section.key) ? { replaces: replacesByKey.get(section.key) } : {}),
      };
    }
    return { ...section, origin: "saved" };
  });

  const plan =
    state.status === "ready"
      ? { name: state.plan.name, year: state.plan.year, sem: state.plan.sem }
      : null;
  const term =
    state.status === "ready"
      ? formatAcademicYear(state.plan.year, state.plan.sem)
      : catalogTermLabel;

  return readyPreview({
    kind: "hypothetical",
    plan,
    term,
    version: state.status === "ready" ? timetableVersion(savedSections) : null,
    focusDay: parsed.data.focusDay,
    sections: previewSections,
    replaced,
    partial,
  });
}

export type TimetablePreviewView =
  | { kind: "result"; data: TimetablePreviewResult }
  | { kind: "malformed" };

export function parseTimetablePreviewResult(content: string): TimetablePreviewView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "malformed" };
  }
  const result = timetablePreviewResultSchema.safeParse(parsed);
  if (!result.success) return { kind: "malformed" };
  return { kind: "result", data: result.data };
}
