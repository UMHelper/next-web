import { describe, expect, it } from "vitest";

import { armReport, armTable, checkControlled, costOf } from "@/evals/assistant/compare";
import type { EvalCase } from "@/evals/assistant/cases";
import { summarize, type StepMetrics, type TurnGrade, type TurnTrace } from "@/evals/assistant/grade";
import type { SavedRun } from "@/evals/assistant/results";

const step = (finish: string, outputTokens: number): StepMetrics => ({
  ms: 100,
  inputTokens: 1000,
  cachedInputTokens: 800,
  outputTokens,
  finish,
  tools: [],
});

function trace(reply: string, steps: StepMetrics[]): TurnTrace {
  return {
    caseId: "c",
    repeat: 0,
    turn: 0,
    message: "m",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: [],
    runs: [{ continuation: false, ms: 100, steps }],
    reply,
    ms: 1000,
    runCapHit: false,
  };
}

function run(maxOutputTokens: number, overrides: Partial<SavedRun> = {}, thinking = "off"): SavedRun {
  const traces = [trace("abcd", [step("tool-calls", 20), step("stop", 300)]), trace("abcdefgh", [step("length", maxOutputTokens)])];
  return {
    kind: "live",
    label: `t${maxOutputTokens}`,
    suite: "tokens",
    cases: ["c"],
    settings: { model: "deepseek-flash", thinking, maxOutputTokens, maxSteps: 5, prompt: "p", eval: "e" },
    repeats: 5,
    stepsUsed: 3,
    complete: true,
    summary: summarize([]),
    grades: [],
    traces,
    ...overrides,
  };
}

describe("checkControlled", () => {
  it("accepts runs that differ only in the output budget", () => {
    expect(checkControlled([400, 800, 1200].map((tokens) => ({ file: `${tokens}.json`, run: run(tokens) })))).toEqual([]);
  });

  it("names every uncontrolled difference", () => {
    const base = { file: "400.json", run: run(400) };
    const other = run(800, {
      settings: { model: "other", thinking: "low", maxOutputTokens: 800, maxSteps: 6, prompt: "p2", eval: "e2" },
      repeats: 3,
      cases: ["c", "d"],
      suite: "navigation",
    });
    expect(checkControlled([base, { file: "800.json", run: other }])).toEqual([
      "800.json: suite differs",
      "800.json: case set differs",
      "800.json: repeats differ",
      "800.json: settings.model differs",
      "800.json: settings.maxSteps differs",
      "800.json: settings.prompt differs",
      "800.json: settings.eval differs",
    ]);
  });

  it("refuses incomplete runs, regraded or Phase 1 files, a single run and repeated budgets", () => {
    expect(checkControlled([{ file: "a", run: run(400) }])).toEqual(["compare at least two runs"]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(400) }])).toEqual([
      "b: same thinking and maxOutputTokens as a",
    ]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(800, { complete: false }) }])).toEqual([
      "b: not a complete live run",
    ]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(800, { kind: undefined }) }])).toEqual([
      "b: not a complete live run",
    ]);
  });

  it("accepts the A→B→C→D chain, where each arm changes one setting", () => {
    const arms = [
      { file: "A", run: run(400) },
      { file: "B", run: run(1200) },
      { file: "C", run: run(1200, {}, "low") },
      { file: "D", run: run(2000, {}, "low") },
    ];
    expect(checkControlled(arms)).toEqual([]);
  });

  it("refuses a step that changes thinking and the budget together", () => {
    expect(checkControlled([{ file: "A", run: run(400) }, { file: "C", run: run(1200, {}, "low") }])).toEqual([
      "C: changes both thinking and maxOutputTokens from A",
    ]);
  });
});

describe("armReport", () => {
  it("measures answer-step output tokens, truncation, reply length and cost", () => {
    const report = armReport("400.json", run(400), { inputCacheMiss: 1, inputCacheHit: 0.1, output: 2 });
    expect(report).toMatchObject({
      maxOutputTokens: 400,
      steps: 3,
      lengthSteps: 1,
      answerOutputTokens: { p50: 400, p90: 400, max: 400 },
      outputTokens: 720,
      replyChars: { p50: 8, p90: 8 },
    });
    expect(report.costUsd).toBeCloseTo((3 * 200 * 1 + 3 * 800 * 0.1 + 720 * 2) / 1_000_000);
  });

  it("leaves cost unset without prices", () => {
    expect(armReport("400.json", run(400), null).costUsd).toBeNull();
  });

  it("prices cached and uncached input separately", () => {
    expect(costOf([step("stop", 0)], { inputCacheMiss: 1_000_000, inputCacheHit: 0, output: 0 })).toBe(200);
  });
});

describe("armReport Phase 2 metrics", () => {
  it("separates reasoning from visible tokens and reports language, intent, history and requests", () => {
    const thinking: StepMetrics = { ...step("stop", 300), reasoningTokens: 200, ms: 2500 };
    const traces: TurnTrace[] = [
      { ...trace("a", [thinking]), caseId: "x-ko", messagesAdded: 4, bytesAdded: 1000 },
      {
        ...trace("b", [step("stop", 100)]),
        caseId: "x-ja",
        messagesAdded: 2,
        bytesAdded: 500,
        runs: [
          {
            continuation: false,
            ms: 100,
            steps: [step("stop", 100)],
            reasoningMessages: 1,
            requests: [
              {
                model: "deepseek-flash",
                stream: true,
                maxTokens: 1200,
                thinking: { type: "enabled" },
                reasoningEffort: "low",
                toolChoice: null,
                tools: [],
                messages: 3,
                assistantMessages: 1,
                reasoningReplayed: 0,
                reasoningEmpty: 1,
                reasoningAbsent: 0,
              },
            ],
          },
        ],
      },
    ];
    const grade = (caseId: string, pass: boolean) =>
      ({ caseId, repeat: 0, turn: 0, pass, intentOk: pass, languageOk: pass, limits: { truncated: false } }) as TurnGrade;
    const cases = [
      { id: "x-ko", category: "natural", language: "ko", intent: "x", pathname: "/", why: "", turns: [] },
      { id: "x-ja", category: "natural", language: "ja", intent: "x", pathname: "/", why: "", turns: [] },
    ] as EvalCase[];

    const report = armReport(
      "C.json",
      run(1200, { traces, grades: [grade("x-ko", true), grade("x-ja", false)] }, "low"),
      null,
      cases,
    );

    expect(report).toMatchObject({
      thinking: "low",
      reasoningTokens: 200,
      visibleOutputTokens: 200,
      intentOk: 1,
      stepMs: { max: 2500 },
      byLanguage: { ko: { passed: 1, total: 1, languageOk: 1 }, ja: { passed: 0, total: 1, languageOk: 0 } },
      intents: { x: { spread: 1 } },
      history: { messagesPerTurn: 3, bytesPerTurn: 750, reasoningMessagesPerTurn: 0.5 },
      requests: { total: 1, reasoningEmpty: 1, reasoningReplayed: 0, reasoningAbsent: 0 },
    });
    expect(armTable([report])).toContain("| Output tokens: reasoning / visible | 200 / 200 |");
  });
});
