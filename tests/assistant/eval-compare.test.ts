import { describe, expect, it } from "vitest";

import { armReport, checkControlled, costOf } from "@/evals/assistant/compare";
import { summarize, type StepMetrics, type TurnTrace } from "@/evals/assistant/grade";
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

function run(maxOutputTokens: number, overrides: Partial<SavedRun> = {}): SavedRun {
  const traces = [trace("abcd", [step("tool-calls", 20), step("stop", 300)]), trace("abcdefgh", [step("length", maxOutputTokens)])];
  return {
    kind: "live",
    label: `t${maxOutputTokens}`,
    suite: "tokens",
    cases: ["c"],
    settings: { model: "deepseek-flash", thinking: "off", maxOutputTokens, maxSteps: 5, prompt: "p", eval: "e" },
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
      "800.json: settings.thinking differs",
      "800.json: settings.maxSteps differs",
      "800.json: settings.prompt differs",
      "800.json: settings.eval differs",
    ]);
  });

  it("refuses incomplete runs, regraded or Phase 1 files, a single run and repeated budgets", () => {
    expect(checkControlled([{ file: "a", run: run(400) }])).toEqual(["compare at least two runs"]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(400) }])).toEqual([
      "every run needs a different maxOutputTokens",
    ]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(800, { complete: false }) }])).toEqual([
      "b: not a complete live run",
    ]);
    expect(checkControlled([{ file: "a", run: run(400) }, { file: "b", run: run(800, { kind: undefined }) }])).toEqual([
      "b: not a complete live run",
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
