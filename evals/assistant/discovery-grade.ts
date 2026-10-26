import {
  CHECK_PLAN_CONFLICTS_TOOL_NAME,
  checkPlanConflictsResultSchema,
} from "@/lib/assistant/check-plan-conflicts";
import {
  DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
  parseDiscoverResult,
} from "@/lib/assistant/discovery/schema";

import type { ToolCallRecord, TurnTrace } from "./grade";

export type DiscoveryExpect = {
  discovery: "required" | "optional" | "forbidden";
  args?: (args: Record<string, unknown>) => boolean;
  mention?: RegExp[];
  forbid?: RegExp[];
  maxToolCalls?: number;
};

export type DiscoveryGrade = {
  caseId: string;
  repeat: number;
  turn: number;
  pass: boolean;
  checks: Record<string, boolean>;
  falseFitClaims: string[];
  toolCalls: number;
  discoveryRequired: boolean;
};

export type DiscoveryMetric = { cases: number; hits: number; rate: number };

export type DiscoverySummary = {
  turns: number;
  passed: number;
  passRate: number;
  discoveryUse: DiscoveryMetric;
  falseFitClaims: number;
  difficultyDirection: DiscoveryMetric;
  noMidtermCertainty: { violations: number };
  medianToolCalls: number;
};

const INDIVIDUAL_FIT_CLAIM =
  /no clash|doesn't clash|won't clash|without (a )?clash|conflict-free|fits (your|the) timetable|不衝突|不冲突/i;

const MUTUAL_FIT_CLAIM = /fit together|compatible with each other|互相兼容|彼此兼容/i;

const CODE_IN_SENTENCE = /\b([A-Z]{2,4}\d{4})(?:-([A-Z0-9]{1,6}))?\b/g;

export type DiscoveryGradeOptions = {
  planCodes?: readonly string[];
  plannerVersion?: string;
};

const DIFFICULTY_DIRECTION_CASES = new Set([
  "preference_conflict",
  "holdout-easy_ge",
  "holdout-easy_ge_zh",
]);

function patternsCheck(reply: string, patterns: RegExp[] | undefined, shouldMatch: boolean): boolean {
  if (patterns === undefined || patterns.length === 0) return true;
  return patterns.every((pattern) => pattern.test(reply) === shouldMatch);
}

export function discoverySucceeded(call: ToolCallRecord): boolean {
  if (call.name !== DISCOVER_COURSE_CANDIDATES_TOOL_NAME || call.result === undefined) {
    return false;
  }
  return parseDiscoverResult(call.result) !== null;
}

export function discoveryAttempted(toolCalls: readonly ToolCallRecord[]): boolean {
  return toolCalls.some((call) => call.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME);
}

function discoveryUsed(toolCalls: readonly ToolCallRecord[]): boolean {
  return toolCalls.some((call) => discoverySucceeded(call));
}

function discoveryCheck(
  toolCalls: readonly ToolCallRecord[],
  expect: DiscoveryExpect,
): boolean {
  const used = discoveryUsed(toolCalls);
  if (expect.discovery === "required") {
    if (!used) return false;
    if (expect.args !== undefined) {
      const call = toolCalls.find((entry) => entry.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME);
      if (call === undefined || !expect.args(call.args)) return false;
    }
    return true;
  }
  if (expect.discovery === "forbidden") return !used;
  return true;
}

function countToolCalls(toolCalls: readonly ToolCallRecord[]): number {
  return toolCalls.filter((call) => call.name !== "present_response").length;
}

type SectionRow = {
  fit: string;
  supportsClaim: boolean;
};

type CourseEvidence = {
  sections: Map<string, SectionRow>;
  listingComplete: boolean;
};

type FitIndex = {
  fits: Map<string, string>;
  sectionCompleteness: Map<string, boolean>;
  courses: Map<string, CourseEvidence>;
};

type ClaimSubject = { code: string; section: string | null };

function fitKey(code: string, section: string | null): string {
  return `${code}\0${section ?? ""}`;
}

function courseKey(code: string): string {
  return code.trim().toUpperCase();
}

function evidenceIsStale(evidenceVersion: string | undefined, current: string | undefined): boolean {
  if (current === undefined) return false;
  return evidenceVersion !== current;
}

function writeCourse(
  courses: Map<string, CourseEvidence>,
  code: string,
  rows: ReadonlyArray<{ section: string; fit: string }>,
  listingComplete: boolean,
  supportsClaim: boolean,
) {
  const key = courseKey(code);
  const previous = courses.get(key);
  const sections = new Map<string, SectionRow>(listingComplete ? undefined : previous?.sections);
  for (const row of rows) sections.set(row.section, { fit: row.fit, supportsClaim });
  courses.set(key, { sections, listingComplete });
}

