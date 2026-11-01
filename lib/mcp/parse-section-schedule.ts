const WEEKDAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export type ParsedSectionTime = { startTime: string; endTime: string };

function padHours(hours: number): string {
  return String(hours).padStart(2, "0");
}

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

export function parseWeekday(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const weekday = value.trim().toUpperCase();
  return WEEKDAYS.has(weekday) ? weekday : null;
}
