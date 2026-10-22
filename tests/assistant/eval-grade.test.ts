import { describe, expect, it } from "vitest";

import {
  gradeTurn,
  summarize,
  type StepMetrics,
  type ToolCallRecord,
  type TurnExpectation,
  type TurnTrace,
} from "@/evals/assistant/grade";

const CODES = ["CISC2001", "CISC3014"];
const COURSE = { destination: "course", code: "CISC3014" };
const COURSE_PATH = "/course/CISC3014";

const step = (finish: string, outputTokens = 50, tools: string[] = []): StepMetrics => ({
  ms: 100,
  inputTokens: 1000,
  cachedInputTokens: 600,
  outputTokens,
  finish,
  tools,
});

function trace(overrides: Partial<TurnTrace> = {}): TurnTrace {
  return {
    caseId: "case",
    repeat: 0,
    turn: 0,
    message: "message",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: [],
    runs: [{ continuation: false, ms: 100, steps: [step("stop")] }],
    reply: "Done.",
    ms: 200,
    runCapHit: false,
    ...overrides,
  };
}

const navigateTo = (args: Record<string, unknown>, status = "navigated"): ToolCallRecord => ({
  name: "navigate",
  args,
  result: JSON.stringify({ status }),
});

const grade = (turn: TurnTrace, expectation: TurnExpectation) => gradeTurn(turn, expectation, 5, CODES);

describe("gradeTurn navigation", () => {
  const required: TurnExpectation = { navigate: "required", destination: COURSE };

  it("passes a required navigation that lands on the expected page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "cisc3014" })], pathnameAfter: COURSE_PATH }),
      required,
    );
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "navigated", landed: true, pass: true });
  });

  it("accepts already_here when the student is on the page already", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo(COURSE, "already_here")], pathnameBefore: COURSE_PATH, pathnameAfter: COURSE_PATH }),
      required,
    );
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "already_here", landed: true, pass: true });
  });

  it("does not complete the task when the page was not found", () => {
    const result = grade(trace({ toolCalls: [navigateTo(COURSE, "not_found")] }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "not_found", landed: false, pass: false });
  });

  it("treats arguments the navigate tool rejects as a selection failure, not a wrong page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "reviews", code: "CISC3014" }, "invalid_destination")] }),
      { navigate: "required", destination: { destination: "reviews", code: "CISC3014", instructor: "CHAN TAI MAN" } },
    );
    expect(result).toMatchObject({
      selection: "invalid_arguments",
      navigateStatus: "invalid_destination",
      landed: false,
      pass: false,
    });
  });

  it("does not count a timeout as landing, even on the expected path", () => {
    const result = grade(trace({ toolCalls: [navigateTo(COURSE, "timeout")], pathnameAfter: COURSE_PATH }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "timeout", landed: false, pass: false });
  });

  it("does not count a navigation that ended on another path", () => {
    const wrongPath = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: "/course/CISC2001" }), required);
    const elsewhere = grade(trace({ toolCalls: [navigateTo(COURSE, "landed_elsewhere")], pathnameAfter: "/" }), required);
    expect(wrongPath).toMatchObject({ selection: "correct", navigateStatus: "navigated", landed: false, pass: false });
    expect(elsewhere).toMatchObject({ selection: "correct", navigateStatus: "landed_elsewhere", landed: false, pass: false });
  });

  it("does not count a navigate call that never got a result", () => {
    const result = grade(trace({ toolCalls: [{ name: "navigate", args: COURSE }], runCapHit: true }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: null, landed: false, pass: false });
  });

  it("credits a retry that lands for completion but not for tool selection", () => {
    const result = grade(
      trace({
        toolCalls: [navigateTo({ destination: "course", code: "nope" }, "invalid_destination"), navigateTo(COURSE)],
        pathnameAfter: COURSE_PATH,
      }),
      required,
    );
    expect(result).toMatchObject({ selection: "invalid_arguments", navigateStatus: "invalid_destination", landed: true, pass: true });
  });

  it("flags navigation to the wrong page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })], pathnameAfter: "/course/CISC2001" }),
      required,
    );
    expect(result).toMatchObject({ selection: "wrong_destination", landed: false, pass: false });
  });

  it("reports a missed navigation as an omission when nothing stopped the model", () => {
    const result = grade(trace(), required);
    expect(result).toMatchObject({ selection: "missed", navigateStatus: null, landed: false, pass: false });
    expect(result.limits.omission).toBe(true);
  });

  it("does not call a navigation cut off by maxSteps an omission", () => {
    const steps = [1, 2, 3, 4, 5].map(() => step("tool-calls", 30, ["get_course"]));
    const result = grade(trace({ runs: [{ continuation: false, ms: 500, steps }] }), required);
    expect(result.limits.maxStepsHit).toBe(true);
    expect(result.limits.omission).toBe(false);
  });

  it("flags navigation during an information question", () => {
    const expectation: TurnExpectation = { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] };
    const result = grade(
      trace({
        toolCalls: [{ name: "get_course", args: { code: "CISC3014" } }, navigateTo({ destination: "timetable" })],
        pathnameAfter: "/timetable",
      }),
      expectation,
    );
    expect(result).toMatchObject({ selection: "unsolicited", academicTools: true, landed: null, pass: false });
  });

  it("requires the academic tools only when an optional turn did not navigate", () => {
    const expectation: TurnExpectation = {
      navigate: "optional",
      destination: COURSE,
      tools: [{ name: "get_course", args: { code: "CISC3014" } }],
    };
    const skipped = grade(trace(), expectation);
    const taken = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), expectation);
    const wrongPage = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })], pathnameAfter: "/course/CISC2001" }),
      expectation,
    );
    expect(skipped).toMatchObject({ selection: "optional_skipped", academicTools: false, landed: null, pass: false });
    expect(taken).toMatchObject({ selection: "optional_taken", academicTools: null, landed: true, pass: true });
    expect(wrongPage).toMatchObject({ selection: "wrong_destination", landed: false, pass: false });
  });

  it("completes a compound request only when the lookup comes before a navigate call that lands", () => {
    const expectation: TurnExpectation = {
      navigate: "required",
      destination: COURSE,
      tools: [{ name: "search_catalog", args: { type: "course" } }],
    };
    const search = { name: "search_catalog", args: { type: "course", query: "database" } };
    const inOrder = grade(trace({ toolCalls: [search, navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), expectation);
    const reversed = grade(trace({ toolCalls: [navigateTo(COURSE), search], pathnameAfter: COURSE_PATH }), expectation);
    const notFound = grade(trace({ toolCalls: [search, navigateTo(COURSE, "not_found")] }), expectation);
    expect(inOrder).toMatchObject({ compound: true, pass: true });
    expect(reversed).toMatchObject({ compound: false, pass: false });
    expect(notFound).toMatchObject({ compound: false, pass: false });
  });
});

