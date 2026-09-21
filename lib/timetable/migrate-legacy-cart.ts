import { normalizePlanSection, planPayloadSchema } from "./schema";
import type { PlanSection, TimetablePlanPayload } from "./schema";

export const migrateLegacyCart = (
  items: unknown,
  _term: { year: number; sem: number },
): TimetablePlanPayload | null => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const byKey = new Map<string, PlanSection>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    if (typeof source.code !== "string" || typeof source.prof !== "string") {
      continue;
    }
    if (typeof source.section !== "string") continue;

    const section = normalizePlanSection({
      code: source.code,
      prof: source.prof,
      section: source.section,
      courseTitle:
        typeof source.courseTitle === "string" ? source.courseTitle : undefined,
      credits: typeof source.credits === "number" ? source.credits : undefined,
      schedules: Array.isArray(source.schedules) ? source.schedules : [],
    });

    if (!section.courseCode || section.schedules.length === 0) continue;
    byKey.set(section.key, section);
  }

  if (byKey.size === 0) return null;

  const parsed = planPayloadSchema.safeParse({
    schemaVersion: 1,
    sections: [...byKey.values()],
  });

  return parsed.success ? parsed.data : null;
};
