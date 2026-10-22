import { describe, expect, it } from "vitest";

import {
  gradeTurn,
  summarize,
  type StepMetrics,
  type TurnExpectation,
  type TurnTrace,
} from "@/evals/assistant/grade";

const CODES = ["CISC2001", "CISC3014"];
const COURSE = { destination: "course", code: "CISC3014" };

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

const navigateTo = (args: Record<string, unknown>) => ({
  name: "navigate",
  args,
  result: JSON.stringify({ status: "navigated" }),
});

describe("gradeTurn", () => {
  const required: TurnExpectation = { navigate: "required", destination: COURSE };

  it("passes a required navigation to the expected page", () => {
    const grade = gradeTurn(trace({ toolCalls: [navigateTo({ destination: "course", code: "cisc3014" })] }), required, 5, CODES);
    expect(grade.navigation).toBe("correct");
    expect(grade.pass).toBe(true);
  });

  it("reports a missed navigation as an omission when nothing stopped the model", () => {
    const grade = gradeTurn(trace(), required, 5, CODES);
    expect(grade.navigation).toBe("missed");
    expect(grade.limits.omission).toBe(true);
    expect(grade.pass).toBe(false);
  });

  it("does not call a navigation cut off by maxSteps an omission", () => {
    const steps = [1, 2, 3, 4, 5].map(() => step("tool-calls", 30, ["get_course"]));
    const grade = gradeTurn(trace({ runs: [{ continuation: false, ms: 500, steps }] }), required, 5, CODES);
    expect(grade.limits.maxStepsHit).toBe(true);
    expect(grade.limits.omission).toBe(false);
  });

  it("flags navigation to the wrong page", () => {
    const grade = gradeTurn(trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })] }), required, 5, CODES);
    expect(grade.navigation).toBe("wrong_destination");
    expect(grade.pass).toBe(false);
  });

  it("flags navigation during an information question", () => {
    const expectation: TurnExpectation = { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] };
    const grade = gradeTurn(
      trace({ toolCalls: [{ name: "get_course", args: { code: "CISC3014" } }, navigateTo({ destination: "timetable" })] }),
      expectation,
      5,
      CODES,
    );
    expect(grade.navigation).toBe("unsolicited");
    expect(grade.academicTools).toBe(true);
    expect(grade.pass).toBe(false);
  });

  it("requires the academic tools only when an optional turn did not navigate", () => {
    const expectation: TurnExpectation = {
      navigate: "optional",
      destination: COURSE,
      tools: [{ name: "get_course", args: { code: "CISC3014" } }],
    };
    const skipped = gradeTurn(trace(), expectation, 5, CODES);
    const taken = gradeTurn(trace({ toolCalls: [navigateTo(COURSE)] }), expectation, 5, CODES);
    expect(skipped).toMatchObject({ navigation: "optional_skipped", academicTools: false, pass: false });
    expect(taken).toMatchObject({ navigation: "optional_taken", academicTools: null, pass: true });
  });

  it("completes a compound request only when the lookup comes before navigate", () => {
    const expectation: TurnExpectation = {
      navigate: "required",
      destination: COURSE,
      tools: [{ name: "search_catalog", args: { type: "course" } }],
    };
    const search = { name: "search_catalog", args: { type: "course", query: "database" } };
    const inOrder = gradeTurn(trace({ toolCalls: [search, navigateTo(COURSE)] }), expectation, 5, CODES);
    const reversed = gradeTurn(trace({ toolCalls: [navigateTo(COURSE), search] }), expectation, 5, CODES);
    expect(inOrder.compound).toBe(true);
    expect(reversed.compound).toBe(false);
    expect(reversed.pass).toBe(false);
  });

  it("checks the reply: required mentions, unknown course codes, language and truncation", () => {
    const expectation: TurnExpectation = {
      navigate: "forbidden",
      mustMention: [["Database Systems", "資料庫系統"]],
      replyLanguage: "chinese",
    };
    const grade = gradeTurn(
      trace({ reply: "See ABCD1234.", runs: [{ continuation: false, ms: 100, steps: [step("length", 400)] }] }),
      expectation,
      5,
      CODES,
    );
    expect(grade.responseProblems).toEqual([
      "finish: length",
      "missing: Database Systems | 資料庫系統",
      "unknown course codes: ABCD1234",
      "reply is not in Chinese",
    ]);
    expect(grade.limits).toMatchObject({ truncated: true, maxStepOutputTokens: 400 });
  });
});

describe("summarize", () => {
  it("counts navigation outcomes, tool use and limits across turns", () => {
    const required: TurnExpectation = { navigate: "required", destination: COURSE };
    const forbidden: TurnExpectation = { navigate: "forbidden" };
    const grades = [
      gradeTurn(trace({ ms: 1000, toolCalls: [navigateTo(COURSE)] }), required, 5, CODES),
      gradeTurn(trace({ ms: 3000 }), required, 5, CODES),
      gradeTurn(trace({ ms: 2000, toolCalls: [navigateTo(COURSE)] }), forbidden, 5, CODES),
    ];

    const summary = summarize(grades);

    expect(summary.turns).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.navigation).toEqual({ required: 2, correct: 1, missed: 1, wrongDestination: 0, omissions: 1 });
    expect(summary.unsolicited).toEqual({ forbidden: 1, navigated: 1 });
    expect(summary.limits.latencyP50Ms).toBe(2000);
    expect(summary.limits.finishCounts).toEqual({ stop: 3 });
    expect(summary.limits.inputTokens).toBe(3000);
    expect(summary.byTurn).toEqual({ "case#1": { passed: 1, total: 3 } });
  });
});
