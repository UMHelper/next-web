import { executePresentResponse, type PresentShow } from "@/lib/assistant/presentation";

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

function resultRejected(content: string): boolean {
  try {
    const body = JSON.parse(content) as unknown;
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      return (body as { status?: unknown }).status === "rejected";
    }
  } catch {
    // not a structured rejection payload
  }
  return false;
}

function acceptedShow(call: ToolCallRecord): PresentShow[] | null {
  if (call.name !== "present_response") return null;
  const parsed = executePresentResponse(call.args);
  if (parsed.status === "rejected") return null;
  if (call.result !== undefined && resultRejected(call.result)) return null;
  return parsed.show;
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

/** The last accepted present_response is the selection. A missing or rejected call is omit. */
export function gradePresentation(trace: { caseId: string; toolCalls: readonly ToolCallRecord[] }): PresentationGrade {
  const presentationCase = PRESENTATION_CASES.find((item) => item.id === trace.caseId);
  if (!presentationCase) throw new Error(`unknown presentation case "${trace.caseId}"`);

  let show: PresentShow[] | null = null;
  for (const call of trace.toolCalls) {
    const accepted = acceptedShow(call);
    if (accepted !== null) show = accepted;
  }

  const expected = presentationCase.expected;
  const course = presentationCase.course;
  const resolvedShow = show ?? [];
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
