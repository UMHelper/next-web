import { z } from "zod";

import { detectScheduleConflicts } from "@/lib/timetable/conflicts";
import {
  normalizeCourseCode,
  normalizePlanSection,
  normalizeSection,
  type PlanSection,
} from "@/lib/timetable/schema";

export const CHECK_PLAN_CONFLICTS_DESCRIPTION =
  "Check whether one section of a course taught by an instructor clashes with the student's current timetable. Read-only; never changes the timetable.";

export const checkPlanConflictsParameters = z.object({
  code: z.string().min(1).max(20).describe("Course code, e.g. ECON1001"),
  instructor: z.string().min(1).max(80).describe("Instructor name in English, e.g. CHAN TAI MAN"),
  section: z.string().min(1).max(20).describe("Section number, e.g. 001"),
});

export type CheckPlanConflictsInput = z.infer<typeof checkPlanConflictsParameters>;
export type CatalogSection = { section: string; schedules: PlanSection["schedules"] };
export type PlanConflict = { with: string; day: string };
export type CheckPlanConflictsResult =
  | { found: false; error?: "request_failed" }
  | { found: true; conflicts: PlanConflict[] };

export function checkPlanConflicts(
  plan: PlanSection[],
  input: CheckPlanConflictsInput,
  sections: CatalogSection[],
): CheckPlanConflictsResult {
  const wanted = normalizeSection(input.section);
  const match = sections.find((entry) => normalizeSection(entry.section) === wanted);
  if (!match) return { found: false };

  const candidate = normalizePlanSection({
    code: input.code,
    prof: input.instructor,
    section: match.section,
    schedules: match.schedules,
  });
  const others = plan.filter(
    (item) => normalizeCourseCode(item.courseCode) !== candidate.courseCode,
  );

  const seen = new Set<string>();
  const conflicts: PlanConflict[] = [];
  for (const conflict of detectScheduleConflicts([...others, candidate])) {
    if (conflict.a.key !== candidate.key && conflict.b.key !== candidate.key) continue;
    const other = conflict.a.key === candidate.key ? conflict.b : conflict.a;
    const label = `${other.courseCode}-${other.section}`;
    const id = `${label}|${conflict.date}`;
    if (seen.has(id)) continue;
    seen.add(id);
    conflicts.push({ with: label, day: conflict.date });
  }

  return { found: true, conflicts };
}

export async function runCheckPlanConflicts(
  plan: PlanSection[],
  input: CheckPlanConflictsInput,
  loadSections: (code: string, instructor: string) => Promise<{ sections: CatalogSection[] }>,
): Promise<CheckPlanConflictsResult> {
  try {
    const { sections } = await loadSections(input.code, input.instructor);
    return checkPlanConflicts(plan, input, sections);
  } catch {
    return { found: false, error: "request_failed" };
  }
}
