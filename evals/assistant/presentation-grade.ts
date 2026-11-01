import { activePresent, type PresentShow, type ToolCallLike } from "@/lib/assistant/presentation";

import type { ToolCallRecord } from "./grade";
import { PRESENTATION_CASES, type PresentationExpected } from "./presentation-cases";

export type PresentationGrade = {
  id: string;
  selection: PresentationExpected;
  expected: PresentationExpected;
  hit: boolean;
  omitted: boolean;
};

export type PresentationSummary = {
  cases: number;
  hits: number;
  omitted: number;
  hitRate: number;
};

function effectiveShow(toolCalls: readonly ToolCallRecord[]): PresentShow[] {
  const calls: ToolCallLike[] = [];
  const results = new Map<string, { content?: unknown }>();
  for (const [index, call] of toolCalls.entries()) {
    const id = `c${index}`;
    calls.push({ id, function: { name: call.name, arguments: JSON.stringify(call.args) } });
    if (call.result !== undefined) {
      results.set(id, { content: call.result });
    }
  }
  return activePresent(calls, results)?.request.show ?? [];
}

function selectionFromShow(show: PresentShow[]): PresentationExpected {
  if (show.length === 0) return "omit";
  const item = show[0];
  return item.component;
}

function showMatchesExpected(show: PresentShow[], expected: PresentationExpected, course: string | undefined): boolean {
  if (expected === "omit") return show.length === 0;
  if (course === undefined) return false;
  const normalized = course.trim().toUpperCase();
  return show.some(
    (item) => item.component === expected && item.course.trim().toUpperCase() === normalized,
  );
}

/** Effective presentation matches activePresent (sticky empty-show policy). */
export function gradePresentation(
  trace: { caseId: string; toolCalls: readonly ToolCallRecord[] },
  cases: readonly (typeof PRESENTATION_CASES)[number][] = PRESENTATION_CASES,
): PresentationGrade {
  const presentationCase = cases.find((item) => item.id === trace.caseId);
  if (!presentationCase) throw new Error(`unknown presentation case "${trace.caseId}"`);

  const resolvedShow = effectiveShow(trace.toolCalls);
  const expected = presentationCase.expected;
  const course = presentationCase.course;
  const selection = selectionFromShow(resolvedShow);
  const omitted = selection === "omit";
  const hit = showMatchesExpected(resolvedShow, expected, course);

  return { id: trace.caseId, selection, expected, hit, omitted };
}

export function summarizePresentation(grades: readonly PresentationGrade[]): PresentationSummary {
  const cases = grades.length;
  const hits = grades.filter((grade) => grade.hit).length;
  const omitted = grades.filter((grade) => grade.omitted).length;
  return { cases, hits, omitted, hitRate: cases === 0 ? 0 : hits / cases };
}
