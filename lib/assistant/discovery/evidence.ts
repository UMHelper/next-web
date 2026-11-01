import {
  DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
  parseDiscoverResult,
  type DiscoveryFit,
} from "@/lib/assistant/discovery/schema";
import { type ToolCallLike, toolMessageContent } from "@/lib/assistant/presentation";
import type { CatalogCourse } from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath } from "@/lib/site";

export type DiscoverySectionEvidence = {
  courseCode: string;
  section: string;
  meetings: string[];
  fit: DiscoveryFit;
  plannerVersion: string | null;
  clashWith: string[];
};

export type DiscoveryCourseEvidence = {
  course: CatalogCourse;
  bestSection: string;
  sections: Map<string, DiscoverySectionEvidence>;
};

function splitMeetings(raw: string | readonly string[]): string[] {
  if (typeof raw !== "string") return [...raw];
  return raw
    .split("; ")
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);
}

function catalogCourseFromCandidate(candidate: {
  courseCode: string;
  titleEn: string | null;
  titleZh: string | null;
  credits: number;
}): CatalogCourse {
  const code = candidate.courseCode.trim().toUpperCase();
  return {
    courseCode: code,
    titleEn: candidate.titleEn,
    titleZh: candidate.titleZh,
    faculty: null,
    department: null,
    credits: String(candidate.credits),
    isOffered: true,
    aka: [],
    url: absoluteUrl(buildCoursePath(code)),
  };
}

function sectionEvidenceFromCandidate(
  courseCode: string,
  section: string,
  meetings: string | readonly string[],
  fit: DiscoveryFit,
  plannerVersion: string | null,
  clashes: Array<{ with: string }> | undefined,
): DiscoverySectionEvidence {
  return {
    courseCode: courseCode.trim().toUpperCase(),
    section,
    meetings: splitMeetings(meetings),
    fit,
    plannerVersion,
    clashWith: (clashes ?? []).map((entry) => entry.with),
  };
}

function courseEvidenceFromDiscoverResult(
  parsed: NonNullable<ReturnType<typeof parseDiscoverResult>>,
): Map<string, DiscoveryCourseEvidence> {
  const plannerVersion = parsed.timetable.plannerVersion ?? null;
  const byCourse = new Map<string, DiscoveryCourseEvidence>();

  for (const candidate of parsed.candidates) {
    const code = candidate.courseCode.trim().toUpperCase();
    const sections = new Map<string, DiscoverySectionEvidence>();
    sections.set(
      candidate.section,
      sectionEvidenceFromCandidate(
        code,
        candidate.section,
        candidate.meetings,
        candidate.fit,
        plannerVersion,
        candidate.clashes,
      ),
    );
    for (const other of candidate.otherSections) {
      sections.set(
        other.section,
        sectionEvidenceFromCandidate(
          code,
          other.section,
          other.meetings,
          other.fit,
          plannerVersion,
          other.clashes,
        ),
      );
    }
    byCourse.set(code, {
      course: catalogCourseFromCandidate(candidate),
      bestSection: candidate.section,
      sections,
    });
  }

  return byCourse;
}

export function discoveryEvidenceFromCalls(
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): Map<string, DiscoveryCourseEvidence> {
  const evidence = new Map<string, DiscoveryCourseEvidence>();

  for (const call of calls) {
    if (call.function.name !== DISCOVER_COURSE_CANDIDATES_TOOL_NAME) continue;
    const content = toolMessageContent(results.get(call.id)?.content);
    const parsed = parseDiscoverResult(content);
    if (!parsed) continue;
    for (const [code, entry] of courseEvidenceFromDiscoverResult(parsed)) {
      evidence.set(code, entry);
    }
  }

  return evidence;
}

export function sectionsByCourseFromDiscoverContent(content: string | undefined): Record<string, string[]> | null {
  const parsed = parseDiscoverResult(content);
  if (!parsed) return null;
  const sectionsByCourse: Record<string, string[]> = {};
  for (const candidate of parsed.candidates) {
    const code = candidate.courseCode.trim().toUpperCase();
    sectionsByCourse[code] = [
      candidate.section,
      ...candidate.otherSections.map((entry) => entry.section),
    ];
  }
  return sectionsByCourse;
}