function indexFits(courses: Map<string, CourseEvidence>): FitIndex {
  const fits = new Map<string, string>();
  const sectionCompleteness = new Map<string, boolean>();
  for (const [code, course] of courses) {
    sectionCompleteness.set(code, course.listingComplete);
    for (const [section, row] of course.sections) {
      fits.set(fitKey(code, section), row.fit);
    }
    const everySectionClear =
      course.sections.size > 0 &&
      [...course.sections.values()].every((row) => row.fit === "verified_no_clash" && row.supportsClaim);
    if (course.listingComplete && everySectionClear) {
      fits.set(fitKey(code, null), "verified_no_clash");
    }
  }
  return { fits, sectionCompleteness, courses };
}

function newestFitsFromTrace(
  toolCalls: readonly ToolCallRecord[],
  options: DiscoveryGradeOptions | undefined,
): FitIndex {
  const courses = new Map<string, CourseEvidence>();

  for (const call of toolCalls) {
    if (call.result === undefined) continue;

    if (call.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
      const parsed = parseDiscoverResult(call.result);
      if (!parsed || evidenceIsStale(parsed.timetable.plannerVersion, options?.plannerVersion)) continue;
      const examinedTruncated = parsed.examined.truncated === true;
      const supportsClaim = parsed.timetable.planComplete === true && !examinedTruncated;
      const listingDropped =
        parsed.compaction?.truncated === true || parsed.compaction?.dropped.includes("otherSections") === true;
      for (const candidate of parsed.candidates) {
        const rows = [
          { section: candidate.section, fit: candidate.fit },
          ...candidate.otherSections.map((other) => ({ section: other.section, fit: other.fit })),
        ];
        const listingComplete =
          candidate.otherSections.length === 0 && !examinedTruncated && !listingDropped;
        writeCourse(courses, candidate.courseCode, rows, listingComplete, supportsClaim);
      }
      continue;
    }

    if (call.name === CHECK_PLAN_CONFLICTS_TOOL_NAME) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(call.result);
      } catch {
        continue;
      }
      const result = checkPlanConflictsResultSchema.safeParse(parsed);
      if (!result.success || result.data.status !== "checked") continue;
      if (evidenceIsStale(result.data.plannerVersion, options?.plannerVersion)) continue;
      writeCourse(
        courses,
        result.data.courseCode,
        result.data.sections.map((section) => ({ section: section.section, fit: section.fit })),
        result.data.sectionListComplete === true,
        result.data.planComplete === true,
      );
    }
  }

  return indexFits(courses);
}

function sentences(reply: string): string[] {
  return reply
    .split(/[.!?。！？]+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripParentheticals(sentence: string): string {
  let current = sentence;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/\([^()]*\)|（[^（）]*）/g, " ");
  }
  return current;
}

function codeMatches(text: string): ClaimSubject[] {
  return [...text.matchAll(new RegExp(CODE_IN_SENTENCE.source, "g"))].map((match) => ({
    code: match[1]!.toUpperCase(),
    section: match[2] ?? null,
  }));
}

