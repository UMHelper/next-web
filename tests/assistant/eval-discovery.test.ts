import { describe, expect, it } from "vitest";

import {
  CASE_SET_VERSION,
  DISCOVERY_CASE_SETS,
  buildDiscoveryEvalPayload,
  discoveryEvalStamp,
  discoveryPassThreshold,
  resolveDiscoveryCaseSetId,
} from "@/evals/assistant/discovery-case-sets";
import {
  DISCOVERY_CASES,
  DISCOVERY_CASES_V1,
  DISCOVERY_CASES_V2,
} from "@/evals/assistant/discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE } from "@/evals/assistant/discovery-fixture";
import {
  gradeDiscovery,
  summarizeDiscovery,
  type DiscoveryGrade,
} from "@/evals/assistant/discovery-grade";
import {
  DISCOVERY_HOLDOUT_CASES,
  DISCOVERY_HOLDOUT_CASES_V1,
} from "@/evals/assistant/discovery-holdout-cases";
import type { ToolCallRecord, TurnTrace } from "@/evals/assistant/grade";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";

const FROZEN_HOLDOUT_V1 = [
  {
    id: "holdout-easy_ge",
    messages: ["Any chill GEST classes that aren't early mornings?"],
  },
  {
    id: "holdout-history_ge",
    messages: ["Got a GE about Macau history or Chinese heritage?"],
  },
  {
    id: "holdout-first_year_cs",
    messages: ["I'm a year-one student—what CIS intro courses are offered?"],
  },
  {
    id: "holdout-constraints_zh",
    messages: ["幫我搵通識課：不要十點前上堂、不要星期五，同我時間表唔好衝突。"],
  },
  {
    id: "holdout-no_midterm",
    messages: ["I'd rather skip courses with midterms—any easy GEST picks?"],
  },
  {
    id: "holdout-fill_credits_zh",
    messages: ["我还差学分，有没有三门学分的课可以推荐？"],
  },
] as const;

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

  it("does not count an unavailable-tool attempt as discovery use", () => {
    const graded = gradeDiscovery(
      trace("Trying.", [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { courseType: "GE" } },
          result: "Error: Model tried to call unavailable tool",
        },
      ]),
      { discovery: "required" },
    );
    expect(graded.checks.discovery).toBe(false);
  });

  it("allows a code-only clash-free claim backed by check_plan_conflicts", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable.", [
        {
          name: "check_plan_conflicts",
          args: { courseCode: "GEST1006", section: "002" },
          result: JSON.stringify({
            status: "checked",
            courseCode: "GEST1006",
            instructor: "WONG",
            plan: { name: "Plan", term: "2026/2027 AY Sem 1" },
            planComplete: true,
            unscheduled: [],
            sectionListComplete: true,
            plannerVersion: "v-test",
            sections: [
              {
                section: "002",
                meetings: ["TUE 11:30-12:45"],
                conflicts: [],
                complete: true,
                fit: "verified_no_clash",
              },
            ],
          }),
        },
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
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

describe("discovery case registry", () => {
  it("resolves separate v1 and v2 dev sets and a frozen holdout", () => {
    expect(DISCOVERY_CASES_V1.map((evalCase) => evalCase.id)).toEqual([
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_candidates",
      "planner_change",
      "no_midterm",
    ]);
    expect(DISCOVERY_CASES_V2.map((evalCase) => evalCase.id)).toEqual([
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_candidates_invalid_window",
      "no_candidates",
      "planner_change",
      "no_midterm",
      "factual_lookup",
      "catalog_browse",
    ]);
    expect(new Set(DISCOVERY_CASES_V2.map((evalCase) => evalCase.id)).size).toBe(DISCOVERY_CASES_V2.length);
    expect(DISCOVERY_CASES).toBe(DISCOVERY_CASES_V2);
    expect(DISCOVERY_CASES_V2).not.toBe(DISCOVERY_CASES_V1);

    expect(Object.keys(DISCOVERY_CASE_SETS)).toEqual(["dev-v1", "dev-v2", "holdout-v1"]);
    expect(CASE_SET_VERSION).toBe("b2-v2");
    expect(DISCOVERY_CASE_SETS["dev-v1"]).toBe(DISCOVERY_CASES_V1);
    expect(DISCOVERY_CASE_SETS["dev-v2"]).toBe(DISCOVERY_CASES_V2);
    expect(DISCOVERY_CASE_SETS["holdout-v1"]).toBe(DISCOVERY_HOLDOUT_CASES_V1);
    expect(DISCOVERY_HOLDOUT_CASES_V1).toBe(DISCOVERY_HOLDOUT_CASES);
    expect(
      DISCOVERY_HOLDOUT_CASES_V1.map((evalCase) => ({
        id: evalCase.id,
        messages: evalCase.turns.map((turn) => turn.message),
      })),
    ).toEqual(FROZEN_HOLDOUT_V1);

    const unchangedIds = [
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_midterm",
    ];
    for (const id of unchangedIds) {
      const v1Case = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === id);
      const v2Case = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === id);
      expect(v2Case).toEqual(v1Case);
      expect(v2Case).not.toBe(v1Case);
      expect(v2Case?.turns).not.toBe(v1Case?.turns);
      expect(v2Case?.turns[0]).not.toBe(v1Case?.turns[0]);
    }
  });

  it("keeps the contradictory window on v1 and splits it from the valid evening search on v2", () => {
    const v1Empty = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === "no_candidates");
    expect(v1Empty?.turns[0]?.message).toBe(
      "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
    );
    expect(v1Empty?.turns[0]?.expect.discovery).toBe("required");
    expect(
      v1Empty?.turns[0]?.expect.args?.({ required: { startAfter: "18:00", endBefore: "08:00" } }),
    ).toBe(true);

    const invalid = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "no_candidates_invalid_window");
    expect(invalid?.pathname).toBe("/");
    expect(invalid?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(invalid?.why).toBe("spec §13; no_candidates dev r0/r1");
    expect(invalid?.turns).toHaveLength(1);
    expect(invalid?.turns[0]?.message).toBe(
      "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
    );
    expect(invalid?.turns[0]?.expect.discovery).toBe("optional");
    expect(invalid?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(invalid?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      [
        "can(?:'|no)t (?:both )?hold|contradict|impossible|no (class|section|course)|window is empty",
        "i",
      ],
    ]);
    expect(invalid?.turns[0]?.expect.forbid?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["shortlist|top \\d|here are (?:the |some )?(?:courses|options|candidates|picks)", "i"],
    ]);
    expect(
      invalid?.turns[0]?.expect.args?.({ required: { startAfter: "18:00", endBefore: "08:00" } }),
    ).toBe(true);
    expect(invalid?.turns[0]?.expect.args?.({ required: { startAfter: "18:00" } })).toBe(false);

    const unsatisfiable = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "no_candidates");
    expect(unsatisfiable?.pathname).toBe("/");
    expect(unsatisfiable?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(unsatisfiable?.why).toBe("spec §4 scenario G; dev r2 behaviour");
    expect(unsatisfiable?.turns).toHaveLength(1);
    expect(unsatisfiable?.turns[0]?.message).toBe(
      "I need a GEST course whose meetings all start after 18:00.",
    );
    expect(unsatisfiable?.turns[0]?.expect.discovery).toBe("required");
    expect(unsatisfiable?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(unsatisfiable?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["no [^.!?]{0,30}(course|class|section|option)|nothing (matches|fits)|none", "i"],
    ]);
    expect(unsatisfiable?.turns[0]?.expect.forbid).toBeUndefined();
    const eveningArgs = unsatisfiable?.turns[0]?.expect.args;
    expect(eveningArgs?.({ required: { startAfter: "18:00" } })).toBe(true);
    expect(eveningArgs?.({ scope: { codePrefix: "GEST" }, required: { startAfter: "18:00" } })).toBe(true);
    expect(eveningArgs?.({ required: { startAfter: "18:00", endBefore: "21:00" } })).toBe(true);
    expect(eveningArgs?.({ required: { startAfter: "18:00", endBefore: "08:00" } })).toBe(false);
    expect(eveningArgs?.({ required: { startAfter: "10:00" } })).toBe(false);
    expect(eveningArgs?.({ required: { endBefore: "08:00" } })).toBe(false);
    expect(eveningArgs?.({})).toBe(false);
  });

  it("makes the planner re-check optional and appends the lookup and browse guards", () => {
    const v1Planner = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === "planner_change");
    const v2Planner = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "planner_change");
    expect(v2Planner?.why).toBe(v1Planner?.why);
    expect(v2Planner?.pathname).toBe(v1Planner?.pathname);
    expect(v2Planner?.timetable).toBe(v1Planner?.timetable);
    expect(v2Planner?.turns.map((turn) => turn.message)).toEqual(v1Planner?.turns.map((turn) => turn.message));
    expect(v2Planner?.turns[0]?.expect).toEqual(v1Planner?.turns[0]?.expect);
    expect(v2Planner?.turns[1]?.expect).toEqual(v1Planner?.turns[1]?.expect);
    expect(v1Planner?.turns[2]?.expect.discovery).toBe("required");
    expect(v2Planner?.turns[2]?.timetable).toBe(v1Planner?.turns[2]?.timetable);
    expect(v2Planner?.turns[2]?.expect.discovery).toBe("optional");
    expect(v2Planner?.turns[2]?.expect.maxToolCalls).toBe(3);
    expect(v2Planner?.turns[2]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["re-?check|again|updated|current plan", "i"],
    ]);

    const factual = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "factual_lookup");
    expect(factual?.pathname).toBe("/");
    expect(factual?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(factual?.why).toBe("mission §3/§8; over-selection risk of the new contract");
    expect(factual?.turns).toEqual([
      {
        message: "How many credits is CISC1001?",
        expect: { discovery: "forbidden", maxToolCalls: 2 },
      },
    ]);

    const browse = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "catalog_browse");
    expect(browse?.pathname).toBe("/");
    expect(browse?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(browse?.why).toBe("amendment 1: browsing must stay cheap");
    expect(browse?.turns[0]?.message).toBe("List all first-year CIS courses.");
    expect(browse?.turns[0]?.expect.discovery).toBe("optional");
    expect(browse?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(browse?.turns[0]?.expect.args).toBeUndefined();
    expect(browse?.turns[0]?.expect.forbid).toBeUndefined();
    expect(browse?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["CISC100[123]", ""],
    ]);
  });
});

