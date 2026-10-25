import { McpToolError } from "@/lib/mcp/errors";
import type { AssistantCourseSectionsOutput } from "@/lib/assistant/assistant-output-schemas";
import type { CourseSection } from "@/lib/mcp/schemas";
import {
  normalizePlanSection,
  normalizeSchedule,
  normalizeSection,
  type PlanSection,
} from "@/lib/timetable/schema";

export type LoadSections = (input: {
  code: string;
  instructor: string;
}) => Promise<AssistantCourseSectionsOutput>;

export type CandidateOption = {
  section: string;
  meetings: string[];
  planSection: PlanSection;
  unsupportedMeetings: number;
};

export type CandidateResolution =
  | {
      status: "resolved";
      courseCode: string;
      instructor: string;
      options: CandidateOption[];
      sectionListComplete: boolean;
    }
  | { status: "not_found" }
  | { status: "temporarily_unavailable" };

const meetingLine = (schedule: CourseSection["schedules"][number]) => {
  const location = schedule.location?.trim();
  return `${schedule.weekday} ${schedule.startTime}-${schedule.endTime}${location ? ` ${location}` : ""}`;
};

const toCandidateOption = (
  courseCode: string,
  instructor: string,
  section: CourseSection,
): CandidateOption => {
  let unsupportedMeetings = 0;
  const rawSchedules = section.schedules.map((schedule) => ({
    date: schedule.weekday,
    time: `${schedule.startTime}-${schedule.endTime}`,
    location: schedule.location ?? "",
  }));
  for (const schedule of rawSchedules) {
    if (!normalizeSchedule(schedule)) unsupportedMeetings += 1;
  }

  return {
    section: section.section,
    meetings: section.schedules.map(meetingLine),
    planSection: normalizePlanSection({
      code: courseCode,
      prof: instructor,
      section: section.section,
      schedules: rawSchedules,
    }),
    unsupportedMeetings,
  };
};

export async function resolveCandidate(
  input: { code: string; instructor: string; section?: string },
  load: LoadSections,
): Promise<CandidateResolution> {
  try {
    const output = await load({ code: input.code, instructor: input.instructor });
    if (output.sections.length === 0) return { status: "not_found" };

    let sections = output.sections;
    if (input.section !== undefined) {
      const wanted = normalizeSection(input.section);
      sections = sections.filter((entry) => normalizeSection(entry.section) === wanted);
      if (sections.length === 0) return { status: "not_found" };
    }

    return {
      status: "resolved",
      courseCode: output.courseCode,
      instructor: output.instructor,
      options: sections.map((entry) => toCandidateOption(output.courseCode, output.instructor, entry)),
      sectionListComplete: output.sectionDataComplete,
    };
  } catch (error) {
    if (error instanceof McpToolError && error.code === "not_found") return { status: "not_found" };
    return { status: "temporarily_unavailable" };
  }
}
