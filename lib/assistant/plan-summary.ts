import type { LocalPlan } from "@/lib/timetable/store";

export const PLAN_SUMMARY_MAX_SECTIONS = 30;

export function summarizePlan(plan: LocalPlan | undefined): string {
  if (!plan) return "No timetable plan";

  const term = `Term ${plan.year}/${plan.sem}, plan "${plan.name}"`;
  const sections = plan.payload.sections;
  if (sections.length === 0) return `${term}, no courses added yet`;

  const courseCount = new Set(sections.map((section) => section.courseCode)).size;
  const lines = sections.slice(0, PLAN_SUMMARY_MAX_SECTIONS).map((section) => {
    const times =
      section.schedules.length > 0
        ? section.schedules.map((slot) => `${slot.date} ${slot.time}`).join(", ")
        : "no meeting times";
    return `${section.courseCode}-${section.section} (${section.prof}) ${times}`;
  });
  if (sections.length > PLAN_SUMMARY_MAX_SECTIONS) {
    lines.push(`…and ${sections.length - PLAN_SUMMARY_MAX_SECTIONS} more sections not listed`);
  }

  return [`${term}, ${courseCount} ${courseCount === 1 ? "course" : "courses"}:`, ...lines].join("\n");
}