describe("discoveryEvalStamp", () => {
  it("stamps rubricVersion and caseSetId on settings and the payload", () => {
    const stamp = discoveryEvalStamp({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      caseSetId: "dev-v2",
    });

    expect(stamp.rubricVersion).toBe("b2-v2");
    expect(stamp.caseSetId).toBe("dev-v2");
    expect(stamp.settings).toEqual({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
    });
    expect(discoveryEvalStamp({
      model: "test-model",
      thinking: "low",
      maxOutputTokens: 400,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: true,
      mode: "baseline",
      caseSetId: "holdout-v1",
    }).settings.caseSetId).toBe("holdout-v1");
  });

  it("builds the artifact written to disk with rubricVersion and caseSetId", () => {
    const summary = {
      turns: 1,
      passed: 1,
      passRate: 1,
      discoveryUse: { cases: 1, hits: 1, rate: 1 },
      falseFitClaims: 0,
      difficultyDirection: { cases: 0, hits: 0, rate: 1 },
      noMidtermCertainty: { violations: 0 },
      medianToolCalls: 1,
    };
    const payload = buildDiscoveryEvalPayload({
      label: "run",
      suite: "dev",
      caseSetId: "dev-v2",
      settings: {
        model: "test-model",
        thinking: "off",
        maxOutputTokens: 1200,
        maxSteps: 8,
        prompt: "prompt-fp",
        eval: "eval-fp",
        noDiscovery: false,
        mode: "with_discovery",
      },
      repeats: 1,
      stepBudget: 200,
      stepsUsed: 4,
      complete: true,
      expectedTurns: 1,
      stoppedEarly: undefined,
      summary,
      failures: [],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 1,
      discoverySuccesses: 1,
      grades: [],
      traces: [],
    });

    expect(payload).toMatchObject({
      kind: "discovery",
      label: "run",
      suite: "dev",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
      repeats: 1,
      stepBudget: 200,
      stepsUsed: 4,
      complete: true,
      expectedTurns: 1,
      stoppedEarly: undefined,
      failures: [],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 1,
      discoverySuccesses: 1,
      grades: [],
      traces: [],
    });
    expect(payload.summary).toBe(summary);
    expect(payload.settings).toEqual({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
    });

    const holdout = buildDiscoveryEvalPayload({
      label: "holdout-run",
      suite: "holdout",
      caseSetId: "holdout-v1",
      settings: {
        model: "test-model",
        thinking: "low",
        maxOutputTokens: 400,
        maxSteps: 8,
        prompt: "prompt-fp",
        eval: "eval-fp",
        noDiscovery: true,
        mode: "baseline",
      },
      repeats: 1,
      stepBudget: 10,
      stepsUsed: 0,
      complete: false,
      expectedTurns: 2,
      stoppedEarly: "budget",
      summary,
      failures: ["miss"],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 0,
      discoverySuccesses: 0,
      grades: [],
      traces: [],
    });
    expect(holdout.rubricVersion).toBe(CASE_SET_VERSION);
    expect(holdout.caseSetId).toBe("holdout-v1");
    expect(holdout.settings.rubricVersion).toBe("b2-v2");
    expect(holdout.settings.caseSetId).toBe("holdout-v1");
    expect(holdout.settings.noDiscovery).toBe(true);
    expect(holdout.stoppedEarly).toBe("budget");
  });

  it("selects the case set from ASSISTANT_EVAL_CASE_SET, otherwise holdout or dev-v2", () => {
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_CASE_SET: "dev-v1", ASSISTANT_EVAL_SUITE: "holdout" })).toBe(
      "dev-v1",
    );
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "holdout" })).toBe("holdout-v1");
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "dev" })).toBe("dev-v2");
    expect(resolveDiscoveryCaseSetId({})).toBe("dev-v2");
    expect(() => resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "nope" })).toThrow(
      'unknown ASSISTANT_EVAL_SUITE "nope"',
    );
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_CASE_SET: "dev-v3" })).toBe("dev-v3");
    expect(discoveryPassThreshold("holdout-v1")).toBe(0.75);
    expect(discoveryPassThreshold("dev-v2")).toBe(0.8);
    expect(discoveryPassThreshold("dev-v1")).toBe(0.8);
  });
});
