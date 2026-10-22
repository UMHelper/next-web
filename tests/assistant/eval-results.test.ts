import { describe, expect, it } from "vitest";

import type { EvalCase } from "@/evals/assistant/cases";
import { summarize, type CatalogFacts, type TurnTrace } from "@/evals/assistant/grade";
import type { RequestAudit } from "@/evals/assistant/request-audit";
import {
  evalFingerprint,
  expectedTurns,
  failureLines,
  isComplete,
  metricTable,
  positiveInt,
  regradeTraces,
  reportColumn,
  requestMismatches,
  resultFileName,
  thinkingMode,
  type RegradedRun,
  type SavedRun,
} from "@/evals/assistant/results";

const FACTS: CatalogFacts = { courseCodes: ["CISC3014"], officialTitles: ["Database Systems", "資料庫系統"] };
const COURSE = { destination: "course", code: "CISC3014" };

const CASES: EvalCase[] = [
  {
    id: "open",
    category: "explicit",
    pathname: "/",
    why: "test",
    turns: [{ message: "Open CISC3014", expect: { navigate: "required", destination: COURSE } }],
  },
  {
    id: "two-turns",
    category: "follow-up",
    pathname: "/",
    why: "test",
    turns: [
      { message: "Open CISC3014", expect: { navigate: "required", destination: COURSE } },
      { message: "Who teaches it?", expect: { navigate: "forbidden" } },
    ],
  },
];

function trace(overrides: Partial<TurnTrace>): TurnTrace {
  return {
    caseId: "open",
    repeat: 0,
    turn: 0,
    message: "Open CISC3014",
    pathnameBefore: "/",
    pathnameAfter: "/course/CISC3014",
    toolCalls: [{ name: "navigate", args: COURSE, result: JSON.stringify({ status: "navigated" }) }],
    runs: [{ continuation: false, ms: 100, steps: [{ ms: 100, finish: "tool-calls", tools: ["navigate"] }] }],
    reply: "Opened CISC3014.",
    ms: 100,
    runCapHit: false,
    ...overrides,
  };
}

describe("run completeness", () => {
  it("expects every turn of every case for every repeat", () => {
    expect(expectedTurns(CASES, 3)).toBe(9);
  });

  it("is complete only with no early stop and every turn graded", () => {
    expect(isComplete(CASES, 1, 3, undefined)).toBe(true);
    expect(isComplete(CASES, 1, 2, undefined)).toBe(false);
    expect(isComplete(CASES, 1, 3, "model step budget of 10 used up")).toBe(false);
  });

  it("marks incomplete result files in the name", () => {
    const at = new Date("2026-10-22T12:00:00.000Z");
    expect(resultFileName(at, "closure", true)).toBe("2026-10-22T12-00-00-000Z-closure.json");
    expect(resultFileName(at, "closure", false)).toBe("2026-10-22T12-00-00-000Z-closure-INCOMPLETE.json");
  });

  it("rejects counts that would silently run nothing", () => {
    expect(positiveInt("X", undefined, 3)).toBe(3);
    expect(positiveInt("X", "", 3)).toBe(3);
    expect(positiveInt("X", "5", 3)).toBe(5);
    expect(() => positiveInt("X", "0", 3)).toThrow("X must be a positive integer");
    expect(() => positiveInt("X", "abc", 3)).toThrow("X must be a positive integer");
    expect(() => positiveInt("X", "1.5", 3)).toThrow("X must be a positive integer");
  });
});

describe("evalFingerprint", () => {
  it("is stable for the same suite and changes when an expectation changes", () => {
    const changed: EvalCase[] = [{ ...CASES[0], turns: [{ ...CASES[0].turns[0], expect: { navigate: "optional" } }] }, CASES[1]];
    expect(evalFingerprint(CASES)).toMatch(/^[0-9a-f]{12}$/);
    expect(evalFingerprint(CASES)).toBe(evalFingerprint(CASES));
    expect(evalFingerprint(changed)).not.toBe(evalFingerprint(CASES));
  });
});

describe("regradeTraces", () => {
  it("grades saved traces against the current expectations and lists what is missing", () => {
    const traces = [trace({}), trace({ repeat: 1, pathnameAfter: "/", toolCalls: [] })];
    const result = regradeTraces(traces, CASES, 5, FACTS, 2);
    expect(result.grades.map((grade) => grade.pass)).toEqual([true, false]);
    expect(result.summary.turns).toBe(2);
    expect(result.missing).toEqual(["two-turns#1: 0/2", "two-turns#2: 0/2"]);
    expect(result.unmatched).toEqual([]);
  });

  it("reports traces whose case no longer exists", () => {
    expect(regradeTraces([trace({ caseId: "gone" })], CASES, 5, FACTS, 1).unmatched).toEqual(["gone#1"]);
  });

  it("refuses a trace whose student message differs from the case", () => {
    expect(() => regradeTraces([trace({ message: "Open CISC2001" })], CASES, 5, FACTS, 1)).toThrow(
      'open#1: saved message "Open CISC2001" differs from the case',
    );
  });
});

