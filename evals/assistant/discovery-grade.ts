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

const FALSE_FIT_CLAIM =
  /no clash|doesn't clash|won't clash|without (a )?clash|conflict-free|fits (your|the) timetable|不衝突|不冲突/i;

const CODE_IN_SENTENCE = /\b([A-Z]{2,4}\d{4})(?:-([A-Z0-9]{1,6}))?\b/g;

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

type FitKey = { code: string; section: string | null };

function fitKey(code: string, section: string | null): string {
  return `${code}\0${section ?? ""}`;
}

function pushFit(
  map: Map<string, string>,
  code: string,
  section: string,
  fit: string,
  primary = false,
) {
  const normalized = code.trim().toUpperCase();
  map.set(fitKey(normalized, section), fit);
  if (primary) {
    map.set(fitKey(normalized, null), fit);
  }
}

function newestFitsFromTrace(toolCalls: readonly ToolCallRecord[]): Map<string, string> {
  const fits = new Map<string, string>();

  for (const call of toolCalls) {
    if (call.result === undefined) continue;

    if (call.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
      const parsed = parseDiscoverResult(call.result);
      if (!parsed) continue;
      for (const candidate of parsed.candidates) {
        pushFit(fits, candidate.courseCode, candidate.section, candidate.fit, true);
        for (const other of candidate.otherSections) {
          pushFit(fits, candidate.courseCode, other.section, other.fit);
        }
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
      const sections = result.data.sections;
      const primarySection = sections.length === 1 ? sections[0]!.section : null;
      for (const section of sections) {
        pushFit(
          fits,
          result.data.courseCode,
          section.section,
          section.fit,
          primarySection !== null && section.section === primarySection,
        );
      }
    }
  }

  return fits;
}

function sentences(reply: string): string[] {
  return reply
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function falseFitClaimsFromTrace(trace: TurnTrace): string[] {
  const fits = newestFitsFromTrace(trace.toolCalls);
  const claims = new Set<string>();

  for (const sentence of sentences(trace.reply)) {
    if (!FALSE_FIT_CLAIM.test(sentence)) continue;
    for (const match of sentence.matchAll(CODE_IN_SENTENCE)) {
      const code = match[1]!;
      const section = match[2] ?? null;
      const fit =
        fits.get(fitKey(code, section)) ??
        fits.get(fitKey(code, null));
      if (fit !== "verified_no_clash") {
        claims.add(code);
      }
    }
  }

  return [...claims];
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
): { pass: boolean; checks: Record<string, boolean>; falseFitClaims: string[]; toolCalls: number } {
  const falseFitClaims = falseFitClaimsFromTrace(trace);
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
  return { pass, checks, falseFitClaims, toolCalls };
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
