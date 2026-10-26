import { describe, expect, it } from "vitest";

import type { ToolCallRecord, TurnTrace } from "@/evals/assistant/grade";
import {
  gradeDiscovery,
  summarizeDiscovery,
  type DiscoveryExpect,
  type DiscoveryGrade,
} from "@/evals/assistant/discovery-grade";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";

function trace(reply: string, toolCalls: ToolCallRecord[]): TurnTrace {
  return {
    caseId: "test",
    repeat: 0,
    turn: 0,
    message: "test",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls,
    runs: [],
    reply,
    ms: 0,
    runCapHit: false,
  };
}

describe("gradeDiscovery", () => {
  it("flags a false fit claim when discover fit is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { codePrefix: "GEST" } },
          result: discoverTwoCandidateResult("v-test", "incomplete"),
        },
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("allows a clash-free claim when discover fit is verified_no_clash", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { codePrefix: "GEST" } },
          result: discoverTwoCandidateResult("v-test", "verified_no_clash"),
        },
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("marks discovery required when discover_course_candidates is missing", () => {
    const graded = gradeDiscovery(trace("Here are some ideas.", []), { discovery: "required" });
    expect(graded.checks.discovery).toBe(false);
    expect(graded.pass).toBe(false);
  });

  it("counts tool calls excluding present_response", () => {
    const graded = gradeDiscovery(
      trace("Done.", [
        { name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, args: {} },
        { name: "get_course", args: { code: "GEST1006" } },
        { name: "present_response", args: {} },
      ]),
      { discovery: "required" },
    );
    expect(graded.toolCalls).toBe(2);
  });
});

describe("summarizeDiscovery", () => {
  it("computes median tool calls on discovery turns", () => {
    const grade = (toolCalls: number): DiscoveryGrade => ({
      caseId: "easy_gest",
      repeat: 0,
      turn: 0,
      pass: true,
      checks: { discovery: true, mention: true, forbid: true, maxToolCalls: true },
      falseFitClaims: [],
      toolCalls,
      discoveryRequired: true,
    });

    const summary = summarizeDiscovery([grade(1), grade(1), grade(3)], []);
    expect(summary.medianToolCalls).toBe(1);
  });

  it("counts no-midterm certainty violations on graded no_midterm turns", () => {
    const grade = (forbid: boolean): DiscoveryGrade => ({
      caseId: "no_midterm",
      repeat: 0,
      turn: 1,
      pass: forbid,
      checks: { discovery: true, mention: true, forbid, maxToolCalls: true },
      falseFitClaims: [],
      toolCalls: 2,
      discoveryRequired: true,
    });

    expect(summarizeDiscovery([grade(false)], []).noMidtermCertainty.violations).toBe(1);
    expect(summarizeDiscovery([grade(true)], []).noMidtermCertainty.violations).toBe(0);
  });
});