describe("failureLines", () => {
  it("describes each failing turn with its tools, reply and grade", () => {
    const traces = [trace({ pathnameAfter: "/", toolCalls: [{ name: "navigate", args: COURSE, result: '{"status":"not_found"}' }] })];
    const { grades } = regradeTraces(traces, CASES, 5, FACTS, 1);
    expect(failureLines(grades, traces)).toEqual([
      'open repeat 0 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "Opened CISC3014."; selection correct, status not_found, landed false; problems: none',
    ]);
  });
});

describe("thinkingMode", () => {
  it("accepts off and low only", () => {
    expect(thinkingMode(undefined)).toBe("off");
    expect(thinkingMode("off")).toBe("off");
    expect(thinkingMode("low")).toBe("low");
    expect(() => thinkingMode("high")).toThrow('ASSISTANT_EVAL_THINKING must be "off" or "low", got "high"');
  });
});

describe("requestMismatches", () => {
  const audit = (overrides: Partial<RequestAudit> = {}): RequestAudit => ({
    model: "deepseek-flash",
    stream: true,
    maxTokens: 1200,
    thinking: { type: "enabled" },
    reasoningEffort: "low",
    toolChoice: null,
    tools: [],
    messages: 2,
    assistantMessages: 0,
    reasoningReplayed: 0,
    reasoningEmpty: 0,
    reasoningAbsent: 0,
    ...overrides,
  });
  const traceWith = (requests: RequestAudit[], steps = requests.length): TurnTrace => ({
    caseId: "c",
    repeat: 0,
    turn: 0,
    message: "m",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: [],
    runs: [
      { continuation: false, ms: 1, steps: Array.from({ length: steps }, () => ({ ms: 1, finish: "stop", tools: [] })), requests },
    ],
    reply: "r",
    ms: 1,
    runCapHit: false,
  });
  const low = { model: "deepseek-flash", thinking: "low", maxOutputTokens: 1200 };

  it("accepts requests that match the run settings", () => {
    expect(requestMismatches([traceWith([audit()])], low)).toEqual([]);
  });

  it("names a provider default that replaced the requested effort", () => {
    expect(requestMismatches([traceWith([audit({ reasoningEffort: null })])], low)).toEqual([
      'c repeat 0 turn 1 run 1: reasoningEffort null, expected "low"',
    ]);
  });

  it("expects thinking disabled and no effort when thinking is off", () => {
    expect(requestMismatches([traceWith([audit()])], { ...low, thinking: "off" })).toEqual([
      'c repeat 0 turn 1 run 1: thinking {"type":"enabled"}, expected {"type":"disabled"}',
      'c repeat 0 turn 1 run 1: reasoningEffort "low", expected null',
    ]);
  });

  it("flags model steps that no captured request explains", () => {
    expect(requestMismatches([traceWith([], 1)], low)).toEqual([
      "c repeat 0 turn 1 run 1: 1 model steps but 0 provider requests captured",
    ]);
  });
});

describe("report", () => {
  const summary = summarize(regradeTraces([trace({})], CASES, 5, FACTS, 1).grades);
  const settings = { model: "m", thinking: "off", maxOutputTokens: 400, maxSteps: 5, prompt: "p1" };

  it("labels regraded and live columns and refuses incomplete live runs", () => {
    const regraded: RegradedRun = {
      kind: "regraded",
      source: "baseline.json",
      label: "baseline",
      sourceSettings: settings,
      sourceStepsUsed: 9,
      evalFingerprint: "e1",
      repeats: 3,
      missing: [],
      failures: [],
      summary,
      grades: [],
    };
    const live: SavedRun = {
      kind: "live",
      label: "closure",
      settings: { ...settings, eval: "e1" },
      repeats: 1,
      stepsUsed: 3,
      complete: true,
      summary,
      grades: [],
      traces: [],
    };
    expect(reportColumn(regraded).title).toBe("Regraded: baseline (prompt p1, eval e1)");
    expect(reportColumn(live).title).toBe("Live: closure (prompt p1, eval e1)");
    expect(() => reportColumn({ ...live, complete: false })).toThrow("closure: incomplete or pre-closure live run");
    expect(() => reportColumn({ ...live, kind: undefined, complete: undefined })).toThrow("regrade it instead");
  });

  it("renders one markdown row per metric", () => {
    const table = metricTable([{ title: "A", summary, stepsUsed: 1 }]);
    expect(table.split("\n").slice(0, 2)).toEqual(["| Metric | A |", "|---|---|"]);
    expect(table).toContain("| Task completion (turns passed) | 1/1 |");
    expect(table).toContain("| Intent read correctly (navigation decision and lookups) |");
    expect(table).toContain("| Reasoning tokens |");
    expect(table).toContain("| Simulated navigation landed (required turns) | 1/1 |");
    expect(table).toContain("| Model requests: steps graded / steps used | 1 / 1 |");
  });
});
