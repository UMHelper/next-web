import { z } from "zod";

export const TIMETABLE_LIMITS = {
  maxSections: 30,
  maxSchedulesPerSection: 20,
  maxPayloadBytes: 64 * 1024,
} as const;

export const normalizeCourseCode = (value: string) => value.trim().toUpperCase();
export const normalizeProf = (value: string) =>
  value.trim().replace(/\s+/g, " ").toUpperCase();
export const normalizeSection = (value: string) => value.trim().toUpperCase();

export const makeSectionKey = (courseCode: string, prof: string, section: string) =>
  `${normalizeCourseCode(courseCode)}|${normalizeProf(prof)}|${normalizeSection(section)}`;

const WEEK_DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

export const normalizeSchedule = (schedule: {
  date?: unknown;
  time?: unknown;
  location?: unknown;
}) => {
  const date = String(schedule.date ?? "").trim().toUpperCase();
  const time = String(schedule.time ?? "").trim().replace(/\s+/g, "");
  const location = String(schedule.location ?? "").trim();

  if (!WEEK_DAYS.includes(date as (typeof WEEK_DAYS)[number])) return null;
  if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(time)) return null;

  const [start, end] = time.split("-");
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
  if (!(startMinutes < endMinutes)) return null;

  return { date, time, location };
};

export const scheduleSchema = z.object({
  date: z.enum(WEEK_DAYS),
  time: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  location: z.string().optional().default(""),
});

export const planSectionSchema = z.object({
  key: z.string().min(1),
  courseCode: z.string().min(1),
  courseTitle: z.string().optional(),
  prof: z.string().min(1),
  section: z.string().min(1),
  credits: z.number().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  schedules: z.array(scheduleSchema).max(TIMETABLE_LIMITS.maxSchedulesPerSection),
});

export const planPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    sections: z.array(planSectionSchema).max(TIMETABLE_LIMITS.maxSections),
  })
  .superRefine((payload, ctx) => {
    const seen = new Set<string>();
    for (const section of payload.sections) {
      if (seen.has(section.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate section key: ${section.key}`,
          path: ["sections"],
        });
      }
      seen.add(section.key);
    }
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (bytes > TIMETABLE_LIMITS.maxPayloadBytes) {
      ctx.addIssue({ code: "custom", message: "Payload is too large", path: ["payload"] });
    }
  });

export type PlanSection = z.infer<typeof planSectionSchema>;
export type TimetablePlanPayload = z.infer<typeof planPayloadSchema>;

const COLOR_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#9333ea",
] as const;

export const colorForKey = (key: string) => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
};

export const normalizePlanSection = (section: {
  code?: string;
  courseCode?: string;
  courseTitle?: string;
  prof: string;
  section: string;
  credits?: number;
  schedules?: unknown[];
  color?: string;
}): PlanSection => {
  const courseCode = normalizeCourseCode(section.courseCode ?? section.code ?? "");
  const key = makeSectionKey(courseCode, section.prof, section.section);
  const schedules: PlanSection["schedules"] = [];
  for (const item of section.schedules ?? []) {
    const normalized = normalizeSchedule(item as any);
    if (normalized) schedules.push(normalized);
  }
  return {
    key,
    courseCode,
    courseTitle: section.courseTitle,
    prof: section.prof.trim().replace(/\s+/g, " "),
    section: normalizeSection(section.section),
    credits: section.credits,
    color: section.color ?? colorForKey(key),
    schedules,
  };
};
