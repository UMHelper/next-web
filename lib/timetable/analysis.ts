import {
  detectScheduleConflicts,
  minutesToTime,
  timeToMinutes,
} from "@/lib/timetable/conflicts";
import type { PlanSection, Weekday } from "@/lib/timetable/schema";

export const DAY_PARTS = {
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "12:00", end: "18:00" },
  evening: { start: "18:00", end: "22:00" },
} as const;

export type DayPart = keyof typeof DAY_PARTS;

export type AnalyzedMeeting = {
  sectionKey: string;
  label: string;
  courseCode: string;
  section: string;
  prof: string;
  courseTitle?: string;
  day: Weekday;
  start: string;
  end: string;
  location: string;
};

export type AnalyzedConflict = {
  day: Weekday;
  a: string;
  b: string;
  aTime: string;
  bTime: string;
  overlap: string;
};

export type DayGap = { start: string; end: string; minutes: number };

export type DaySummary = {
  day: Weekday;
  meetings: AnalyzedMeeting[];
  first: string | null;
  last: string | null;
  classMinutes: number;
  gaps: DayGap[];
  parts: Record<DayPart, "free" | "busy">;
};

export type TimetableAnalysis = {
  courseCount: number;
  sectionCount: number;
  meetingCount: number;
  credits: number;
  days: DaySummary[];
  conflicts: AnalyzedConflict[];
  unscheduled: string[];
  partial: string[];
  complete: boolean;
  earliest: { day: Weekday; time: string; label: string } | null;
  latestEnd: { day: Weekday; time: string; label: string } | null;
  busiestDays: Weekday[];
  duplicatesRemoved: number;
};

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