describe("gradeTurn replies", () => {
  it("checks the reply: required mentions, unknown course codes, language and truncation", () => {
    const expectation: TurnExpectation = {
      navigate: "forbidden",
      mustMention: [["Database Systems", "資料庫系統"]],
      replyLanguage: "chinese",
    };
    const result = grade(
      trace({ reply: "See ABCD1234.", runs: [{ continuation: false, ms: 100, steps: [step("length", 400)] }] }),
      expectation,
    );
    expect(result.responseProblems).toEqual([
      "finish: length",
      "missing: Database Systems | 資料庫系統",
      "unknown course codes: ABCD1234",
      "reply is not in Chinese",
    ]);
    expect(result.limits).toMatchObject({ truncated: true, maxStepOutputTokens: 400 });
  });
});

describe("summarize", () => {
  it("separates tool selection, simulated navigation and task completion", () => {
    const required: TurnExpectation = { navigate: "required", destination: COURSE };
    const forbidden: TurnExpectation = { navigate: "forbidden" };
    const grades = [
      grade(trace({ ms: 1000, toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), required),
      grade(trace({ ms: 3000, toolCalls: [navigateTo(COURSE, "not_found")] }), required),
      grade(trace({ ms: 4000 }), required),
      grade(trace({ ms: 2000, toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), forbidden),
    ];

    const summary = summarize(grades);

    expect(summary.turns).toBe(4);
    expect(summary.passed).toBe(1);
    expect(summary.toolSelection).toEqual({
      required: 3,
      correct: 2,
      missed: 1,
      invalidArguments: 0,
      wrongDestination: 0,
      omissions: 1,
    });
    expect(summary.simulatedNavigation).toEqual({
      required: 3,
      landed: 1,
      statuses: { navigated: 1, not_found: 1, no_call: 1 },
    });
    expect(summary.unsolicited).toEqual({ forbidden: 1, navigated: 1 });
    expect(summary.limits).toMatchObject({ runs: 4, steps: 4, latencyP50Ms: 3000, finishCounts: { stop: 4 }, inputTokens: 4000 });
    expect(summary.byTurn).toEqual({ "case#1": { passed: 1, total: 4 } });
  });
});
