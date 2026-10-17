import type { LocalPlan } from "@/lib/timetable/store";

export const PLAN_SUMMARY_MAX_SECTIONS = 30;

export function summarizePlan(plan: LocalPlan | undefined): string {
  if (!plan) return "当前没有课表方案";

  const term = `学期 ${plan.year}/${plan.sem}，方案「${plan.name}」`;
  const sections = plan.payload.sections;
  if (sections.length === 0) return `${term}，还没有加入任何课`;

  const courseCount = new Set(sections.map((section) => section.courseCode)).size;
  const lines = sections.slice(0, PLAN_SUMMARY_MAX_SECTIONS).map((section) => {
    const times =
      section.schedules.length > 0
        ? section.schedules.map((slot) => `${slot.date} ${slot.time}`).join(", ")
        : "无上课时间";
    return `${section.courseCode}-${section.section} (${section.prof}) ${times}`;
  });
  if (sections.length > PLAN_SUMMARY_MAX_SECTIONS) {
    lines.push(`……另有 ${sections.length - PLAN_SUMMARY_MAX_SECTIONS} 个 section 未列出`);
  }

  return [`${term}，共 ${courseCount} 门：`, ...lines].join("\n");
}
