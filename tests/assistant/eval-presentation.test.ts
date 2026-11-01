import { describe, expect, it } from "vitest";

import type { ToolCallRecord } from "@/evals/assistant/grade";
import { gradePresentation, summarizePresentation } from "@/evals/assistant/presentation-grade";

function present(args: Record<string, unknown>, result: Record<string, unknown>): ToolCallRecord {
  return { name: "present_response", args, result: JSON.stringify(result) };
}

function trace(caseId: string, toolCalls: ToolCallRecord[]) {
  return { caseId, toolCalls };
}

describe("gradePresentation", () => {
  it("grades omit hit, inspect hit, explain miss, and rejected-then-accepted inspect", () => {
    const omitHit = gradePresentation(
      trace("explain", [{ name: "get_course", args: { code: "CISC3014" } }]),
    );
    const inspectHit = gradePresentation(
      trace("inspect", [
        { name: "get_course", args: { code: "CISC3014" } },
        present(
          { show: [{ component: "course_detail", course: "CISC3014" }] },
          { status: "accepted", show: [{ component: "course_detail", course: "CISC3014" }] },
        ),
      ]),
    );
    const explainMiss = gradePresentation(
      trace("explain", [
        { name: "get_course", args: { code: "CISC3014" } },
        present(
          { show: [{ component: "course_detail", course: "CISC3014" }] },
          { status: "accepted", show: [{ component: "course_detail", course: "CISC3014" }] },
        ),
      ]),
    );
    const rejectedThenInspect = gradePresentation(
      trace("inspect", [
        { name: "get_course", args: { code: "CISC3014" } },
        present({ show: [{ component: "course_detail", course: "INVALID" }] }, { status: "rejected", reason: "invalid_request" }),
        present(
          { show: [{ component: "course_detail", course: "CISC3014" }] },
          { status: "accepted", show: [{ component: "course_detail", course: "CISC3014" }] },
        ),
      ]),
    );

    expect(omitHit).toEqual({
      id: "explain",
      selection: "omit",
      expected: "omit",
      hit: true,
      omitted: true,
    });
    expect(inspectHit).toEqual({
      id: "inspect",
      selection: "course_detail",
      expected: "course_detail",
      hit: true,
      omitted: false,
    });
    expect(explainMiss).toEqual({
      id: "explain",
      selection: "course_detail",
      expected: "omit",
      hit: false,
      omitted: false,
    });
    expect(rejectedThenInspect).toEqual({
      id: "inspect",
      selection: "course_detail",
      expected: "course_detail",
      hit: true,
      omitted: false,
    });

    expect(summarizePresentation([omitHit, inspectHit, explainMiss, rejectedThenInspect])).toEqual({
      cases: 4,
      hits: 3,
      omitted: 1,
      hitRate: 0.75,
    });
  });
});
