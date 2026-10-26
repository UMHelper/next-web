import type {
  DiscoveryPool,
  PoolCourse,
  PoolInstructorRow,
  PoolOffer,
} from "@/lib/assistant/discovery/pool";

const defaultCourse = (): PoolCourse => ({
  courseCode: "GEST1000",
  titleEn: "General Education",
  titleZh: "通識",
  credits: "3",
  courseType: "GE",
  suggestedYear: 1,
  faculty: "FST",
  department: "GEST",
  aka: [],
  topicTitle: "",
  topicBody: "",
});

export function poolCourse(partial: Partial<PoolCourse> = {}): PoolCourse {
  return { ...defaultCourse(), ...partial };
}

export function pwcRow(partial: Partial<PoolInstructorRow> & Pick<PoolInstructorRow, "pwcId">): PoolInstructorRow {
  return {
    courseCode: "GEST1000",
    instructor: "INSTRUCTOR A",
    reviews: 5,
    result: 4,
    grade: 3.5,
    difficulty: 3,
    reward: 3,
    ...partial,
  };
}

function parseMeetingLine(line: string): PoolOffer["meetings"][number] {
  const trimmed = line.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    return { date: trimmed, times: "", location: "" };
  }
  const date = trimmed.slice(0, space);
  const rest = trimmed.slice(space + 1).trim();
  const locationSplit = rest.match(/^(\S+-\S+(?:-\S+)?)(?:\s+(.*))?$/);
  if (locationSplit === null) {
    return { date, times: rest, location: "" };
  }
  return { date, times: locationSplit[1], location: locationSplit[2] ?? "" };
}

export function offer(pwcId: number, section: string, meetings: string[]): PoolOffer {
  return {
    pwcId,
    section,
    meetings: meetings.map(parseMeetingLine),
  };
}

export function pool(partial: Partial<DiscoveryPool> = {}): DiscoveryPool {
  return {
    term: { year: 2026, sem: 1 },
    totalMatchingCourses: 1,
    truncated: false,
    courses: [],
    instructorRows: [],
    offers: [],
    ...partial,
  };
}