function idiomHits(text: string): Array<{ index: number; end: number; mutual: boolean }> {
  const hits: Array<{ index: number; end: number; mutual: boolean }> = [];
  const individual = text.match(INDIVIDUAL_FIT_CLAIM);
  if (individual?.index !== undefined) {
    hits.push({ index: individual.index, end: individual.index + individual[0].length, mutual: false });
  }
  const mutual = text.match(MUTUAL_FIT_CLAIM);
  if (mutual?.index !== undefined) {
    hits.push({ index: mutual.index, end: mutual.index + mutual[0].length, mutual: true });
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function claimSubjects(sentence: string): {
  codes: Array<ClaimSubject & { mutual: boolean }>;
  referenceCodes: string[];
} {
  const stripped = stripParentheticals(sentence);
  const hits = idiomHits(stripped);
  if (hits.length === 0) return { codes: [], referenceCodes: [] };

  const outside = new Set(codeMatches(stripped).map((match) => match.code));
  const referenceCodes: string[] = [];
  const seenReferences = new Set<string>();
  for (const match of codeMatches(sentence)) {
    if (outside.has(match.code) || seenReferences.has(match.code)) continue;
    seenReferences.add(match.code);
    referenceCodes.push(match.code);
  }

  const codes: Array<ClaimSubject & { mutual: boolean }> = [];
  const seenSubjects = new Map<string, ClaimSubject & { mutual: boolean }>();
  let cursor = 0;
  for (const hit of hits) {
    for (const match of codeMatches(stripped.slice(cursor, hit.index))) {
      const key = `${match.code}\0${match.section ?? ""}`;
      const existing = seenSubjects.get(key);
      if (existing) {
        existing.mutual = existing.mutual || hit.mutual;
        continue;
      }
      const subject = { ...match, mutual: hit.mutual };
      seenSubjects.set(key, subject);
      codes.push(subject);
    }
    cursor = hit.end;
  }

  return { codes, referenceCodes };
}

function claimSupported(index: FitIndex, code: string, section: string | null): boolean {
  const course = index.courses.get(code);
  if (!course) return false;
  if (section === null) {
    return index.sectionCompleteness.get(code) === true && index.fits.get(fitKey(code, null)) === "verified_no_clash";
  }
  const row = course.sections.get(section);
  return row?.fit === "verified_no_clash" && row.supportsClaim;
}

function falseFitClaimsFromTrace(
  trace: TurnTrace,
  options: DiscoveryGradeOptions | undefined,
): { falseFitClaims: string[]; referenceCodes: string[] } {
  const index = newestFitsFromTrace(trace.toolCalls, options);
  const claims = new Set<string>();
  const references = new Set<string>();

  for (const sentence of sentences(trace.reply)) {
    const claim = claimSubjects(sentence);
    for (const code of claim.referenceCodes) references.add(code);
    for (const subject of claim.codes) {
      // planCodes does not exempt a subject; only a reference position does.
      if (subject.mutual || !claimSupported(index, subject.code, subject.section)) {
        claims.add(subject.code);
      }
    }
  }

  return { falseFitClaims: [...claims], referenceCodes: [...references] };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function gradeDiscovery(
  trace: TurnTrace,
  expect: DiscoveryExpect,
  options?: DiscoveryGradeOptions,
): {
  pass: boolean;
  checks: Record<string, boolean>;
  falseFitClaims: string[];
  referenceCodes: string[];
  toolCalls: number;
} {
  const { falseFitClaims, referenceCodes } = falseFitClaimsFromTrace(trace, options);
  const toolCalls = countToolCalls(trace.toolCalls);
  const checks: Record<string, boolean> = {
    discovery: discoveryCheck(trace.toolCalls, expect),
    mention: patternsCheck(trace.reply, expect.mention, true),
    forbid: patternsCheck(trace.reply, expect.forbid, false),
    falseFitClaims: falseFitClaims.length === 0,
  };
  if (expect.maxToolCalls !== undefined) {
    checks.maxToolCalls = toolCalls <= expect.maxToolCalls;
  }
  const pass = Object.values(checks).every(Boolean);
  return { pass, checks, falseFitClaims, referenceCodes, toolCalls };
}

export function summarizeDiscovery(
  grades: readonly DiscoveryGrade[],
  _caseIds: readonly string[],
): DiscoverySummary {
  const turns = grades.length;
  const passed = grades.filter((grade) => grade.pass).length;
  const falseFitClaims = grades.reduce((sum, grade) => sum + grade.falseFitClaims.length, 0);

  const discoveryGrades = grades.filter((grade) => grade.discoveryRequired);
  const discoveryHits = discoveryGrades.filter((grade) => grade.checks.discovery === true).length;

  const difficultyGrades = grades.filter((grade) => DIFFICULTY_DIRECTION_CASES.has(grade.caseId));
  const difficultyHits = difficultyGrades.filter((grade) => grade.pass).length;

  const noMidtermCertaintyViolations = grades.filter(
    (grade) =>
      (grade.caseId === "no_midterm" || grade.caseId === "holdout-no_midterm") &&
      grade.checks.forbid === false,
  ).length;

  const discoveryToolCalls = discoveryGrades.map((grade) => grade.toolCalls);

  return {
    turns,
    passed,
    passRate: turns === 0 ? 0 : passed / turns,
    discoveryUse: {
      cases: discoveryGrades.length,
      hits: discoveryHits,
      rate: discoveryGrades.length === 0 ? 1 : discoveryHits / discoveryGrades.length,
    },
    falseFitClaims,
    difficultyDirection: {
      cases: difficultyGrades.length,
      hits: difficultyHits,
      rate: difficultyGrades.length === 0 ? 1 : difficultyHits / difficultyGrades.length,
    },
    noMidtermCertainty: { violations: noMidtermCertaintyViolations },
    medianToolCalls: median(discoveryToolCalls),
  };
}