const fnv1a32 = (input: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export const sectionLabel = (section: Pick<PlanSection, "courseCode" | "section">) =>
  `${section.courseCode}-${section.section}`;

const dedupeMeetings = (schedules: PlanSection["schedules"]) => {
  const kept: PlanSection["schedules"] = [];
  const indexByKey = new Map<string, number>();
  let removed = 0;

  for (const schedule of schedules) {
    const key = `${schedule.date}|${schedule.time}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      removed += 1;
      if (!kept[existingIndex].location && schedule.location) {
        kept[existingIndex] = { ...kept[existingIndex], location: schedule.location };
      }
      continue;
    }
    indexByKey.set(key, kept.length);
    kept.push(schedule);
  }

  return { schedules: kept, removed };
};

export const dedupeSections = (sections: PlanSection[]) => {
  const kept: PlanSection[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const section of sections) {
    if (seen.has(section.key)) {
      removed += 1;
      continue;
    }
    seen.add(section.key);
    const meetings = dedupeMeetings(section.schedules);
    removed += meetings.removed;
    kept.push({ ...section, schedules: meetings.schedules });
  }

  return { sections: kept, removed };
};

const splitTime = (time: string) => {
  const [start, end] = time.split("-");
  return { start, end };
};

const mergeIntervals = (intervals: { start: number; end: number }[]) => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }
  return merged;
};

const meetingOverlapsPart = (start: number, end: number, part: DayPart) => {
  const partStart = timeToMinutes(DAY_PARTS[part].start);
  const partEnd = timeToMinutes(DAY_PARTS[part].end);
  return start < partEnd && end > partStart;
};

const overlapWindow = (aTime: string, bTime: string) => {
  const a = splitTime(aTime);
  const b = splitTime(bTime);
  const start = Math.max(timeToMinutes(a.start), timeToMinutes(b.start));
  const end = Math.min(timeToMinutes(a.end), timeToMinutes(b.end));
  return `${minutesToTime(start)}-${minutesToTime(end)}`;
};

const toAnalyzedMeeting = (section: PlanSection, day: Weekday, time: string, location: string) => {
  const { start, end } = splitTime(time);
  return {
    sectionKey: section.key,
    label: sectionLabel(section),
    courseCode: section.courseCode,
    section: section.section,
    prof: section.prof,
    courseTitle: section.courseTitle,
    day,
    start,
    end,
    location,
  };
};

export const analyzeTimetable = (
  sections: PlanSection[],
  options?: { partial?: string[] },
): TimetableAnalysis => {
  const { sections: deduped, removed: duplicatesRemoved } = dedupeSections(sections);
  const partial = options?.partial ?? [];

  const unscheduled = deduped
    .filter((section) => section.schedules.length === 0)
    .map(sectionLabel)
    .sort();

  const meetingsByDay = new Map<Weekday, AnalyzedMeeting[]>();
  for (const day of WEEKDAYS) meetingsByDay.set(day, []);

  for (const section of deduped) {
    for (const schedule of section.schedules) {
      meetingsByDay.get(schedule.date)?.push(
        toAnalyzedMeeting(section, schedule.date, schedule.time, schedule.location),
      );
    }
  }

  const days: DaySummary[] = WEEKDAYS.map((day) => {
    const meetings = [...(meetingsByDay.get(day) ?? [])].sort((a, b) => {
      const byStart = a.start.localeCompare(b.start);
      return byStart !== 0 ? byStart : a.label.localeCompare(b.label);
    });

    const intervals = meetings.map((meeting) => ({
      start: timeToMinutes(meeting.start),
      end: timeToMinutes(meeting.end),
    }));
    const merged = mergeIntervals(intervals);
    const classMinutes = merged.reduce((sum, interval) => sum + interval.end - interval.start, 0);

    const gaps: DayGap[] = [];
    for (let index = 0; index < merged.length - 1; index += 1) {
      const start = merged[index].end;
      const end = merged[index + 1].start;
      if (end > start) {
        gaps.push({
          start: minutesToTime(start),
          end: minutesToTime(end),
          minutes: end - start,
        });
      }
    }

    const parts = (Object.keys(DAY_PARTS) as DayPart[]).reduce(
      (acc, part) => {
        const busy = meetings.some((meeting) =>
          meetingOverlapsPart(
            timeToMinutes(meeting.start),
            timeToMinutes(meeting.end),
            part,
          ),
        );
        acc[part] = busy ? "busy" : "free";
        return acc;
      },
      {} as Record<DayPart, "free" | "busy">,
    );

    return {
      day,
      meetings,
      first: meetings[0]?.start ?? null,
      last: meetings[meetings.length - 1]?.end ?? null,
      classMinutes,
      gaps,
      parts,
    };
  });

  const conflicts = detectScheduleConflicts(deduped).map((conflict) => ({
    day: conflict.date,
    a: sectionLabel(conflict.a),
    b: sectionLabel(conflict.b),
    aTime: conflict.aTime,
    bTime: conflict.bTime,
    overlap: overlapWindow(conflict.aTime, conflict.bTime),
  }));

  let earliest: TimetableAnalysis["earliest"] = null;
  let latestEnd: TimetableAnalysis["latestEnd"] = null;

  for (const day of days) {
    for (const meeting of day.meetings) {
      if (
        !earliest ||
        meeting.start < earliest.time ||
        (meeting.start === earliest.time &&
          (WEEKDAYS.indexOf(meeting.day) < WEEKDAYS.indexOf(earliest.day) ||
            (meeting.day === earliest.day && meeting.label < earliest.label)))
      ) {
        earliest = { day: meeting.day, time: meeting.start, label: meeting.label };
      }
      if (
        !latestEnd ||
        meeting.end > latestEnd.time ||
        (meeting.end === latestEnd.time &&
          (WEEKDAYS.indexOf(meeting.day) > WEEKDAYS.indexOf(latestEnd.day) ||
            (meeting.day === latestEnd.day && meeting.label > latestEnd.label)))
      ) {
        latestEnd = { day: meeting.day, time: meeting.end, label: meeting.label };
      }
    }
  }

  const maxClassMinutes = Math.max(...days.map((day) => day.classMinutes), 0);
  const busiestDays =
    maxClassMinutes === 0
      ? []
      : days.filter((day) => day.classMinutes === maxClassMinutes).map((day) => day.day);

  const meetingCount = deduped.reduce((sum, section) => sum + section.schedules.length, 0);
  const courseCount = new Set(deduped.map((section) => section.courseCode)).size;
  const credits = deduped.reduce((sum, section) => sum + (section.credits ?? 0), 0);

  return {
    courseCount,
    sectionCount: deduped.length,
    meetingCount,
    credits,
    days,
    conflicts,
    unscheduled,
    partial: [...partial],
    complete: unscheduled.length === 0 && partial.length === 0,
    earliest,
    latestEnd,
    busiestDays,
    duplicatesRemoved,
  };
};

export const timetableVersion = (sections: PlanSection[]): string => {
  const sorted = [...sections].sort((a, b) => a.key.localeCompare(b.key));
  let payload = "";
  for (const section of sorted) {
    payload += section.key;
    const schedules = [...section.schedules].sort((a, b) =>
      `${a.date}|${a.time}|${a.location}`.localeCompare(`${b.date}|${b.time}|${b.location}`),
    );
    for (const schedule of schedules) {
      payload += `${schedule.date}|${schedule.time}|${schedule.location}`;
    }
  }
  return fnv1a32(payload).toString(16).padStart(8, "0");
};
