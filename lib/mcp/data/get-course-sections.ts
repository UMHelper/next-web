import getScheduleList from "@/lib/database/get-schedule-list";
import type {
  CourseSection,
  GetCourseSectionsInput,
  GetCourseSectionsOutput,
  SectionSchedule,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath } from "@/lib/site";

const MAX_SECTIONS = 20;
const MAX_SCHEDULES_PER_SECTION = 20;

/**
 * Three-letter weekday labels used throughout the catalog/timetable code
 * (`components/timetable/week-grid.tsx`, `lib/update/excel.ts`). The catalog's
 * `date` column holds one of these; anything else is unusable and skipped.
 */
const WEEKDAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export type ParsedSectionTime = { startTime: string; endTime: string };

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function padHours(hours: number): string {
  return String(hours).padStart(2, "0");
}

/**
 * Deterministic parser for the catalog's `time` column.
 *
 * Accepts a single `H:MM`/`HH:MM` range joined by `-`, `–`, `—` or `~`, with
 * optional surrounding whitespace, and returns zero-padded `HH:MM` bounds. Any
 * other input — empty, half a range, non-numeric, out-of-range, zero-length or
 * reversed — returns `null`; the caller then safely skips that one schedule
 * entry rather than failing the whole section list.
 */
export function parseSectionTimeRange(value: unknown): ParsedSectionTime | null {
  if (typeof value !== "string") return null;

  const compact = value.replace(/\s+/g, "");
  const match = /^(\d{1,2}):(\d{2})[-–—~](\d{1,2}):(\d{2})$/.exec(compact);
  if (match === null) return null;

  const startHours = Number(match[1]);
  const startMinutes = Number(match[2]);
  const endHours = Number(match[3]);
  const endMinutes = Number(match[4]);

  if (startHours > 23 || endHours > 23 || startMinutes > 59 || endMinutes > 59) return null;
  if (startHours * 60 + startMinutes >= endHours * 60 + endMinutes) return null;

  return {
    startTime: `${padHours(startHours)}:${match[2]}`,
    endTime: `${padHours(endHours)}:${match[4]}`,
  };
}

/** Normalize the catalog weekday; unknown/blank labels are unusable. */
export function parseWeekday(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const weekday = value.trim().toUpperCase();
  return WEEKDAYS.has(weekday) ? weekday : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Build a brand-new public schedule DTO field by field. `date` is renamed to
 * `weekday` and `time` is split; malformed entries return `null` so they can be
 * skipped. Unknown/future columns never reach the output.
 */
function projectSchedule(entry: unknown): SectionSchedule | null {
  const row = toRecord(entry);
  if (row === null) return null;

  const weekday = parseWeekday(row.date);
  if (weekday === null) return null;

  const time = parseSectionTimeRange(row.time);
  if (time === null) return null;

  return {
    weekday,
    startTime: time.startTime,
    endTime: time.endTime,
    location: readText(row.location),
  };
}

/** Build a brand-new public section DTO field by field (never spread the row). */
function projectSection(entry: unknown, courseUrl: string): CourseSection | null {
  const row = toRecord(entry);
  if (row === null) return null;

  const section = readText(row.section);
  if (section === null) return null;

  const rawSchedules = Array.isArray(row.schedules) ? row.schedules : [];
  const schedules = rawSchedules
    .map(projectSchedule)
    .filter((schedule): schedule is SectionSchedule => schedule !== null)
    .slice(0, MAX_SCHEDULES_PER_SECTION);

  return { section, schedules, courseUrl };
}

/**
 * Public section/schedule list for the MCP tool boundary.
 *
 * The only data source is the shared catalog helper (the `get_schedule_list`
 * RPC), which reads the course catalog for the current term; the user's saved
 * personal timetables are never touched. Sections and schedules are capped and
 * every object is rebuilt field by field.
 */
export async function getCourseSections(
  input: GetCourseSectionsInput,
): Promise<GetCourseSectionsOutput> {
  const entries = await getScheduleList(input.code, input.instructor);

  const courseUrl = absoluteUrl(buildCoursePath(input.code));
  const sections = (Array.isArray(entries) ? entries : [])
    .map((entry) => projectSection(entry, courseUrl))
    .filter((section): section is CourseSection => section !== null)
    .slice(0, MAX_SECTIONS);

  return {
    courseCode: input.code,
    instructor: input.instructor,
    courseUrl,
    sections,
  };
}
