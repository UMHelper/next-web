import type { Meeting } from "@/lib/assistant/discovery/constraints";
import type { DiscoveryPool, PoolInstructorRow, PoolOffer } from "@/lib/assistant/discovery/pool";
import { parseSectionTimeRange, parseWeekday } from "@/lib/mcp/parse-section-schedule";
import {
  normalizeCourseCode,
  normalizePlanSection,
  normalizeSection,
  type PlanSection,
} from "@/lib/timetable/schema";

export type SectionCandidate = {
  courseCode: string;
  section: string;
  label: string;
  instructors: PoolInstructorRow[];
  meetings: Meeting[];
  meetingLines: string[];
  meetingsComplete: boolean;
  planSection: PlanSection;
};

type ParsedSlot = {
  meeting: Meeting;
  line: string;
  location: string;
  plannerSupported: boolean;
};

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function meetingSortKey(slot: ParsedSlot): string {
  const dayIndex = WEEKDAY_ORDER.indexOf(slot.meeting.day as (typeof WEEKDAY_ORDER)[number]);
  const dayRank = dayIndex === -1 ? WEEKDAY_ORDER.length : dayIndex;
  return `${String(dayRank).padStart(2, "0")}|${slot.meeting.start}|${slot.meeting.end}|${slot.line}`;
}

function readLocation(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseOfferMeeting(raw: PoolOffer["meetings"][number]): ParsedSlot | null {
  const weekday = parseWeekday(raw.date);
  const time = parseSectionTimeRange(raw.times);
  if (weekday === null || time === null) return null;

  const location = readLocation(raw.location);
  const meeting: Meeting = {
    day: weekday as Meeting["day"],
    start: time.startTime,
    end: time.endTime,
  };
  const line = `${weekday} ${time.startTime}-${time.endTime}${location ? ` ${location}` : ""}`;
  const plannerSupported = weekday !== "SAT" && weekday !== "SUN";
  return { meeting, line, location, plannerSupported };
}

function compareCandidates(a: SectionCandidate, b: SectionCandidate): number {
  const code = normalizeCourseCode(a.courseCode).localeCompare(normalizeCourseCode(b.courseCode));
  if (code !== 0) return code;
  return normalizeSection(a.section).localeCompare(normalizeSection(b.section));
}

function buildFromGroup(
  courseCode: string,
  section: string,
  offers: PoolOffer[],
  instructorByPwcId: Map<number, PoolInstructorRow>,
): SectionCandidate | null {
  const normalizedSection = normalizeSection(section);
  const normalizedCode = normalizeCourseCode(courseCode);

  const instructors: PoolInstructorRow[] = [];
  const seenPwc = new Set<number>();
  const slotByLine = new Map<string, ParsedSlot>();
  let droppedMeeting = false;
  let hasEmptyOffer = false;
  let hasUnsupportedDay = false;

  for (const entry of offers) {
    const instructor = instructorByPwcId.get(entry.pwcId);
    if (instructor === undefined) continue;

    if (!seenPwc.has(entry.pwcId)) {
      seenPwc.add(entry.pwcId);
      instructors.push(instructor);
    }

    if (entry.meetings.length === 0) {
      hasEmptyOffer = true;
      continue;
    }

    for (const raw of entry.meetings) {
      const parsed = parseOfferMeeting(raw);
      if (parsed === null) {
        droppedMeeting = true;
        continue;
      }
      if (!parsed.plannerSupported) hasUnsupportedDay = true;
      slotByLine.set(parsed.line, parsed);
    }
  }

  if (instructors.length === 0) return null;

  instructors.sort((left, right) => left.pwcId - right.pwcId);

  const slots = [...slotByLine.values()].sort((left, right) =>
    meetingSortKey(left).localeCompare(meetingSortKey(right)),
  );
  const meetings = slots.map((slot) => slot.meeting);
  const meetingLines = slots.map((slot) => slot.line);

  let meetingsComplete = true;
  if (meetings.length === 0 || droppedMeeting || hasEmptyOffer || hasUnsupportedDay) {
    meetingsComplete = false;
  }

  const primaryInstructor = instructors[0]!;
  const planSection = normalizePlanSection({
    code: normalizedCode,
    prof: primaryInstructor.instructor,
    section: normalizedSection,
    schedules: slots
      .filter((slot) => slot.plannerSupported)
      .map((slot) => ({
        date: slot.meeting.day,
        time: `${slot.meeting.start}-${slot.meeting.end}`,
        location: slot.location,
      })),
  });

  return {
    courseCode: normalizedCode,
    section: normalizedSection,
    label: `${normalizedCode}-${normalizedSection}`,
    instructors,
    meetings,
    meetingLines,
    meetingsComplete,
    planSection,
  };
}

export function buildSectionCandidates(pool: DiscoveryPool): SectionCandidate[] {
  const instructorByPwcId = new Map<number, PoolInstructorRow>();
  for (const row of pool.instructorRows) {
    instructorByPwcId.set(row.pwcId, row);
  }

  const groups = new Map<string, { courseCode: string; section: string; offers: PoolOffer[] }>();

  for (const entry of pool.offers) {
    const instructor = instructorByPwcId.get(entry.pwcId);
    if (instructor === undefined) continue;

    const key = `${normalizeCourseCode(instructor.courseCode)}|${normalizeSection(entry.section)}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        courseCode: instructor.courseCode,
        section: entry.section,
        offers: [entry],
      });
      continue;
    }
    existing.offers.push(entry);
  }

  const candidates: SectionCandidate[] = [];
  for (const group of groups.values()) {
    const candidate = buildFromGroup(group.courseCode, group.section, group.offers, instructorByPwcId);
    if (candidate !== null) candidates.push(candidate);
  }

  candidates.sort(compareCandidates);
  return candidates;
}
