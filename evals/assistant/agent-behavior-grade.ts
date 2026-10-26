import { parseCourseDetailResult, GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import { planRichBlocks, type ToolCallLike } from "@/lib/assistant/presentation";
import { ALWAYS_RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import type { VisibleBlock } from "@/lib/assistant/visible-blocks";

import type { ToolCallRecord, TurnTrace } from "./grade";

export type AgentBehaviorExpect = {
  requiredTools?: string[];
  forbiddenTools?: string[];
  card: "detail" | "sections" | "none" | "any" | "none_or_any";
  maxDetailCards?: number;
  mention?: RegExp[];
  forbid?: RegExp[];
};

export type AgentBehaviorGrade = {
  caseId: string;
  repeat: number;
  turn: number;
  pass: boolean;
  checks: Record<string, boolean>;
};

export type AgentBehaviorMetric = { cases: number; hits: number; rate: number };

export type AgentBehaviorSummary = {
  turns: number;
  passed: number;
  passRate: number;
  falseCardClaim: { violations: number };
  difficultyDirection: AgentBehaviorMetric;
  noMidtermCertainty: { violations: number };
  partialFailure: AgentBehaviorMetric;
};

const FALSE_CARD_CLAIM =
  /\b(card|details?)\b[^.]{0,40}\b(above|below)\b|shown above|displayed above/i;

const DIFFICULTY_DIRECTION_CASES = new Set([
  "evaluate",
  "instructor_easier",
  "holdout-evaluate",
  "holdout-instructor_easier",
]);

function toolCallsToPlanningInput(toolCalls: readonly ToolCallRecord[]): {
  calls: ToolCallLike[];
  results: Map<string, { content?: unknown }>;
} {
  const calls: ToolCallLike[] = [];
  const results = new Map<string, { content?: unknown }>();
  for (const [index, call] of toolCalls.entries()) {
    const id = `c${index}`;
    calls.push({ id, function: { name: call.name, arguments: JSON.stringify(call.args) } });
    if (call.result !== undefined) {
      results.set(id, { content: call.result });
    }
  }
  return { calls, results };
}

function toVisibleBlock(call: ToolCallLike, content: string | undefined): VisibleBlock | null {
  if (content === undefined) return null;

  switch (call.function.name) {
    case GET_COURSE_TOOL_NAME: {
      const parsed = parseCourseDetailResult(content);
      if (parsed.kind !== "course") return null;
      return { kind: "course_detail", course: parsed.data.course.courseCode.trim().toUpperCase() };
    }
    case GET_COURSE_SECTIONS_TOOL_NAME: {
      const parsed = parseCourseSectionsResult(content);
      if (parsed.kind === "sections") {
        return {
          kind: "course_sections",
          course: parsed.data.courseCode.trim().toUpperCase(),
          instructor: parsed.data.instructor,
          sectionCount: parsed.data.sections.length,
        };
      }
      if (parsed.kind === "empty") {
        return {
          kind: "course_sections",
          course: parsed.courseCode.trim().toUpperCase(),
          instructor: parsed.instructor,
          sectionCount: 0,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export function visibleBlocksFromTrace(trace: Pick<TurnTrace, "toolCalls">): VisibleBlock[] {
  const { calls, results } = toolCallsToPlanningInput(trace.toolCalls);
  const planned = planRichBlocks(calls, results, ALWAYS_RICH_TOOL_NAMES, false);
  const callById = new Map(calls.map((entry) => [entry.id, entry]));
  const blocks: VisibleBlock[] = [];

  for (const block of planned) {
    if (block.kind === "recommendations") {
      blocks.push({ kind: "recommendations", courses: [...block.courses] });
      continue;
    }
    const call = callById.get(block.callId);
    if (!call) continue;
    const rawContent = results.get(block.callId)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;
    const visible = toVisibleBlock(call, content);
    if (visible) blocks.push(visible);
  }
  return blocks;
}

function cardCheck(blocks: readonly VisibleBlock[], expect: AgentBehaviorExpect): boolean {
  const detailCount = blocks.filter((block) => block.kind === "course_detail").length;
  const sectionCount = blocks.filter((block) => block.kind === "course_sections").length;
  if (expect.maxDetailCards !== undefined && detailCount > expect.maxDetailCards) return false;

  switch (expect.card) {
    case "none":
      return detailCount === 0 && sectionCount === 0;
    case "detail":
      return detailCount >= 1;
    case "sections":
      return sectionCount >= 1;
    case "any":
      return detailCount >= 1 || sectionCount >= 1;
    case "none_or_any":
      return true;
  }
}

function toolsCheck(toolCalls: readonly ToolCallRecord[], expect: AgentBehaviorExpect): boolean {
  const names = toolCalls.map((call) => call.name);
  if ((expect.requiredTools ?? []).some((name) => !names.includes(name))) return false;
  if ((expect.forbiddenTools ?? []).some((name) => names.includes(name))) return false;
  return true;
}

function patternsCheck(reply: string, patterns: RegExp[] | undefined, shouldMatch: boolean): boolean {
  if (patterns === undefined || patterns.length === 0) return true;
  return patterns.every((pattern) => pattern.test(reply) === shouldMatch);
}

function falseCardClaimCheck(reply: string, blocks: readonly VisibleBlock[]): boolean {
  if (!FALSE_CARD_CLAIM.test(reply)) return true;
  return blocks.some((block) => block.kind === "course_detail" || block.kind === "course_sections");
}

export function gradeAgentBehavior(
  trace: TurnTrace,
  expect: AgentBehaviorExpect,
): { pass: boolean; checks: Record<string, boolean> } {
  const blocks = visibleBlocksFromTrace(trace);
  const checks: Record<string, boolean> = {
    card: cardCheck(blocks, expect),
    tools: toolsCheck(trace.toolCalls, expect),
    mention: patternsCheck(trace.reply, expect.mention, true),
    forbid: patternsCheck(trace.reply, expect.forbid, false),
    falseCardClaim: falseCardClaimCheck(trace.reply, blocks),
  };
  if (expect.maxDetailCards !== undefined) {
    const detailCount = blocks.filter((block) => block.kind === "course_detail").length;
    checks.maxDetailCards = detailCount <= expect.maxDetailCards;
  }
  const pass = Object.values(checks).every(Boolean);
  return { pass, checks };
}

export function summarizeAgentBehavior(
  grades: readonly AgentBehaviorGrade[],
  _caseIds: readonly string[],
): AgentBehaviorSummary {
  const turns = grades.length;
  const passed = grades.filter((grade) => grade.pass).length;
  const falseCardClaimViolations = grades.filter((grade) => grade.checks.falseCardClaim === false).length;

  const difficultyGrades = grades.filter((grade) => DIFFICULTY_DIRECTION_CASES.has(grade.caseId));
  const difficultyHits = difficultyGrades.filter((grade) => grade.pass).length;

  const noMidtermCertaintyViolations = grades.filter(
    (grade) =>
      (grade.caseId === "no_midterm" || grade.caseId === "holdout-no_midterm") &&
      grade.checks.forbid === false,
  ).length;

  const partialFailureGrades = grades.filter((grade) => grade.caseId === "partial_failure");
  const partialFailureHits = partialFailureGrades.filter((grade) => grade.pass).length;

  return {
    turns,
    passed,
    passRate: turns === 0 ? 0 : passed / turns,
    falseCardClaim: { violations: falseCardClaimViolations },
    difficultyDirection: {
      cases: difficultyGrades.length,
      hits: difficultyHits,
      rate: difficultyGrades.length === 0 ? 1 : difficultyHits / difficultyGrades.length,
    },
    noMidtermCertainty: { violations: noMidtermCertaintyViolations },
    partialFailure: {
      cases: partialFailureGrades.length,
      hits: partialFailureHits,
      rate: partialFailureGrades.length === 0 ? 1 : partialFailureHits / partialFailureGrades.length,
    },
  };
}
