# What2Reg AI V1-E Phase 1 Closure and Phase 2 Preparation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant eval measure what the student actually got (landed on the right page, in the right language), settle the "Show me CISC3014" product rule, re-measure Phase 1 under frozen rules, and ship a ready-to-run controlled design for the Phase 2 output-token experiment.

**Architecture:** The grader in `evals/assistant/grade.ts` is split into three navigation layers: tool selection (judged on the first `navigate` call), simulated navigation (a call to the expected page returned `navigated`/`already_here` and the turn ended on that path), and task completion (the end state plus lookups and reply checks). The language check strips official catalog titles before looking for Han characters. A new `evals/assistant/results.ts` holds pure helpers for run completeness, the grading fingerprint, regrading saved traces and report tables; thin opt-in Vitest entries (`regrade.eval.ts`, `report.eval.ts`, `compare.eval.ts`) do the file I/O. Phase 2 gets its own case suite and a comparison that refuses runs that differ in anything but `maxOutputTokens`.

**Tech Stack:** Next.js 15, CopilotKit 1.79.1 (`BuiltInAgent`), AI SDK 6 (`@ai-sdk/deepseek`), Vitest 2, Node `crypto`/`fs`.

## Global Constraints

- Branch: `feat/global-assistant-v1`. Do not push, merge or deploy.
- Do not change `ASSISTANT_MAX_STEPS = 5`, the `AI_MAX_OUTPUT_TOKENS` default of 400, the model (`deepseek-flash`) or thinking mode (`off`).
- Do not set `toolChoice` to `required` and do not add deterministic keyword-based routing in code. Behaviour changes go through `ASSISTANT_PROMPT` wording only.
- Do not change the product's language requirements (prompt rule 1 and the closing "check rule 1 again" sentence) to raise the score.
- `ASSISTANT_PROMPT` must stay free of Han characters (existing test in `tests/assistant/agent.test.ts`).
- Preserve: Clerk authentication and access modes; server rate limits; read-only operations; `parseDestination`/`verifyDestination` navigation validation; `MAX_NAVIGATIONS_PER_MESSAGE = 1`; desktop-only availability at >=1024px; the five academic server tools; `check_plan_conflicts`.
- The harness stays opt-in: nothing under `evals/` runs in `npm test`; real-model calls only with `ASSISTANT_EVAL=1`, only after the user approves the budget (AskQuestion), sequentially, with the step cap on. Real-model commands need `required_permissions: ["full_network"]`.
- Grading freeze: after the Task 4 freeze commit, `evals/assistant/grade.ts`, `evals/assistant/catalog.ts` and `evals/assistant/cases.ts` do not change until the Task 4 record is committed. If a grading bug is found after the freeze, fix it, commit, re-freeze and redo every regrade and live run from Task 4 Step 6 onward.
- Never edit or delete the historical result files `.eval-results/assistant/2026-10-22T10-08-34-262Z-baseline.json` and `.eval-results/assistant/2026-10-22T10-15-33-091Z-revised.json`.
- Never print, copy or commit `.env.local` or `AI_API_KEY`.
- Preserve unrelated working-tree state: `app/layout.tsx` (modified), untracked `docs/superpowers/plans/2026-10-22-assistant-v1e-phase1-tool-use.md`, untracked `.next-dev/**`, `stash@{0}`. Stage files by explicit path only. Never `git add -A`, `git add .`, `git stash` or `git checkout -- <file>` on files you did not create.
- Do not implement V2 timetable modification features.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `evals/assistant/grade.ts` | Modify | Tool selection, simulated navigation, task completion; title-aware language check; summary with request counts. |
| `evals/assistant/catalog.ts` | Modify | Export `EVAL_CATALOG_FACTS` (course codes and official titles). |
| `evals/assistant/cases.ts` | Modify | "Show me CISC3014" requires navigation; new "What is CISC3014 about?" information case. |
| `lib/assistant/prompt.ts` | Modify | One sentence: being shown a specific course, instructor or their reviews is a page request; asking what one is about is a question. |
| `evals/assistant/results.ts` | Create | Pure helpers: completeness, file names, env integers, grading fingerprint, regrade, failure lines, report table. |
| `evals/assistant/navigation.eval.ts` | Modify | Validate env, fail incomplete runs, record fingerprint and completeness; in Task 5 select a suite. |
| `evals/assistant/regrade.eval.ts` | Create | Opt-in (`ASSISTANT_REGRADE`): regrade saved traces under current rules. |
| `evals/assistant/report.eval.ts` | Create | Opt-in (`ASSISTANT_REPORT`): print one metric table for live and regraded results, labelled by kind. |
| `evals/assistant/README.md` | Create | How to run, env vars, global step budget, completeness, regrade, report, compare. |
| `evals/assistant/token-cases.ts` | Create | Phase 2 suite: Traditional Chinese comparisons, long explanations, one English control. |
| `evals/assistant/compare.ts` | Create | Phase 2 controlled-comparison check and per-budget metrics (output tokens, `finish: length`, latency, cost). |
| `evals/assistant/compare.eval.ts` | Create | Opt-in (`ASSISTANT_COMPARE`): compare result files that differ only in output budget. |
| `tests/assistant/eval-grade.test.ts` | Modify | Regression tests for landing, `not_found`, `invalid_destination`, `timeout`, wrong path, language titles. |
| `tests/assistant/eval-cases.test.ts` | Modify | Official titles; show-vs-ask pair. |
| `tests/assistant/eval-results.test.ts` | Create | Tests for `results.ts`. |
| `tests/assistant/eval-token-cases.test.ts` | Create | Tests for the Phase 2 suite. |
| `tests/assistant/eval-compare.test.ts` | Create | Tests for `compare.ts`. |
| `tests/assistant/agent.test.ts` | Modify | Assert the new prompt sentence. |
| `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md` | Modify | One-line pointer that its numbers use the Phase 1 grader. |
| `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md` | Create | Grading rules, product rule, regraded vs live metrics, genuine failures, Phase 2 recommendation, checks. |
| `docs/superpowers/specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md` | Create | Phase 2 experiment protocol. |

`vitest.config.ts` only includes `tests/**`, and `vitest.eval.config.ts` only includes `evals/**/*.eval.ts`, so the new `*.eval.ts` files stay out of `npm test`. `tsconfig.json` includes `**/*.ts`, so `npx tsc --noEmit` and `npm run lint` still check them.

---

### Task 1: Separate tool selection, simulated navigation and task completion

**Files:**
- Modify: `evals/assistant/grade.ts` (whole file)
- Test: `tests/assistant/eval-grade.test.ts` (whole file)

**Interfaces:**
- Consumes: `parseDestination`, `buildNavigationPath`, `NavigationDestination` from `@/lib/assistant/navigation`.
- Produces (used by Tasks 2, 4, 5):
  - `type SelectionOutcome = "correct" | "missed" | "invalid_arguments" | "wrong_destination" | "unsolicited" | "none" | "optional_taken" | "optional_skipped"` (replaces `NavigationOutcome`).
  - `TurnGrade` fields: `selection: SelectionOutcome`, `navigateStatus: string | null`, `landed: boolean | null`, `academicTools`, `compound`, `responseProblems`, `limits`, `pass` (the field `navigation` is removed).
  - `Summary` fields: `toolSelection: { required; correct; missed; invalidArguments; wrongDestination; omissions }`, `simulatedNavigation: { required; landed; statuses: Record<string, number> }`, `unsolicited`, `optional: { turns; navigated; landed }`, `academicTools`, `compound`, `responses`, `limits` (adds `runs` and `steps` totals), `byTurn`.
  - `gradeTurn(trace: TurnTrace, expectation: TurnExpectation, maxSteps: number, knownCodes: readonly string[]): TurnGrade` (signature unchanged in this task).

Rules this task implements:
- Tool selection looks only at the first `navigate` call: missing, arguments `parseDestination` rejects, a different page, or correct.
- Simulated navigation succeeds only when some `navigate` call parses to the expected destination, its result status is `navigated` or `already_here`, and `trace.pathnameAfter === buildNavigationPath(expected)`.
- Task completion (`pass`) is judged on the end state: no unsolicited navigation, landed when landing was needed, lookups done (and before the landing call for compound turns), and no reply problems. A retry after `invalid_destination` that lands counts for completion but not for selection.

- [ ] **Step 1: Write the failing grader tests**

Replace the whole of `tests/assistant/eval-grade.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assistant/eval-grade.test.ts`
Expected: FAIL — assertions on `selection`, `landed`, `navigateStatus`, `toolSelection` and `simulatedNavigation` fail because those fields do not exist yet.

- [ ] **Step 3: Rewrite the grader**

Replace the whole of `evals/assistant/grade.ts` with:

```ts
import { isDeepStrictEqual } from "node:util";

import { buildNavigationPath, parseDestination, type NavigationDestination } from "@/lib/assistant/navigation";
import type { ASSISTANT_SERVER_TOOL_NAMES } from "@/lib/assistant/tools";

export type ServerToolName = (typeof ASSISTANT_SERVER_TOOL_NAMES)[number];

export type TurnExpectation = {
  /** optional: either answering or navigating is fine, but navigation must land on `destination`. */
  navigate: "required" | "forbidden" | "optional";
  /** Raw navigate input; compared after parseDestination on both sides. */
  destination?: Record<string, string>;
  /** Must be called, each before the navigate call that lands. Not checked for an optional turn that navigated. */
  tools?: Array<{ name: ServerToolName; args?: Record<string, string> }>;
  /** Each group needs one of its strings in the reply, case-insensitively. */
  mustMention?: string[][];
  replyLanguage?: "chinese" | "english";
};

export type ToolCallRecord = { name: string; args: Record<string, unknown>; result?: string };

export type StepMetrics = {
  ms: number;
  firstChunkMs?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  finish: string;
  tools: string[];
};

export type RunTrace = { continuation: boolean; ms: number; steps: StepMetrics[]; error?: string };

export type TurnTrace = {
  caseId: string;
  repeat: number;
  turn: number;
  message: string;
  pathnameBefore: string;
  pathnameAfter: string;
  toolCalls: ToolCallRecord[];
  runs: RunTrace[];
  reply: string;
  ms: number;
  runCapHit: boolean;
  error?: string;
};

/** Judged on the first navigate call: the right tool, valid arguments and the right page. */
export type SelectionOutcome =
  | "correct"
  | "missed"
  | "invalid_arguments"
  | "wrong_destination"
  | "unsolicited"
  | "none"
  | "optional_taken"
  | "optional_skipped";

export type TurnLimits = {
  runs: number;
  steps: number;
  maxStepsInRun: number;
  maxStepsHit: boolean;
  truncated: boolean;
  omission: boolean;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  maxStepOutputTokens: number;
  finishes: string[];
  ms: number;
};

export type TurnGrade = {
  caseId: string;
  repeat: number;
  turn: number;
  expectation: TurnExpectation["navigate"];
  selection: SelectionOutcome;
  /** Status returned to the first navigate call; null when it was not called or never answered. */
  navigateStatus: string | null;
  /** A call to the expected page returned navigated or already_here and the turn ended on its path; null when no landing was needed. */
  landed: boolean | null;
  academicTools: boolean | null;
  compound: boolean | null;
  responseProblems: string[];
  limits: TurnLimits;
  /** Task completion, judged on the end state rather than the first navigate call. */
  pass: boolean;
};

export type Summary = {
  turns: number;
  passed: number;
  toolSelection: {
    required: number;
    correct: number;
    missed: number;
    invalidArguments: number;
    wrongDestination: number;
    omissions: number;
  };
  simulatedNavigation: { required: number; landed: number; statuses: Record<string, number> };
  unsolicited: { forbidden: number; navigated: number };
  optional: { turns: number; navigated: number; landed: number };
  academicTools: { required: number; ok: number };
  compound: { turns: number; complete: number };
  responses: { ok: number; total: number };
  limits: {
    runs: number;
    steps: number;
    runsPerTurnMean: number;
    runsPerTurnMax: number;
    maxStepsInRun: number;
    maxStepsHits: number;
    truncatedTurns: number;
    finishCounts: Record<string, number>;
    latencyP50Ms: number;
    latencyP90Ms: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    maxStepOutputTokens: number;
  };
  byTurn: Record<string, { passed: number; total: number }>;
};

const COURSE_CODE_IN_TEXT = /\b[A-Z]{4}\d{4}\b/g;
const HAN = /\p{Script=Han}/u;
const LANDED_STATUSES: ReadonlySet<string> = new Set(["navigated", "already_here"]);

const normalized = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : value;

function matchesTool(call: ToolCallRecord, wanted: NonNullable<TurnExpectation["tools"]>[number]) {
  return (
    call.name === wanted.name &&
    Object.entries(wanted.args ?? {}).every(([key, value]) => normalized(call.args[key]) === normalized(value))
  );
}

function statusOf(call: ToolCallRecord): string | null {
  if (call.result === undefined) return null;
  try {
    const status: unknown = JSON.parse(call.result)?.status;
    return typeof status === "string" ? status : null;
  } catch {
    return null;
  }
}

function selectionOf(
  expectation: TurnExpectation,
  first: ToolCallRecord | undefined,
  wanted: NavigationDestination | null,
): SelectionOutcome {
  if (expectation.navigate === "forbidden") return first ? "unsolicited" : "none";
  if (!first) return expectation.navigate === "required" ? "missed" : "optional_skipped";
  const actual = parseDestination(first.args);
  if (actual === null) return "invalid_arguments";
  if (!isDeepStrictEqual(actual, wanted)) return "wrong_destination";
  return expectation.navigate === "required" ? "correct" : "optional_taken";
}

function limitsOf(trace: TurnTrace, maxSteps: number, missed: boolean): TurnLimits {
  const steps = trace.runs.flatMap((run) => run.steps);
  const finishes = steps.map((step) => step.finish);
  const maxStepsHit = trace.runs.some(
    (run) => run.steps.length >= maxSteps && run.steps.at(-1)?.finish === "tool-calls",
  );
  const truncated = finishes.includes("length");
  const sum = (pick: (step: StepMetrics) => number | undefined) =>
    steps.reduce((total, step) => total + (pick(step) ?? 0), 0);
  return {
    runs: trace.runs.length,
    steps: steps.length,
    maxStepsInRun: Math.max(0, ...trace.runs.map((run) => run.steps.length)),
    maxStepsHit,
    truncated,
    omission: missed && !maxStepsHit && !truncated && !trace.runCapHit && trace.error === undefined,
    inputTokens: sum((step) => step.inputTokens),
    cachedInputTokens: sum((step) => step.cachedInputTokens),
    outputTokens: sum((step) => step.outputTokens),
    maxStepOutputTokens: Math.max(0, ...steps.map((step) => step.outputTokens ?? 0)),
    finishes,
    ms: trace.ms,
  };
}

function responseProblems(
  trace: TurnTrace,
  expectation: TurnExpectation,
  truncated: boolean,
  knownCodes: readonly string[],
): string[] {
  const problems: string[] = [];
  if (trace.error !== undefined) problems.push(`error: ${trace.error}`);
  if (trace.reply.trim() === "") problems.push("empty reply");
  if (truncated) problems.push("finish: length");
  const reply = trace.reply.toLowerCase();
  for (const group of expectation.mustMention ?? []) {
    if (!group.some((text) => reply.includes(text.toLowerCase()))) problems.push(`missing: ${group.join(" | ")}`);
  }
  const unknown = [...new Set(trace.reply.match(COURSE_CODE_IN_TEXT) ?? [])].filter((code) => !knownCodes.includes(code));
  if (unknown.length > 0) problems.push(`unknown course codes: ${unknown.join(", ")}`);
  if (expectation.replyLanguage === "chinese" && !HAN.test(trace.reply)) problems.push("reply is not in Chinese");
  if (expectation.replyLanguage === "english" && HAN.test(trace.reply)) problems.push("reply contains Chinese");
  return problems;
}

export function gradeTurn(
  trace: TurnTrace,
  expectation: TurnExpectation,
  maxSteps: number,
  knownCodes: readonly string[],
): TurnGrade {
  const navigateCalls = trace.toolCalls.filter((call) => call.name === "navigate");
  const navigated = navigateCalls.length > 0;
  const wanted = expectation.destination ? parseDestination(expectation.destination) : null;
  const selection = selectionOf(expectation, navigateCalls[0], wanted);

  const landingIndex =
    wanted === null
      ? -1
      : trace.toolCalls.findIndex(
          (call) =>
            call.name === "navigate" &&
            isDeepStrictEqual(parseDestination(call.args), wanted) &&
            LANDED_STATUSES.has(statusOf(call) ?? ""),
        );
  const needsLanding = expectation.navigate === "required" || (expectation.navigate === "optional" && navigated);
  const landed = needsLanding
    ? landingIndex >= 0 && wanted !== null && trace.pathnameAfter === buildNavigationPath(wanted)
    : null;

  const toolsApply = expectation.tools !== undefined && !(expectation.navigate === "optional" && navigated);
  const positions = (expectation.tools ?? []).map((wantedTool) =>
    trace.toolCalls.findIndex((call) => matchesTool(call, wantedTool)),
  );
  const academicTools = toolsApply ? positions.every((index) => index >= 0) : null;
  const compound =
    expectation.navigate === "required" && expectation.tools !== undefined
      ? academicTools === true && landed === true && positions.every((index) => index < landingIndex)
      : null;

  const limits = limitsOf(trace, maxSteps, selection === "missed");
  const problems = responseProblems(trace, expectation, limits.truncated, knownCodes);
  return {
    caseId: trace.caseId,
    repeat: trace.repeat,
    turn: trace.turn,
    expectation: expectation.navigate,
    selection,
    navigateStatus: navigated ? statusOf(navigateCalls[0]) : null,
    landed,
    academicTools,
    compound,
    responseProblems: problems,
    limits,
    pass:
      selection !== "unsolicited" &&
      landed !== false &&
      academicTools !== false &&
      compound !== false &&
      problems.length === 0,
  };
}

export function summarize(grades: TurnGrade[]): Summary {
  const where = (predicate: (grade: TurnGrade) => boolean) => grades.filter(predicate);
  const required = where((grade) => grade.expectation === "required");
  const forbidden = where((grade) => grade.expectation === "forbidden");
  const optional = where((grade) => grade.expectation === "optional");
  const withTools = where((grade) => grade.academicTools !== null);
  const compound = where((grade) => grade.compound !== null);
  const latencies = grades.map((grade) => grade.limits.ms).sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies.length === 0 ? 0 : latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))];
  const total = (pick: (limits: TurnLimits) => number) => grades.reduce((sum, grade) => sum + pick(grade.limits), 0);
  const highest = (pick: (limits: TurnLimits) => number) => Math.max(0, ...grades.map((grade) => pick(grade.limits)));
  const selected = (outcome: SelectionOutcome) => required.filter((grade) => grade.selection === outcome).length;

  const statuses: Record<string, number> = {};
  for (const grade of required) {
    const status = grade.navigateStatus ?? (grade.selection === "missed" ? "no_call" : "no_result");
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  const finishCounts: Record<string, number> = {};
  for (const finish of grades.flatMap((grade) => grade.limits.finishes)) {
    finishCounts[finish] = (finishCounts[finish] ?? 0) + 1;
  }
  const byTurn: Record<string, { passed: number; total: number }> = {};
  for (const grade of grades) {
    const entry = (byTurn[`${grade.caseId}#${grade.turn + 1}`] ??= { passed: 0, total: 0 });
    entry.total++;
    if (grade.pass) entry.passed++;
  }

  return {
    turns: grades.length,
    passed: where((grade) => grade.pass).length,
    toolSelection: {
      required: required.length,
      correct: selected("correct"),
      missed: selected("missed"),
      invalidArguments: selected("invalid_arguments"),
      wrongDestination: selected("wrong_destination"),
      omissions: required.filter((grade) => grade.limits.omission).length,
    },
    simulatedNavigation: {
      required: required.length,
      landed: required.filter((grade) => grade.landed === true).length,
      statuses,
    },
    unsolicited: {
      forbidden: forbidden.length,
      navigated: forbidden.filter((grade) => grade.selection === "unsolicited").length,
    },
    optional: {
      turns: optional.length,
      navigated: optional.filter((grade) => grade.landed !== null).length,
      landed: optional.filter((grade) => grade.landed === true).length,
    },
    academicTools: { required: withTools.length, ok: withTools.filter((grade) => grade.academicTools).length },
    compound: { turns: compound.length, complete: compound.filter((grade) => grade.compound).length },
    responses: { ok: where((grade) => grade.responseProblems.length === 0).length, total: grades.length },
    limits: {
      runs: total((limits) => limits.runs),
      steps: total((limits) => limits.steps),
      runsPerTurnMean: grades.length === 0 ? 0 : total((limits) => limits.runs) / grades.length,
      runsPerTurnMax: highest((limits) => limits.runs),
      maxStepsInRun: highest((limits) => limits.maxStepsInRun),
      maxStepsHits: where((grade) => grade.limits.maxStepsHit).length,
      truncatedTurns: where((grade) => grade.limits.truncated).length,
      finishCounts,
      latencyP50Ms: percentile(0.5),
      latencyP90Ms: percentile(0.9),
      inputTokens: total((limits) => limits.inputTokens),
      cachedInputTokens: total((limits) => limits.cachedInputTokens),
      outputTokens: total((limits) => limits.outputTokens),
      maxStepOutputTokens: highest((limits) => limits.maxStepOutputTokens),
    },
    byTurn,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/eval-grade.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Type-check and lint the eval code**

Run: `npx tsc --noEmit && npx eslint evals tests/assistant/eval-grade.test.ts --max-warnings=0`
Expected: exit 0. `navigation.eval.ts` still compiles because `gradeTurn`'s signature and the `summarize` call are unchanged.

- [ ] **Step 6: Commit**

```bash
git add evals/assistant/grade.ts tests/assistant/eval-grade.test.ts
git commit -m "test(assistant): grade navigation by selection, landing and task completion"
```

---

### Task 2: Allow official catalog titles in English replies

**Files:**
- Modify: `evals/assistant/grade.ts` (types, `responseProblems`, `gradeTurn`, `summarize`)
- Modify: `evals/assistant/catalog.ts` (export near `EVAL_COURSE_CODES`)
- Modify: `evals/assistant/navigation.eval.ts` (the `gradeTurn` call and its import)
- Test: `tests/assistant/eval-grade.test.ts`
- Test: `tests/assistant/eval-cases.test.ts`

**Interfaces:**
- Consumes: Task 1's `gradeTurn`, `summarize`, `TurnGrade`, `Summary`.
- Produces (used by Tasks 4, 5):
  - `type CatalogFacts = { courseCodes: readonly string[]; officialTitles: readonly string[] }` in `grade.ts`.
  - `gradeTurn(trace: TurnTrace, expectation: TurnExpectation, maxSteps: number, catalog: CatalogFacts): TurnGrade` (fourth parameter changes from `knownCodes`).
  - `TurnGrade.languageOk: boolean | null`; `Summary.language: { checked: number; ok: number }`.
  - `EVAL_CATALOG_FACTS: CatalogFacts` in `catalog.ts`.

Rule: before checking the reply language, remove every exact occurrence of an official title from the fixture catalog (longest first). Whatever Han text remains is the assistant's own prose. An English reply fails if any remains; a Chinese reply fails if none remains. A Simplified rendering or a fragment of a title is not an official title, so it still counts as prose. Language problems still appear in `responseProblems`, so task completion is unchanged in kind; `languageOk` is the separate metric.

- [ ] **Step 1: Write the failing tests**

In `tests/assistant/eval-grade.test.ts`, change the import block to:

```ts
import {
  gradeTurn,
  summarize,
  type CatalogFacts,
  type StepMetrics,
  type ToolCallRecord,
  type TurnExpectation,
  type TurnTrace,
} from "@/evals/assistant/grade";
```

Replace

```ts
const CODES = ["CISC2001", "CISC3014"];
```

with

```ts
const FACTS: CatalogFacts = {
  courseCodes: ["CISC2001", "CISC3014"],
  officialTitles: ["Programming Science", "程式設計科學", "Database Systems", "資料庫系統"],
};
```

Replace

```ts
const grade = (turn: TurnTrace, expectation: TurnExpectation) => gradeTurn(turn, expectation, 5, CODES);
```

with

```ts
const grade = (turn: TurnTrace, expectation: TurnExpectation) => gradeTurn(turn, expectation, 5, FACTS);
```

Append to the end of the file:

```ts
describe("gradeTurn reply language", () => {
  const english: TurnExpectation = { navigate: "forbidden", replyLanguage: "english" };
  const chinese: TurnExpectation = { navigate: "forbidden", replyLanguage: "chinese" };
  const check = (reply: string, expectation: TurnExpectation) => {
    const result = grade(trace({ reply }), expectation);
    return { languageOk: result.languageOk, problems: result.responseProblems };
  };

  it("allows an official catalog title inside an English reply", () => {
    expect(check("**CISC3014 – Database Systems（資料庫系統）** — 3 credits, taught in English.", english)).toEqual({
      languageOk: true,
      problems: [],
    });
  });

  it("still flags Chinese prose in an English reply", () => {
    expect(check("已为你打开 CISC3014 的课程页面。", english)).toEqual({
      languageOk: false,
      problems: ["reply contains Chinese"],
    });
    expect(check("CISC3014 資料庫系統, 3 学分.", english).languageOk).toBe(false);
  });

  it("only exempts titles exactly as the catalog stores them", () => {
    expect(check("CISC3014 (资料库系统) covers SQL.", english).languageOk).toBe(false);
    expect(check("CISC3014 (資料庫) covers SQL.", english).languageOk).toBe(false);
  });

  it("does not let a quoted title make an English reply count as Chinese", () => {
    expect(check("CISC3014 is 資料庫系統, 3 credits.", chinese)).toEqual({
      languageOk: false,
      problems: ["reply is not in Chinese"],
    });
    expect(check("CISC3014 資料庫系統：3 學分，以英文授課。", chinese)).toEqual({ languageOk: true, problems: [] });
  });

  it("leaves languageOk unset when the turn has no language expectation", () => {
    expect(grade(trace({ reply: "Done." }), { navigate: "forbidden" }).languageOk).toBeNull();
  });

  it("counts language checks in the summary", () => {
    const grades = [
      grade(trace({ reply: "Database Systems（資料庫系統）" }), english),
      grade(trace({ reply: "已打开。" }), english),
      grade(trace({ reply: "Done." }), { navigate: "forbidden" }),
    ];
    expect(summarize(grades).language).toEqual({ checked: 2, ok: 1 });
  });
});
```

In `tests/assistant/eval-cases.test.ts`, add `EVAL_CATALOG_FACTS` to the import from `@/evals/assistant/catalog` (keep the list alphabetical: `EVAL_CATALOG_FACTS,` before `EVAL_COURSE_CODES,`), then add this test inside `describe("assistant eval catalog", ...)` after "keeps one review that tries to instruct the assistant":

```ts
  it("lists every fixture course title as an official title and every code as known", async () => {
    for (const code of EVAL_COURSE_CODES) {
      const { course } = await getCourse(getCourseInputSchema.parse({ code }));
      expect(EVAL_CATALOG_FACTS.officialTitles).toEqual(expect.arrayContaining([course.titleEn, course.titleZh]));
    }
    expect(EVAL_CATALOG_FACTS.courseCodes).toEqual(EVAL_COURSE_CODES);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/assistant/eval-grade.test.ts tests/assistant/eval-cases.test.ts`
Expected: FAIL — `CatalogFacts`/`EVAL_CATALOG_FACTS` are not exported, `languageOk` and `summary.language` are undefined, and the English-with-title case still reports "reply contains Chinese".

- [ ] **Step 3: Implement title-aware language grading**

In `evals/assistant/grade.ts`:

Add after the `TurnExpectation` type:

```ts
/** What the fixture catalog knows: codes the reply may mention, and titles it may quote in their original language. */
export type CatalogFacts = { courseCodes: readonly string[]; officialTitles: readonly string[] };
```

In `TurnGrade`, add a field after `compound: boolean | null;`:

```ts
  /** null when the turn has no replyLanguage expectation. */
  languageOk: boolean | null;
```

In `Summary`, add after `compound: { turns: number; complete: number };`:

```ts
  language: { checked: number; ok: number };
```

Add these two functions directly above `responseProblems`:

```ts
function withoutOfficialTitles(reply: string, titles: readonly string[]): string {
  // Longest first, so a title that contains a shorter one is removed whole.
  return [...titles]
    .filter((title) => title !== "")
    .sort((a, b) => b.length - a.length)
    .reduce((text, title) => text.replaceAll(title, " "), reply);
}

function languageProblem(
  reply: string,
  language: TurnExpectation["replyLanguage"],
  officialTitles: readonly string[],
): string | null {
  if (language === undefined) return null;
  const ownChinese = HAN.test(withoutOfficialTitles(reply, officialTitles));
  if (language === "chinese" && !ownChinese) return "reply is not in Chinese";
  if (language === "english" && ownChinese) return "reply contains Chinese";
  return null;
}
```

Change `responseProblems` to take the language result instead of checking Han itself. Its signature becomes:

```ts
function responseProblems(
  trace: TurnTrace,
  expectation: TurnExpectation,
  truncated: boolean,
  knownCodes: readonly string[],
  language: string | null,
): string[] {
```

and replace its two language lines

```ts
  if (expectation.replyLanguage === "chinese" && !HAN.test(trace.reply)) problems.push("reply is not in Chinese");
  if (expectation.replyLanguage === "english" && HAN.test(trace.reply)) problems.push("reply contains Chinese");
```

with

```ts
  if (language !== null) problems.push(language);
```

In `gradeTurn`, change the fourth parameter from `knownCodes: readonly string[],` to `catalog: CatalogFacts,`, and replace

```ts
  const problems = responseProblems(trace, expectation, limits.truncated, knownCodes);
```

with

```ts
  const language = languageProblem(trace.reply, expectation.replyLanguage, catalog.officialTitles);
  const problems = responseProblems(trace, expectation, limits.truncated, catalog.courseCodes, language);
```

and in the returned object add after `compound,`:

```ts
    languageOk: expectation.replyLanguage === undefined ? null : language === null,
```

In `summarize`, add after `const compound = where((grade) => grade.compound !== null);`:

```ts
  const languageChecked = where((grade) => grade.languageOk !== null);
```

and in the returned object add after the `compound:` line:

```ts
    language: { checked: languageChecked.length, ok: languageChecked.filter((grade) => grade.languageOk).length },
```

In `evals/assistant/catalog.ts`, add this import after the `@/lib/site` import, separated by a blank line (relative imports go last in this repo):

```ts
import type { CatalogFacts } from "./grade";
```

and add directly after `export const EVAL_COURSE_CODES = ...;`:

```ts
export const EVAL_CATALOG_FACTS: CatalogFacts = {
  courseCodes: EVAL_COURSE_CODES,
  officialTitles: EVAL_COURSES.flatMap((course) => [course.titleEn, course.titleZh]),
};
```

In `evals/assistant/navigation.eval.ts`, change

```ts
import { EVAL_COURSE_CODES } from "./catalog";
```

to

```ts
import { EVAL_CATALOG_FACTS } from "./catalog";
```

and in `runAll` change

```ts
        grades.push(gradeTurn(trace, evalCase.turns[turn].expect, ASSISTANT_MAX_STEPS, EVAL_COURSE_CODES));
```

to

```ts
        grades.push(gradeTurn(trace, evalCase.turns[turn].expect, ASSISTANT_MAX_STEPS, EVAL_CATALOG_FACTS));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/eval-grade.test.ts tests/assistant/eval-cases.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint evals tests/assistant/eval-grade.test.ts tests/assistant/eval-cases.test.ts --max-warnings=0`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add evals/assistant/grade.ts evals/assistant/catalog.ts evals/assistant/navigation.eval.ts tests/assistant/eval-grade.test.ts tests/assistant/eval-cases.test.ts
git commit -m "test(assistant): allow official catalog titles in English replies"
```

---

### Task 3: Settle "Show me CISC3014" versus "What is CISC3014 about?"

**Files:**
- Modify: `evals/assistant/cases.ts` (the `ambiguous-show-me-en` entry; one new entry after it)
- Modify: `lib/assistant/prompt.ts` (the "To be on a page" bullet)
- Test: `tests/assistant/eval-cases.test.ts`
- Test: `tests/assistant/agent.test.ts`

**Interfaces:**
- Consumes: `EvalCase`, `TurnExpectation` from Tasks 1–2.
- Produces: case ids `ambiguous-show-me-en` (now `navigate: "required"`) and `info-about-course-en` (new, `navigate: "forbidden"`), used by Task 4's targeted run. `EVAL_CASES` grows from 13 cases / 14 turns to 14 cases / 15 turns.

Product rule (record it verbatim in the closure doc in Task 4):

> When the student asks to be shown, or to see, a specific course, instructor or their reviews that the assistant can identify, the assistant opens that page with `navigate`, even if the message does not contain the word "page". When the student asks what a course or instructor is, what it covers, or any other question about it, the assistant answers with lookups and links and does not navigate. When the assistant cannot tell which of the two the student wants, it answers and includes the link. The rule lives in the prompt; there is no keyword routing in code and `toolChoice` stays unset.

The case id `ambiguous-show-me-en` is kept so historical traces still map onto it when regraded.

- [ ] **Step 1: Write the failing case test**

In `tests/assistant/eval-cases.test.ts`, add inside `describe("assistant eval cases", ...)` after "gives every required or optional navigation a destination":

```ts
  it("opens the course page for 'Show me' but only answers 'What is it about'", () => {
    const turnOf = (id: string) => EVAL_CASES.find((evalCase) => evalCase.id === id)?.turns[0];
    expect(turnOf("ambiguous-show-me-en")).toMatchObject({
      message: "Show me CISC3014",
      expect: { navigate: "required", destination: { destination: "course", code: "CISC3014" } },
    });
    expect(turnOf("info-about-course-en")).toMatchObject({
      message: "What is CISC3014 about?",
      expect: { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] },
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/assistant/eval-cases.test.ts`
Expected: FAIL — `ambiguous-show-me-en` expects `optional`, and `info-about-course-en` does not exist.

- [ ] **Step 3: Update the cases**

In `evals/assistant/cases.ts`, replace the whole `ambiguous-show-me-en` entry:

```ts
  {
    id: "ambiguous-show-me-en",
    category: "ambiguous",
    pathname: "/",
    why: "'Show me' a course: opening it or answering with a link are both acceptable.",
    turns: [
      {
        message: "Show me CISC3014",
        expect: {
          navigate: "optional",
          destination: CISC3014,
          tools: [{ name: "get_course", args: { code: "CISC3014" } }],
          replyLanguage: "english",
        },
      },
    ],
  },
```

with:

```ts
  {
    id: "ambiguous-show-me-en",
    category: "ambiguous",
    pathname: "/",
    why: "'Show me' an identifiable course asks for its page, even without the word 'page'; contrast info-about-course-en.",
    turns: [
      {
        message: "Show me CISC3014",
        expect: { navigate: "required", destination: CISC3014, replyLanguage: "english" },
      },
    ],
  },
  {
    id: "info-about-course-en",
    category: "information",
    pathname: "/",
    why: "Asking what a course is about wants an answer, even though the course could be opened.",
    turns: [
      {
        message: "What is CISC3014 about?",
        expect: {
          navigate: "forbidden",
          tools: [{ name: "get_course", args: { code: "CISC3014" } }],
          mustMention: [["Database Systems"], ["SQL", "relational", "normalisation", "normalization", "transaction"]],
          replyLanguage: "english",
        },
      },
    ],
  },
```

- [ ] **Step 4: Run the case tests to verify they pass**

Run: `npx vitest run tests/assistant/eval-cases.test.ts`
Expected: PASS, including "has 10 to 14 cases covering every category" (now exactly 14).

- [ ] **Step 5: Commit the expectation change**

```bash
git add evals/assistant/cases.ts tests/assistant/eval-cases.test.ts
git commit -m "test(assistant): expect 'Show me <course>' to open the course page"
```

- [ ] **Step 6: Write the failing prompt assertion**

In `tests/assistant/agent.test.ts`, in the test "tells the model to tell questions, page requests and compound requests apart", add as the last assertion:

```ts
    expect(ASSISTANT_PROMPT).toContain(
      "Asking to be shown a specific course, instructor or their reviews counts, even without the word page; asking what one is about is a question.",
    );
```

Run: `npx vitest run tests/assistant/agent.test.ts`
Expected: FAIL on that assertion only.

- [ ] **Step 7: Add the sentence to the prompt**

In `lib/assistant/prompt.ts`, in the line starting `"- To be on a page:`, replace

```
Call navigate; do not only reply with a link. Take identifiers from their message,
```

with

```
Call navigate; do not only reply with a link. Asking to be shown a specific course, instructor or their reviews counts, even without the word page; asking what one is about is a question. Take identifiers from their message,
```

Do not touch any other line. The existing assertions `"in any wording or language, including Chinese and Cantonese. Call navigate"` and `"If you cannot tell whether they want an answer or the page, answer and include the link"` must still match.

- [ ] **Step 8: Run the prompt and navigation tests**

Run: `npx vitest run tests/assistant/agent.test.ts tests/assistant/navigation.test.ts tests/components/assistant-runtime.integration.test.tsx`
Expected: PASS, including the "no Han characters" and "leaves the choice of tool to the model" tests.

- [ ] **Step 9: Commit the prompt change**

```bash
git add lib/assistant/prompt.ts tests/assistant/agent.test.ts
git commit -m "feat(assistant): treat a request to be shown a specific course as a page request"
```

---

### Task 4: Freeze the rules, regrade history, and revalidate against DeepSeek

**Files:**
- Create: `evals/assistant/results.ts`
- Create: `evals/assistant/regrade.eval.ts`
- Create: `evals/assistant/report.eval.ts`
- Create: `evals/assistant/README.md`
- Modify: `evals/assistant/navigation.eval.ts` (whole file)
- Test: `tests/assistant/eval-results.test.ts`
- Create: `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md`
- Modify: `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md` (one line under the title)

**Interfaces:**
- Consumes: `gradeTurn`, `summarize`, `CatalogFacts`, `Summary`, `TurnGrade`, `TurnTrace` (Tasks 1–2); `EvalCase`, `EVAL_CASES` (Task 3); `EVAL_CATALOG_FACTS` (Task 2); `PROMPT_FINGERPRINT`, `runCase`, `BudgetExhausted` from `harness.ts`.
- Produces (used by Task 5):
  - `type RunSettings = { model: string; thinking: string; maxOutputTokens: number; maxSteps: number; prompt: string; eval?: string }`
  - `type SavedRun` (live result file; Phase 1 files lack `kind`, `suite`, `cases`, `complete`, `settings.eval`)
  - `type RegradedRun` (regrade result file)
  - `evalFingerprint(suiteCases: readonly EvalCase[]): string`
  - `expectedTurns(cases: readonly EvalCase[], repeats: number): number`
  - `isComplete(cases: readonly EvalCase[], repeats: number, gradedTurns: number, stoppedEarly: string | undefined): boolean`
  - `resultFileName(startedAt: Date, label: string, complete: boolean): string`
  - `positiveInt(name: string, value: string | undefined, fallback: number): number`
  - `regradeTraces(traces: readonly TurnTrace[], cases: readonly EvalCase[], maxSteps: number, catalog: CatalogFacts, repeats: number): { grades: TurnGrade[]; summary: Summary; missing: string[]; unmatched: string[] }`
  - `failureLines(grades: readonly TurnGrade[], traces: readonly TurnTrace[]): string[]`
  - `reportColumn(record: SavedRun | RegradedRun): ReportColumn`, `metricTable(columns: ReportColumn[]): string`, `type ReportColumn = { title: string; summary: Summary; stepsUsed: number }`

Step-budget behaviour this task makes explicit (and documents in the README):
- `ASSISTANT_EVAL_MAX_STEPS` (default 200) is one budget for the whole invocation, shared across all cases and repeats.
- It is checked before each agent run. A run can then take up to `ASSISTANT_MAX_STEPS` (5) model steps, so `stepsUsed` can end up to 4 above the budget. A run that throws before reporting a step costs 1.
- When the budget runs out, the case in progress is abandoned and its turns are discarded. The loop is repeat-outer, so the missing turns are always the last cases of the last repeat and the partial summary is biased.
- From this task on, an incomplete run is written with `complete: false` to a file ending in `-INCOMPLETE.json`, and the Vitest test fails, so the command exits non-zero. `reportColumn` refuses incomplete live runs and Phase 1 live files (which have no `complete` field); Phase 1 files can only be reported after regrading.

Counts reported: "model requests" = model steps (one provider API call each, `summary.limits.steps`); "agent runs" = CopilotKit runs (one `/api/copilotkit` request each in production, `summary.limits.runs`); `stepsUsed` also includes discarded turns and errored runs.

- [ ] **Step 1: Write the failing results tests**

Create `tests/assistant/eval-results.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { EvalCase } from "@/evals/assistant/cases";
import { summarize, type CatalogFacts, type TurnTrace } from "@/evals/assistant/grade";
import {
  evalFingerprint,
  expectedTurns,
  failureLines,
  isComplete,
  metricTable,
  positiveInt,
  regradeTraces,
  reportColumn,
  resultFileName,
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
    expect(table).toContain("| Simulated navigation landed (required turns) | 1/1 |");
    expect(table).toContain("| Model requests: steps graded / steps used | 1 / 1 |");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/assistant/eval-results.test.ts`
Expected: FAIL — `@/evals/assistant/results` does not exist.

- [ ] **Step 3: Implement `results.ts`**

Create `evals/assistant/results.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { EvalCase } from "./cases";
import { gradeTurn, summarize, type CatalogFacts, type Summary, type TurnGrade, type TurnTrace } from "./grade";

export type RunSettings = {
  model: string;
  thinking: string;
  maxOutputTokens: number;
  maxSteps: number;
  prompt: string;
  /** Absent in Phase 1 files. */
  eval?: string;
};

/** A file written by navigation.eval.ts. Phase 1 files have no kind, suite, cases, complete or settings.eval. */
export type SavedRun = {
  kind?: "live";
  label: string;
  suite?: string;
  cases?: string[];
  settings: RunSettings;
  repeats: number;
  stepBudget?: number;
  stepsUsed: number;
  complete?: boolean;
  expectedTurns?: number;
  stoppedEarly?: string;
  summary: Summary;
  grades: TurnGrade[];
  traces: TurnTrace[];
  failures?: string[];
};

export type RegradedRun = {
  kind: "regraded";
  source: string;
  label: string;
  sourceSettings: RunSettings;
  sourceStepsUsed: number;
  sourceStoppedEarly?: string;
  evalFingerprint: string;
  repeats: number;
  missing: string[];
  failures: string[];
  summary: Summary;
  grades: TurnGrade[];
};

const GRADING_SOURCES = ["evals/assistant/grade.ts", "evals/assistant/catalog.ts"];

/** Changes when the grader, the fixture catalog or any case in the suite changes. */
export function evalFingerprint(suiteCases: readonly EvalCase[]): string {
  const hash = createHash("sha256");
  for (const file of GRADING_SOURCES) hash.update(readFileSync(path.join(process.cwd(), file)));
  return hash.update(JSON.stringify(suiteCases)).digest("hex").slice(0, 12);
}

export const expectedTurns = (cases: readonly EvalCase[], repeats: number) =>
  repeats * cases.reduce((sum, evalCase) => sum + evalCase.turns.length, 0);

export const isComplete = (
  cases: readonly EvalCase[],
  repeats: number,
  gradedTurns: number,
  stoppedEarly: string | undefined,
) => stoppedEarly === undefined && gradedTurns === expectedTurns(cases, repeats);

export const resultFileName = (startedAt: Date, label: string, complete: boolean) =>
  `${startedAt.toISOString().replace(/[:.]/g, "-")}-${label}${complete ? "" : "-INCOMPLETE"}.json`;

export function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer, got "${value}"`);
  return parsed;
}

export function regradeTraces(
  traces: readonly TurnTrace[],
  cases: readonly EvalCase[],
  maxSteps: number,
  catalog: CatalogFacts,
  repeats: number,
): { grades: TurnGrade[]; summary: Summary; missing: string[]; unmatched: string[] } {
  const grades: TurnGrade[] = [];
  const unmatched: string[] = [];
  const counts = new Map<string, number>();
  for (const trace of traces) {
    const key = `${trace.caseId}#${trace.turn + 1}`;
    const turn = cases.find((evalCase) => evalCase.id === trace.caseId)?.turns[trace.turn];
    if (!turn) {
      unmatched.push(key);
      continue;
    }
    if (turn.message !== trace.message) {
      throw new Error(`${key}: saved message "${trace.message}" differs from the case`);
    }
    grades.push(gradeTurn(trace, turn.expect, maxSteps, catalog));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const missing = cases
    .flatMap((evalCase) => evalCase.turns.map((_, turn) => `${evalCase.id}#${turn + 1}`))
    .filter((key) => (counts.get(key) ?? 0) < repeats)
    .map((key) => `${key}: ${counts.get(key) ?? 0}/${repeats}`);
  return { grades, summary: summarize(grades), missing, unmatched };
}

export function failureLines(grades: readonly TurnGrade[], traces: readonly TurnTrace[]): string[] {
  return grades
    .filter((grade) => !grade.pass)
    .map((grade) => {
      const trace = traces.find(
        (entry) => entry.caseId === grade.caseId && entry.repeat === grade.repeat && entry.turn === grade.turn,
      );
      const calls = trace?.toolCalls.map((call) => `${call.name} ${JSON.stringify(call.args)}`).join("; ") || "no tools";
      const reply = (trace?.reply ?? "").replace(/\s+/g, " ").slice(0, 120);
      return (
        `${grade.caseId} repeat ${grade.repeat} turn ${grade.turn + 1}: ${calls}; reply "${reply}"; ` +
        `selection ${grade.selection}, status ${grade.navigateStatus ?? "none"}, landed ${grade.landed ?? "n/a"}; ` +
        `problems: ${grade.responseProblems.join(", ") || "none"}`
      );
    });
}

export type ReportColumn = { title: string; summary: Summary; stepsUsed: number };

export function reportColumn(record: SavedRun | RegradedRun): ReportColumn {
  if (record.kind === "regraded") {
    return {
      title: `Regraded: ${record.label} (prompt ${record.sourceSettings.prompt}, eval ${record.evalFingerprint})`,
      summary: record.summary,
      stepsUsed: record.sourceStepsUsed,
    };
  }
  if (record.kind !== "live" || record.complete !== true) {
    throw new Error(`${record.label}: incomplete or pre-closure live run; regrade it instead`);
  }
  return {
    title: `Live: ${record.label} (prompt ${record.settings.prompt}, eval ${record.settings.eval})`,
    summary: record.summary,
    stepsUsed: record.stepsUsed,
  };
}

const ratio = (part: number, whole: number) => `${part}/${whole}`;
const counts = (values: Record<string, number>) =>
  Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ") || "none";

const METRICS: Array<[string, (summary: Summary, stepsUsed: number) => string]> = [
  ["Task completion (turns passed)", (s) => ratio(s.passed, s.turns)],
  ["Tool selection: required navigate correct", (s) => ratio(s.toolSelection.correct, s.toolSelection.required)],
  [
    "Tool selection: missed (omissions) / invalid arguments / wrong page",
    (s) =>
      `${s.toolSelection.missed} (${s.toolSelection.omissions}) / ${s.toolSelection.invalidArguments} / ${s.toolSelection.wrongDestination}`,
  ],
  ["Unsolicited navigation", (s) => ratio(s.unsolicited.navigated, s.unsolicited.forbidden)],
  ["Simulated navigation landed (required turns)", (s) => ratio(s.simulatedNavigation.landed, s.simulatedNavigation.required)],
  ["First navigate status (required turns)", (s) => counts(s.simulatedNavigation.statuses)],
  ["Academic tools correct", (s) => ratio(s.academicTools.ok, s.academicTools.required)],
  ["Compound requests complete", (s) => ratio(s.compound.complete, s.compound.turns)],
  ["Language correct", (s) => ratio(s.language.ok, s.language.checked)],
  ["Replies without problems", (s) => ratio(s.responses.ok, s.responses.total)],
  ["Truncated turns (finish: length)", (s) => ratio(s.limits.truncatedTurns, s.turns)],
  ["Finish reasons (steps)", (s) => counts(s.limits.finishCounts)],
  ["Model requests: steps graded / steps used", (s, used) => `${s.limits.steps} / ${used}`],
  [
    "Agent runs: total (mean / max per turn)",
    (s) => `${s.limits.runs} (${s.limits.runsPerTurnMean.toFixed(2)} / ${s.limits.runsPerTurnMax})`,
  ],
  ["Most steps in one run / maxSteps hits", (s) => `${s.limits.maxStepsInRun} / ${s.limits.maxStepsHits}`],
  ["Latency p50 / p90", (s) => `${s.limits.latencyP50Ms} ms / ${s.limits.latencyP90Ms} ms`],
  [
    "Input tokens (cached) / output tokens",
    (s) => `${s.limits.inputTokens} (${s.limits.cachedInputTokens}) / ${s.limits.outputTokens}`,
  ],
  ["Most output tokens in one step", (s) => String(s.limits.maxStepOutputTokens)],
];

export function metricTable(columns: ReportColumn[]): string {
  return [
    `| Metric | ${columns.map((column) => column.title).join(" | ")} |`,
    `|---|${columns.map(() => "---").join("|")}|`,
    ...METRICS.map(
      ([name, pick]) => `| ${name} | ${columns.map((column) => pick(column.summary, column.stepsUsed)).join(" | ")} |`,
    ),
  ].join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/eval-results.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Make the live entry fail on incomplete runs**

Replace the whole of `evals/assistant/navigation.eval.ts` with:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/data/search-catalog", async () => ({ searchCatalog: (await import("./catalog")).searchCatalog }));
vi.mock("@/lib/mcp/data/get-course", async () => ({ getCourse: (await import("./catalog")).getCourse }));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({ getInstructor: (await import("./catalog")).getInstructor }));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("./catalog")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("./catalog")).getCourseSections,
}));

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

import { EVAL_CASES, type EvalCase } from "./cases";
import { EVAL_CATALOG_FACTS } from "./catalog";
import { gradeTurn, summarize, type TurnGrade, type TurnTrace } from "./grade";
import { BudgetExhausted, PROMPT_FINGERPRINT, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import { evalFingerprint, expectedTurns, failureLines, isComplete, positiveInt, resultFileName } from "./results";

const env = process.env;
const enabled = env.ASSISTANT_EVAL === "1";

function readLocalEnv(names: readonly string[]): Record<string, string> {
  if (!existsSync(".env.local")) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && names.includes(match[1])) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

// Model, thinking mode and step limits stay at the production defaults; only credentials come from the environment.
const local = enabled ? readLocalEnv(["AI_API_KEY", "AI_BASE_URL"]) : {};
const config = readAssistantConfig({
  AI_API_KEY: env.AI_API_KEY ?? local.AI_API_KEY,
  AI_BASE_URL: env.AI_BASE_URL ?? local.AI_BASE_URL,
  AI_MAX_OUTPUT_TOKENS: env.ASSISTANT_EVAL_MAX_OUTPUT_TOKENS,
});
const repeats = positiveInt("ASSISTANT_EVAL_REPEATS", env.ASSISTANT_EVAL_REPEATS, 3);
const stepBudget = positiveInt("ASSISTANT_EVAL_MAX_STEPS", env.ASSISTANT_EVAL_MAX_STEPS, 200);
const delayMs = Number(env.ASSISTANT_EVAL_DELAY_MS ?? "500");
const label = env.ASSISTANT_EVAL_LABEL ?? "run";
const only = env.ASSISTANT_EVAL_CASES?.split(",").map((id) => id.trim());

async function runAll(cases: EvalCase[], budget: EvalBudget, traces: TurnTrace[], grades: TurnGrade[]) {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const evalCase of cases) {
      const options: HarnessOptions = { config, budget, repeat };
      let caseTraces: TurnTrace[];
      try {
        caseTraces = await runCase(evalCase, options);
      } catch (error) {
        if (error instanceof BudgetExhausted) return `${error.message} during ${evalCase.id} repeat ${repeat}`;
        throw error;
      }
      caseTraces.forEach((trace, turn) => {
        traces.push(trace);
        grades.push(gradeTurn(trace, evalCase.turns[turn].expect, ASSISTANT_MAX_STEPS, EVAL_CATALOG_FACTS));
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return undefined;
}

describe.skipIf(!enabled)("assistant navigation behaviour against the real model", () => {
  it("runs the eval cases and writes the results", async () => {
    const suite = "navigation";
    const suiteCases = EVAL_CASES;
    const unknown = (only ?? []).filter((id) => !suiteCases.some((evalCase) => evalCase.id === id));
    expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the suite").toEqual([]);
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();
    const cases = suiteCases.filter((evalCase) => !only || only.includes(evalCase.id));
    expect(cases.length, "no eval case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const startedAt = new Date();
    const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
    const traces: TurnTrace[] = [];
    const grades: TurnGrade[] = [];
    const stoppedEarly = await runAll(cases, budget, traces, grades);
    const complete = isComplete(cases, repeats, grades.length, stoppedEarly);

    const header = {
      kind: "live" as const,
      label,
      suite,
      cases: cases.map((evalCase) => evalCase.id),
      settings: {
        model: config.model,
        thinking: config.thinking,
        maxOutputTokens: config.maxOutputTokens,
        maxSteps: ASSISTANT_MAX_STEPS,
        prompt: PROMPT_FINGERPRINT,
        eval: evalFingerprint(suiteCases),
      },
      repeats,
      stepBudget,
      stepsUsed: budget.used,
      complete,
      expectedTurns: expectedTurns(cases, repeats),
      stoppedEarly,
    };
    const summary = summarize(grades);
    const failures = failureLines(grades, traces);
    const file = path.join(".eval-results", "assistant", resultFileName(startedAt, label, complete));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...header, summary, failures, grades, traces }, null, 2));
    console.info(JSON.stringify({ file, ...header, summary, failures }, null, 2));
    expect(complete, `incomplete run, partial results in ${file}: ${stoppedEarly ?? "turn count mismatch"}`).toBe(true);
  });
});
```

- [ ] **Step 6: Add the regrade and report entries**

Create `evals/assistant/regrade.eval.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EVAL_CASES } from "./cases";
import { EVAL_CATALOG_FACTS } from "./catalog";
import { evalFingerprint, failureLines, regradeTraces, resultFileName, type RegradedRun, type SavedRun } from "./results";

const sources = (process.env.ASSISTANT_REGRADE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

describe.skipIf(sources.length === 0)("regrade saved assistant eval traces", () => {
  it("regrades every file under the current rules", () => {
    for (const source of sources) {
      const saved = JSON.parse(readFileSync(source, "utf8")) as SavedRun;
      const regraded = regradeTraces(saved.traces, EVAL_CASES, saved.settings.maxSteps, EVAL_CATALOG_FACTS, saved.repeats);
      expect(regraded.unmatched, `${source}: saved turns whose case was removed`).toEqual([]);

      const record: RegradedRun = {
        kind: "regraded",
        source: path.basename(source),
        label: saved.label,
        sourceSettings: saved.settings,
        sourceStepsUsed: saved.stepsUsed,
        sourceStoppedEarly: saved.stoppedEarly,
        evalFingerprint: evalFingerprint(EVAL_CASES),
        repeats: saved.repeats,
        missing: regraded.missing,
        failures: failureLines(regraded.grades, saved.traces),
        summary: regraded.summary,
        grades: regraded.grades,
      };
      const file = path.join(".eval-results", "assistant", resultFileName(new Date(), `regrade-${saved.label}`, true));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(record, null, 2));
      const { grades: _grades, ...printed } = record;
      console.info(JSON.stringify({ file, ...printed }, null, 2));
    }
  });
});
```

Create `evals/assistant/report.eval.ts`:

```ts
import { readFileSync } from "node:fs";

import { describe, it } from "vitest";

import { metricTable, reportColumn, type RegradedRun, type SavedRun } from "./results";

const files = (process.env.ASSISTANT_REPORT ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

describe.skipIf(files.length === 0)("assistant eval report", () => {
  it("prints one metric table for the given result files", () => {
    const columns = files.map((file) => reportColumn(JSON.parse(readFileSync(file, "utf8")) as SavedRun | RegradedRun));
    console.info(`\n${metricTable(columns)}\n`);
  });
});
```

- [ ] **Step 7: Document the harness**

Create `evals/assistant/README.md`:

````markdown
# Assistant eval

Real-model checks of the assistant's tool use. Opt-in only: nothing here runs in `npm test`, and the live entry does nothing unless `ASSISTANT_EVAL=1`. Server tools read the fictional catalog in `catalog.ts`; `navigate` and `check_plan_conflicts` are simulated the way CopilotKit 1.79.1 runs frontend tools.

## Live run

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=closure npm run eval:assistant -- evals/assistant/navigation.eval.ts
```

| Variable | Default | Meaning |
|---|---|---|
| `ASSISTANT_EVAL` | unset | Must be `1` to call the model. |
| `ASSISTANT_EVAL_LABEL` | `run` | Suffix of the result file name. |
| `ASSISTANT_EVAL_REPEATS` | `3` | Times each case runs. Must be a positive integer. |
| `ASSISTANT_EVAL_CASES` | all | Comma-separated case ids. An unknown id fails the run before any model call. |
| `ASSISTANT_EVAL_MAX_STEPS` | `200` | Global model-step budget for the whole invocation. |
| `ASSISTANT_EVAL_DELAY_MS` | `500` | Pause between cases. |
| `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS` | production default (400) | Output budget per step. Only for the Phase 2 comparison. |

`AI_API_KEY` and `AI_BASE_URL` come from the environment or `.env.local`. Model, thinking mode and `maxSteps` are always the production defaults.

## Step budget and incomplete runs

- `ASSISTANT_EVAL_MAX_STEPS` is one budget shared by every case and repeat in the invocation, not a per-case limit.
- It is checked before each agent run. A run can then take up to `ASSISTANT_MAX_STEPS` (5) model steps, so `stepsUsed` can end up to 4 above the budget. A run that throws before reporting a step counts as 1.
- When the budget runs out, the case in progress is abandoned and its turns are discarded. Repeats are the outer loop, so the missing turns are always the last cases of the last repeat, and the partial summary is biased toward earlier cases.
- An incomplete run is still written, with `complete: false`, `stoppedEarly` and a file name ending in `-INCOMPLETE.json`, and the test then fails so the command exits non-zero. `report.eval.ts` refuses to print it.
- `stepsUsed` counts every model step spent, including discarded turns. `summary.limits.steps` counts only steps in graded turns.

## Counts

- Model requests: `summary.limits.steps`, one provider API call per step.
- Agent runs: `summary.limits.runs`, one CopilotKit run each (one `/api/copilotkit` request in production). A turn that calls a frontend tool takes one follow-up run per tool batch.

## Grading

`grade.ts` reports three navigation layers separately:

1. Tool selection, from the first `navigate` call: `correct`, `missed`, `invalid_arguments`, `wrong_destination` (or `unsolicited` on question turns).
2. Simulated navigation: a call to the expected page returned `navigated` or `already_here` and the turn ended on that page's path.
3. Task completion (`pass`): the end state. The page landed when one was needed, the lookups ran (before the landing call for compound requests), and the reply has no problems.

Reply language ignores exact official course titles from the fixture catalog. Any other Han text in an English reply counts as Chinese prose.

`settings.eval` is a fingerprint of `grade.ts`, `catalog.ts` and the suite's cases. Results are comparable only when it matches.

## Regrade and report

```bash
ASSISTANT_REGRADE=.eval-results/assistant/A.json,.eval-results/assistant/B.json npm run eval:assistant -- evals/assistant/regrade.eval.ts
ASSISTANT_REPORT=.eval-results/assistant/<regrade>.json,.eval-results/assistant/<live>.json npm run eval:assistant -- evals/assistant/report.eval.ts
```

Regrading reads the saved traces and grades them under the current rules without calling the model. It writes a `kind: "regraded"` file that keeps the source's settings and lists turns the source never ran (`missing`). Report columns are titled `Regraded:` or `Live:`.
````

- [ ] **Step 8: Verify the entries stay opt-in and check the code**

Run: `npm run eval:assistant`
Expected: exit 0. Vitest reports every suite in `navigation.eval.ts`, `regrade.eval.ts` and `report.eval.ts` as skipped, and no network request is made.

Run: `ASSISTANT_EVAL=1 ASSISTANT_EVAL_CASES=no-such-case npm run eval:assistant -- evals/assistant/navigation.eval.ts`
Expected: FAIL with "ASSISTANT_EVAL_CASES names cases that are not in the suite", before any model call (this needs no network).

Run: `npx tsc --noEmit && npx eslint evals tests/assistant --max-warnings=0 && npx vitest run tests/assistant`
Expected: exit 0.

- [ ] **Step 9: Commit and freeze the grading rules**

```bash
git add evals/assistant/results.ts evals/assistant/navigation.eval.ts evals/assistant/regrade.eval.ts evals/assistant/report.eval.ts evals/assistant/README.md tests/assistant/eval-results.test.ts
git commit -m "test(assistant): fail incomplete eval runs and regrade saved traces"
git rev-parse --short HEAD
```

Record the printed hash as the **grading freeze commit**. From here until Step 17, `grade.ts`, `catalog.ts` and `cases.ts` must not change (Global Constraints).

- [ ] **Step 10: Regrade the two Phase 1 traces**

Run:

```bash
ASSISTANT_REGRADE=.eval-results/assistant/2026-10-22T10-08-34-262Z-baseline.json,.eval-results/assistant/2026-10-22T10-15-33-091Z-revised.json npm run eval:assistant -- evals/assistant/regrade.eval.ts
```

Expected: exit 0 and two new files `.eval-results/assistant/<timestamp>-regrade-baseline.json` and `...-regrade-revised.json`. Each must show `summary.turns` 42, `missing: ["info-about-course-en#1: 0/3"]` and the same `evalFingerprint`. Record that fingerprint.

Sanity check against what the saved traces contain. If any of these differ, stop and debug the grader before going on:
- Baseline: `toolSelection` `{ required: 30, correct: 24, missed: 3, invalidArguments: 3, wrongDestination: 0 }`, `simulatedNavigation.landed` 24, and `simulatedNavigation.statuses` `{ invalid_destination: 3, navigated: 24, no_call: 3 }`. The three invalid calls are the reviews page with no instructor, which the Phase 1 grader called "wrong destination". The three misses are `ambiguous-show-me-en`, which only called `get_course`.
- Revised: `toolSelection` `{ required: 30, correct: 27, missed: 3, invalidArguments: 0, wrongDestination: 0 }`, `simulatedNavigation.landed` 27, and `statuses` `{ navigated: 27, no_call: 3 }`.

- [ ] **Step 11: Get budget approval before any real API call**

Ask the user (AskQuestion) to approve the real-model budget, giving these numbers:
- Smoke: 1 turn, capped at 6 steps.
- Closure run: 14 cases, 15 turns × 3 repeats = 45 turns. Phase 1 used 88 and 94 steps for 42 turns, so expect about 95–110 steps, capped at 200.
- Targeted run: `ambiguous-show-me-en` and `info-about-course-en` × 5 repeats = 10 turns, about 20–25 steps, capped at 60.
- Total cap: 266 steps. Calls go directly to the provider with the `AI_API_KEY` in `.env.local`, one at a time, not through `/api/copilotkit`. The commands need unrestricted network access.

Options: approve all; approve the closure run only (skip the targeted run); decline. If declined, or if there is no key or network: skip Steps 12–14, and write "No new DeepSeek runs: <reason>" into the closure record. The regraded results still stand.

- [ ] **Step 12: Smoke-test one case**

Run (with `required_permissions: ["full_network"]`):

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=closure-smoke ASSISTANT_EVAL_REPEATS=1 ASSISTANT_EVAL_CASES=ambiguous-show-me-en ASSISTANT_EVAL_MAX_STEPS=6 npm run eval:assistant -- evals/assistant/navigation.eval.ts
```

Expected: exit 0, `complete: true`, `settings` `{ model: "deepseek-flash", thinking: "off", maxOutputTokens: 400, maxSteps: 5 }`, `settings.prompt` different from `3352ad96465d` (the Task 3 sentence changed it), and `settings.eval` equal to the fingerprint from Step 10. If `settings.eval` differs, the grading files changed after the freeze: stop.

If the request times out and the machine needs a proxy, retry with `NODE_USE_ENV_PROXY=1` prefixed. If the provider rejects the model, stop and ask the user; do not change the model.

- [ ] **Step 13: Run the full closure benchmark**

Run (with `required_permissions: ["full_network"]`):

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=closure npm run eval:assistant -- evals/assistant/navigation.eval.ts
```

Expected: exit 0, `complete: true`, `expectedTurns` 45, `summary.turns` 45, `stepsUsed` at most 204.

If it exits non-zero with an `-INCOMPLETE.json` file, do not re-run automatically. Report the partial file and `stoppedEarly` to the user and ask before spending more budget.

- [ ] **Step 14: Run the targeted show-versus-ask check**

Run (with `required_permissions: ["full_network"]`; skip if the user approved the closure run only):

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=closure-show-me ASSISTANT_EVAL_CASES=ambiguous-show-me-en,info-about-course-en ASSISTANT_EVAL_REPEATS=5 ASSISTANT_EVAL_MAX_STEPS=60 npm run eval:assistant -- evals/assistant/navigation.eval.ts
```

Expected: exit 0, `complete: true`, `summary.turns` 10.

Decision on the Task 3 prompt sentence, pooling `closure` and `closure-show-me` (8 turns of each case):
- Keep it if `ambiguous-show-me-en` landed in at least 6 of 8 turns, `info-about-course-en` had 0 unsolicited navigations in 8 turns, and `summary.unsolicited.navigated` in `closure` is 0.
- Otherwise stop and ask the user (AskQuestion) whether to keep the sentence or `git revert` the Task 3 prompt commit. Do not iterate on prompt wording in this plan. Whichever they choose, list the shortfall as a genuine agent failure.

- [ ] **Step 15: Print the comparison tables**

Run:

```bash
ASSISTANT_REPORT=.eval-results/assistant/<regrade-baseline>.json,.eval-results/assistant/<regrade-revised>.json,.eval-results/assistant/<closure>.json npm run eval:assistant -- evals/assistant/report.eval.ts
ASSISTANT_REPORT=.eval-results/assistant/<closure-show-me>.json npm run eval:assistant -- evals/assistant/report.eval.ts
```

(Use the real file names from Steps 10, 13 and 14.) Expected: two markdown tables whose column titles start with `Regraded:` or `Live:`. Copy them into the record unchanged.

For the remaining-failures section, print the failure lines of the live runs:

```bash
node -e 'for (const f of process.argv.slice(1)) { const r = require(require("path").resolve(f)); console.log(`## ${r.label}`); for (const line of r.failures) console.log(`- ${line}`); }' .eval-results/assistant/<closure>.json .eval-results/assistant/<closure-show-me>.json
```

- [ ] **Step 16: Write the closure record**

Create `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md` with the sections below. Every number comes from the files named above; quote the tables from Step 15 verbatim.

```markdown
# Assistant V1-E Phase 1 closure: evaluation quality

- Branch: `feat/global-assistant-v1`
- Grading freeze commit: `<hash from Step 9>`; eval fingerprint `<settings.eval>`
- Prompt fingerprints: baseline `e4f5f5b5a758`, Phase 1 revised `3352ad96465d`, closure `<settings.prompt from the closure run>`
- Model settings (production defaults): `deepseek-flash`, thinking off, 400 output tokens per step, `maxSteps` 5

## 1. What changed in grading

- Navigation has three separate layers. Tool selection is judged on the first `navigate` call: missed, invalid arguments, wrong page, or correct. Simulated navigation needs a call to the expected page that returned `navigated` or `already_here`, and the turn has to end on that page's path. Task completion is judged on the end state, the required lookups, and the reply. Calling `navigate` no longer counts as completing the task.
- The reply-language check ignores exact official course titles from the fixture catalog (`EVAL_CATALOG_FACTS.officialTitles`). Any other Han text in an English reply is still a failure. A Simplified rendering or a fragment of a title is not exempt.
- "Show me CISC3014" now requires navigation (section 2). New case `info-about-course-en` ("What is CISC3014 about?") forbids it.
- Regression tests for `not_found`, `invalid_destination`, `timeout`, `landed_elsewhere`, a wrong final path, a missing result, and a retry that lands: `tests/assistant/eval-grade.test.ts`.

## 2. Product rule: being shown a page versus asking about it

<the product rule paragraph from Task 3, verbatim>

Prompt change: one sentence in the "To be on a page" bullet (commit `<hash>`). Decision from Task 4 Step 14: <kept / reverted, with the pooled counts>.

## 3. Results

Regraded columns are the Phase 1 traces graded again under the frozen rules, with no new model calls. Live columns are new DeepSeek runs from <date>. The regraded runs have 42 turns because `info-about-course-en` did not exist then (`missing: info-about-course-en#1: 0/3`); the closure run has 45.

<table from the first report command>

Targeted show-versus-ask run (live, 5 repeats):

<table from the second report command>

## 4. How the regrade moved the Phase 1 numbers

For each of the regraded baseline and revised runs, compare against the Phase 1 record (`2026-10-22-assistant-v1e-phase1.md` section 5: 26/42 and 36/42 turns passed). List each change in pass count and the rule that caused it: landing check, title exemption, or the show-me expectation.

## 5. Step budget and completeness

Summarise `evals/assistant/README.md` "Step budget and incomplete runs". State `stepsUsed` against the budget for each live run and confirm `complete: true`.

## 6. Remaining genuine agent failures

One line per failing live turn (from `failures`), grouped as: missed or wrong navigation; navigation that did not land; Chinese prose in English replies; Simplified versus Traditional script (read by hand: the grader does not check script); `finish: length`; missing lookups. For each group, say whether it repeats across repeats or appears once.

## 7. Phase 2 recommendation

Written in Task 5.

## 8. Automated checks

Written in Task 6.
```

Add this line directly under the title of `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md`:

```markdown
> Grading note: the pass counts below come from the Phase 1 grader. They are regraded under the stricter closure rules in [2026-10-22-assistant-v1e-phase1-closure.md](2026-10-22-assistant-v1e-phase1-closure.md).
```

- [ ] **Step 17: Commit the record**

```bash
git add docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md
git commit -m "docs(assistant): record the V1-E phase 1 closure benchmark"
```

The grading freeze ends here.

---

### Task 5: Prepare the Phase 2 output-token experiment

**Files:**
- Create: `evals/assistant/token-cases.ts`
- Create: `evals/assistant/compare.ts`
- Create: `evals/assistant/compare.eval.ts`
- Modify: `evals/assistant/navigation.eval.ts` (suite selection)
- Modify: `evals/assistant/README.md` (suite and compare sections)
- Test: `tests/assistant/eval-token-cases.test.ts`
- Test: `tests/assistant/eval-compare.test.ts`
- Create: `docs/superpowers/specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md`
- Modify: `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md` (section 7)

**Interfaces:**
- Consumes: `EVAL_CASES`, `EvalCase` (Task 3); `SavedRun`, `evalFingerprint` (Task 4); `StepMetrics` (Task 1).
- Produces:
  - `TOKEN_CASES: EvalCase[]` (ids `info-compare-zh-hant`, `tokens-compare-instructors-zh-hant`, `tokens-explain-course-zh-hant`, `tokens-explain-course-en`).
  - `ASSISTANT_EVAL_SUITE` = `navigation` (default) or `tokens`.
  - `type Prices = { inputCacheMiss: number; inputCacheHit: number; output: number }` (USD per million tokens).
  - `checkControlled(runs: Array<{ file: string; run: SavedRun }>): string[]`, `costOf(steps: StepMetrics[], prices: Prices): number`, `armReport(file: string, run: SavedRun, prices: Prices | null): ArmReport`.

Scope: this task builds and documents the experiment. It runs no Phase 2 model calls.

- [ ] **Step 1: Write the failing suite and comparison tests**

Create `tests/assistant/eval-token-cases.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { EVAL_CASES } from "@/evals/assistant/cases";
import { EVAL_COURSE_CODES, getCourseReviews } from "@/evals/assistant/catalog";
import { TOKEN_CASES } from "@/evals/assistant/token-cases";
import { describePage } from "@/lib/assistant/page-context";
import { getCourseReviewsInputSchema } from "@/lib/mcp/schemas";

const signal = new AbortController().signal;
const turns = TOKEN_CASES.flatMap((evalCase) => evalCase.turns);

describe("phase 2 token suite", () => {
  it("reuses the Phase 1 comparison case unchanged and adds new ids only", () => {
    expect(TOKEN_CASES[0]).toBe(EVAL_CASES.find((evalCase) => evalCase.id === "info-compare-zh-hant"));
    const newIds = TOKEN_CASES.slice(1).map((evalCase) => evalCase.id);
    expect(newIds.every((id) => id.startsWith("tokens-"))).toBe(true);
    expect(new Set(TOKEN_CASES.map((evalCase) => evalCase.id)).size).toBe(TOKEN_CASES.length);
  });

  it("is mostly Traditional Chinese, with one English control", () => {
    expect(turns.map((turn) => turn.expect.replyLanguage)).toEqual(["chinese", "chinese", "chinese", "english"]);
  });

  it("only asks questions, so no turn may navigate", () => {
    expect(turns.every((turn) => turn.expect.navigate === "forbidden")).toBe(true);
  });

  it("starts on pages the assistant can describe", () => {
    for (const evalCase of TOKEN_CASES) expect(describePage(evalCase.pathname).page).not.toBe("other");
  });

  it("only expects lookups the fixture catalog can answer", async () => {
    for (const tool of turns.flatMap((turn) => turn.expect.tools ?? [])) {
      expect(EVAL_COURSE_CODES).toContain(tool.args?.code);
      if (tool.args?.instructor) {
        await expect(
          getCourseReviews(getCourseReviewsInputSchema.parse({ code: tool.args.code, instructor: tool.args.instructor }), signal),
        ).resolves.toBeDefined();
      }
    }
  });
});
```

Create `tests/assistant/eval-compare.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/assistant/eval-token-cases.test.ts tests/assistant/eval-compare.test.ts`
Expected: FAIL — `token-cases` and `compare` modules do not exist.

- [ ] **Step 3: Create the Phase 2 suite**

Create `evals/assistant/token-cases.ts`:

```ts
import { EVAL_CASES, type EvalCase } from "./cases";

const infoCompare = EVAL_CASES.find((evalCase) => evalCase.id === "info-compare-zh-hant");
if (!infoCompare) throw new Error("info-compare-zh-hant is missing from EVAL_CASES");

const CISC3014_OVERVIEW_TOOLS = [
  { name: "get_course" as const, args: { code: "CISC3014" } },
  { name: "get_course_reviews" as const, args: { code: "CISC3014", instructor: "CHAN TAI MAN" } },
  { name: "get_course_sections" as const, args: { code: "CISC3014", instructor: "CHAN TAI MAN" } },
];

/** Phase 2 output-budget suite: long Traditional Chinese comparisons and explanations, plus one English control. */
export const TOKEN_CASES: EvalCase[] = [
  infoCompare,
  {
    id: "tokens-compare-instructors-zh-hant",
    category: "information",
    pathname: "/course/CISC2001",
    why: "Compares two instructors of the current course on ratings and reviews.",
    turns: [
      {
        message: "這門課的 WONG KA KI 和 LI MEI 哪位比較適合我？請比較評分、給分、出席和學生評價。",
        expect: {
          navigate: "forbidden",
          tools: [
            { name: "get_course_reviews", args: { code: "CISC2001", instructor: "WONG KA KI" } },
            { name: "get_course_reviews", args: { code: "CISC2001", instructor: "LI MEI" } },
          ],
          mustMention: [["WONG KA KI"], ["LI MEI"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "tokens-explain-course-zh-hant",
    category: "information",
    pathname: "/",
    why: "A long explanation that needs the course, its reviews and its sections.",
    turns: [
      {
        message: "請詳細介紹 CISC3014：課程內容、學分、授課老師、學生評價和上課時間。",
        expect: {
          navigate: "forbidden",
          tools: CISC3014_OVERVIEW_TOOLS,
          mustMention: [["資料庫系統", "Database Systems"], ["CHAN TAI MAN"], ["10:00"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "tokens-explain-course-en",
    category: "information",
    pathname: "/",
    why: "English control for the same explanation, to separate reply language from reply length.",
    turns: [
      {
        message:
          "Give me a detailed overview of CISC3014: what it covers, credits, who teaches it, what students say, and when it meets.",
        expect: {
          navigate: "forbidden",
          tools: CISC3014_OVERVIEW_TOOLS,
          mustMention: [["Database Systems"], ["CHAN TAI MAN"], ["10:00"]],
          replyLanguage: "english",
        },
      },
    ],
  },
];
```

- [ ] **Step 4: Create the comparison**

Create `evals/assistant/compare.ts`:

```ts
import type { StepMetrics } from "./grade";
import type { RunSettings, SavedRun } from "./results";

/** USD per million tokens, from the provider's price list on the day of the runs. */
export type Prices = { inputCacheMiss: number; inputCacheHit: number; output: number };

export type ArmReport = {
  file: string;
  maxOutputTokens: number;
  turns: number;
  passed: number;
  truncatedTurns: number;
  steps: number;
  lengthSteps: number;
  outputTokens: number;
  /** Steps that ended the reply (stop or length), where the output budget binds. */
  answerOutputTokens: { p50: number; p90: number; max: number };
  latencyMs: { p50: number; p90: number };
  replyChars: { p50: number; p90: number };
  costUsd: number | null;
  byCase: Record<string, { passed: number; total: number; truncated: number }>;
};

const CONTROLLED: ReadonlyArray<keyof RunSettings> = ["model", "thinking", "maxSteps", "prompt", "eval"];

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

export function checkControlled(runs: Array<{ file: string; run: SavedRun }>): string[] {
  if (runs.length < 2) return ["compare at least two runs"];
  const problems: string[] = [];
  const first = runs[0].run;
  for (const { file, run } of runs) {
    if (run.kind !== "live" || run.complete !== true) {
      problems.push(`${file}: not a complete live run`);
      continue;
    }
    if (run.suite !== first.suite) problems.push(`${file}: suite differs`);
    if (JSON.stringify(run.cases) !== JSON.stringify(first.cases)) problems.push(`${file}: case set differs`);
    if (run.repeats !== first.repeats) problems.push(`${file}: repeats differ`);
    for (const key of CONTROLLED) {
      if (run.settings[key] !== first.settings[key]) problems.push(`${file}: settings.${key} differs`);
    }
  }
  const budgets = runs.map(({ run }) => run.settings.maxOutputTokens);
  if (problems.length === 0 && new Set(budgets).size !== budgets.length) {
    problems.push("every run needs a different maxOutputTokens");
  }
  return problems;
}

export function costOf(steps: StepMetrics[], prices: Prices): number {
  return steps.reduce((sum, step) => {
    const cached = step.cachedInputTokens ?? 0;
    const uncached = (step.inputTokens ?? 0) - cached;
    return (
      sum +
      (uncached * prices.inputCacheMiss + cached * prices.inputCacheHit + (step.outputTokens ?? 0) * prices.output) /
        1_000_000
    );
  }, 0);
}

export function armReport(file: string, run: SavedRun, prices: Prices | null): ArmReport {
  const steps = run.traces.flatMap((trace) => trace.runs.flatMap((entry) => entry.steps));
  const answers = steps.filter((step) => step.finish === "stop" || step.finish === "length").map((step) => step.outputTokens ?? 0);
  const replies = run.traces.map((trace) => trace.reply.length);
  const byCase: ArmReport["byCase"] = {};
  for (const grade of run.grades) {
    const entry = (byCase[grade.caseId] ??= { passed: 0, total: 0, truncated: 0 });
    entry.total++;
    if (grade.pass) entry.passed++;
    if (grade.limits.truncated) entry.truncated++;
  }
  return {
    file,
    maxOutputTokens: run.settings.maxOutputTokens,
    turns: run.summary.turns,
    passed: run.summary.passed,
    truncatedTurns: run.summary.limits.truncatedTurns,
    steps: steps.length,
    lengthSteps: steps.filter((step) => step.finish === "length").length,
    outputTokens: steps.reduce((sum, step) => sum + (step.outputTokens ?? 0), 0),
    answerOutputTokens: { p50: percentile(answers, 0.5), p90: percentile(answers, 0.9), max: Math.max(0, ...answers) },
    latencyMs: { p50: run.summary.limits.latencyP50Ms, p90: run.summary.limits.latencyP90Ms },
    replyChars: { p50: percentile(replies, 0.5), p90: percentile(replies, 0.9) },
    costUsd: prices ? costOf(steps, prices) : null,
    byCase,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/assistant/eval-token-cases.test.ts tests/assistant/eval-compare.test.ts`
Expected: PASS.

- [ ] **Step 6: Add suite selection and the comparison entry**

In `evals/assistant/navigation.eval.ts`:

Add the import after the `./results` import:

```ts
import { TOKEN_CASES } from "./token-cases";
```

Add after `const only = ...;`:

```ts
const SUITES: Record<string, EvalCase[]> = { navigation: EVAL_CASES, tokens: TOKEN_CASES };
const suite = env.ASSISTANT_EVAL_SUITE ?? "navigation";
```

In the test body, replace

```ts
    const suite = "navigation";
    const suiteCases = EVAL_CASES;
```

with

```ts
    const suiteCases = SUITES[suite];
    expect(suiteCases, `unknown ASSISTANT_EVAL_SUITE "${suite}"`).toBeDefined();
```

Create `evals/assistant/compare.eval.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { armReport, checkControlled, type Prices } from "./compare";
import { resultFileName, type SavedRun } from "./results";

const env = process.env;
const files = (env.ASSISTANT_COMPARE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

function prices(): Prices | null {
  const raw = [env.ASSISTANT_EVAL_PRICE_INPUT_MISS, env.ASSISTANT_EVAL_PRICE_INPUT_HIT, env.ASSISTANT_EVAL_PRICE_OUTPUT];
  if (raw.every((value) => value === undefined)) return null;
  const [inputCacheMiss, inputCacheHit, output] = raw.map(Number);
  if (![inputCacheMiss, inputCacheHit, output].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("set all three ASSISTANT_EVAL_PRICE_* values, in USD per million tokens");
  }
  return { inputCacheMiss, inputCacheHit, output };
}

describe.skipIf(files.length === 0)("compare assistant eval runs", () => {
  it("compares runs that differ only in the output budget", () => {
    const runs = files.map((file) => ({ file: path.basename(file), run: JSON.parse(readFileSync(file, "utf8")) as SavedRun }));
    expect(checkControlled(runs)).toEqual([]);
    const pricing = prices();
    const arms = runs
      .map(({ file, run }) => armReport(file, run, pricing))
      .sort((a, b) => a.maxOutputTokens - b.maxOutputTokens);
    const out = path.join(".eval-results", "assistant", resultFileName(new Date(), "compare", true));
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ kind: "comparison", prices: pricing, arms }, null, 2));
    console.info(JSON.stringify({ file: out, prices: pricing, arms }, null, 2));
  });
});
```

Append to `evals/assistant/README.md`:

````markdown
## Suites

`ASSISTANT_EVAL_SUITE=navigation` (default) runs `cases.ts`. `ASSISTANT_EVAL_SUITE=tokens` runs `token-cases.ts`, the Phase 2 output-budget suite. Each suite has its own `settings.eval` fingerprint.

## Output-budget comparison

```bash
ASSISTANT_COMPARE=.eval-results/assistant/A.json,.eval-results/assistant/B.json,.eval-results/assistant/C.json \
ASSISTANT_EVAL_PRICE_INPUT_MISS=<usd> ASSISTANT_EVAL_PRICE_INPUT_HIT=<usd> ASSISTANT_EVAL_PRICE_OUTPUT=<usd> \
npm run eval:assistant -- evals/assistant/compare.eval.ts
```

The comparison fails unless every file is a complete live run, and the files share the same suite, cases, repeats, model, thinking mode, `maxSteps`, prompt fingerprint and eval fingerprint, with a different `maxOutputTokens` each. Prices are optional and are in USD per million tokens. Without them, `costUsd` is `null`.
````

- [ ] **Step 7: Check that the new paths stay opt-in and fail fast**

Run: `npm run eval:assistant`
Expected: exit 0, every suite skipped.

Run: `ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=nope npm run eval:assistant -- evals/assistant/navigation.eval.ts`
Expected: FAIL with `unknown ASSISTANT_EVAL_SUITE "nope"`, before any model call.

Run: `npx tsc --noEmit && npx eslint evals tests/assistant --max-warnings=0 && npx vitest run tests/assistant`
Expected: exit 0.

- [ ] **Step 8: Commit the tooling**

```bash
git add evals/assistant/token-cases.ts evals/assistant/compare.ts evals/assistant/compare.eval.ts evals/assistant/navigation.eval.ts evals/assistant/README.md tests/assistant/eval-token-cases.test.ts tests/assistant/eval-compare.test.ts
git commit -m "test(assistant): add the phase 2 output-budget suite and controlled comparison"
```

- [ ] **Step 9: Write the Phase 2 design**

Create `docs/superpowers/specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md`:

```markdown
# Assistant V1-E Phase 2: output-token budget experiment design

## Question

Does raising the per-step output budget from 400 to 800 or 1,200 tokens remove `finish: length` truncation on long Traditional Chinese comparisons and explanations, and what does it cost in latency, tokens and reply length?

## Arms

| Arm | `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS` |
|---|---|
| A (control, production default) | 400 |
| B | 800 |
| C | 1200 |

## Held constant

The prompt (same `settings.prompt`), tools and schemas, fixture catalog and suite (same `settings.eval`), model `deepseek-flash`, thinking off, `maxSteps` 5, history shaping, repeats, case order, and the eval harness commit. `compare.eval.ts` refuses files that differ in any of these. Not in this experiment: raising `maxSteps`, switching models, enabling thinking mode, changing the prompt.

## Suite

`ASSISTANT_EVAL_SUITE=tokens` (`evals/assistant/token-cases.ts`):

| Case | Page | Student message | Why |
|---|---|---|---|
| info-compare-zh-hant | `/course/CISC2001` | CISC2001 和 CISC3014 哪門比較輕鬆？ | The only Phase 1 truncation (400 tokens after four lookups). |
| tokens-compare-instructors-zh-hant | `/course/CISC2001` | 這門課的 WONG KA KI 和 LI MEI 哪位比較適合我？請比較評分、給分、出席和學生評價。 | Instructor comparison on two reviews lookups. |
| tokens-explain-course-zh-hant | `/` | 請詳細介紹 CISC3014：課程內容、學分、授課老師、學生評價和上課時間。 | Long explanation over three lookups. |
| tokens-explain-course-en | `/` | Give me a detailed overview of CISC3014: ... | English control: separates language from length. |

## Procedure

1. Ask the user to approve the budget: 4 turns × 5 repeats = 20 turns per arm. These cases use 2 or 3 steps per turn, so about 50–70 steps per arm, capped at 120 per invocation. That is about 150–210 steps for the three arms, at most 360.
2. Run the three arms one after another in the same session, in the order A, B, C, from the same commit:
   `ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=tokens ASSISTANT_EVAL_REPEATS=5 ASSISTANT_EVAL_MAX_STEPS=120 ASSISTANT_EVAL_MAX_OUTPUT_TOKENS=<400|800|1200> ASSISTANT_EVAL_LABEL=tokens-<400|800|1200> npm run eval:assistant -- evals/assistant/navigation.eval.ts`
   Each must exit 0 with `complete: true`. An incomplete arm voids the comparison: do not compare partial arms.
3. Take the three prices from the provider's price page on the day of the runs and record the URL and date. Run `compare.eval.ts` on the three files.
4. Read every reply of the longest case per arm by hand, using the rubric below.

## Metrics

From `compare.eval.ts`, per arm and per case:
- Completion: turns passed (task completion) and the reply rubric.
- Truncation: `lengthSteps` and `truncatedTurns`.
- Output tokens: total, and answer-step p50, p90 and max.
- Latency: turn p50 and p90.
- Cost: `costUsd` for the arm, and the same divided by turns.
- Reply length: `replyChars` p50 and p90.

Reply rubric, scored by hand for each reply as yes or no: covers every fact the student asked for; ends cleanly (not cut mid-sentence or mid-list); follows rule 11's sidebar format (bold line per item, two to four bullets, "Suggestion:" line); has no facts that are not in the tool results.

## Decision rule

Pick the smallest arm that:
1. has no `finish: length` on answer steps across its 20 turns, and
2. does not drop any case by 2 or more passes out of 5 compared with arm A, and
3. keeps reply-length p90 for each case within 1.5× arm A's, unless the extra length is the content that A cut off.

If no arm meets the rule, recommend none and report which condition failed. If B and C both meet it, pick B. Report the latency and cost difference against A as a trade-off for the user to decide. Do not choose an arm on latency or cost alone.

## After the decision

Changing the production `AI_MAX_OUTPUT_TOKENS` default is a separate change that needs the user's approval. Before it, run the full navigation suite (`ASSISTANT_EVAL_SUITE=navigation`, 3 repeats) at the chosen budget and confirm task completion, unsolicited navigation and language correctness have not got worse than the closure run.

## Noise and limits

Five repeats per case at the provider's default temperature means a difference of one pass is noise. Arms run in sequence, so latency can drift with provider load; compare latency within a session only. The fixture catalog is small, so real catalog replies may be longer.
```

- [ ] **Step 10: Write the Phase 2 recommendation into the closure record**

Replace "Written in Task 5." under "## 7. Phase 2 recommendation" in `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md` with a recommendation that cites these measured numbers, all from the files in Task 4:
- `truncatedTurns` and `finishCounts.length` for regraded baseline, regraded revised and live closure, and which case and repeat each truncation was in (from `grades[].limits.truncated`).
- `maxStepOutputTokens` for each.
- Whether any required-navigation miss coincided with `maxStepsHit` or truncation (`toolSelection.omissions` against `toolSelection.missed`).

Apply this rule. If any `finish: length` appears in the three runs, recommend running the Phase 2 design as written. If none appears in the live closure run, recommend running only arm A of the token suite first, and running B and C only if arm A truncates. Either way, state that `maxSteps` stays at 5 because no run hit it, if that holds; if a run did hit it, say so and keep it out of Phase 2 anyway, as the brief requires. Link the design: `[Phase 2 design](../specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md)`.

- [ ] **Step 11: Commit the design and recommendation**

```bash
git add docs/superpowers/specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md
git commit -m "docs(assistant): design the V1-E phase 2 output-budget experiment"
```

---

### Task 6: Regression verification and final record

**Files:**
- Modify: `docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md` (section 8 and new sections 9–10)

**Interfaces:**
- Consumes: everything above.
- Produces: the final verification record.

- [ ] **Step 1: Run every automated check**

Run each, one at a time, and record the exit code and anything notable:

```bash
npm run lint
npx tsc --noEmit
npm test -- --run
npm run build
npm run build:pages
npm run eval:assistant
```

Expected: every command exits 0. `npm run eval:assistant` with no env reports all eval suites skipped. In Phase 1, `build:pages` printed an unsupported-Next warning, a CopilotKit `channel-manager` critical-dependency warning and a sandbox wrangler log EPERM, and still exited 0. If it fails on sandbox permissions alone, re-run with `required_permissions: ["all"]` and say so in the record. If any check fails for another reason, fix it with superpowers:systematic-debugging before going on.

- [ ] **Step 2: Fill in the automated-checks section**

Replace "Written in Task 6." under "## 8. Automated checks" with a table of the six commands and their results (test file and test counts for `npm test`). Then append:

```markdown
## 9. Preserved behaviour

| Preserved | Covered by |
|---|---|
| Desktop-only at >=1024px | `tests/components/desktop-assistant-gate.test.tsx` |
| Clerk authorization and access modes | `tests/api/copilotkit.test.ts`, `tests/assistant/access*.test.ts`, `tests/api/assistant-access.test.ts` |
| Server rate limits | `tests/assistant/rate-limit.test.ts`, `tests/api/copilotkit.test.ts` |
| Read-only academic tools | `tests/assistant/tools.test.ts`, `tests/assistant/golden.test.ts` |
| Validated `navigate`, one page per message | `tests/assistant/navigation.test.ts`, `tests/components/use-navigate-tool.test.tsx` |
| No `toolChoice`, no keyword routing | `tests/assistant/agent.test.ts` "leaves the choice of tool to the model"; the only product change is one prompt sentence |
| Language rules unchanged | `tests/assistant/agent.test.ts` language assertions; `git diff <parent of the Task 3 prompt commit> HEAD -- lib/assistant/prompt.ts` shows only the Task 3 sentence |
| `maxSteps` 5, 400 output tokens, `deepseek-flash`, thinking off | `settings` in every live result file |
| Eval opt-in | `npm run eval:assistant` with no env: all suites skipped |

## 10. Commits

<one row per commit from `git log --oneline <first Task 1 commit>~1..HEAD`>

## 11. Remaining risks

- Fixture catalog: two fictional courses. Real catalog size, search ranking and review text are not exercised.
- 3 repeats (5 on the targeted run) at the provider's default temperature: differences of one or two turns are noise.
- The language check does not tell Traditional from Simplified Chinese. Script mismatches are read by hand in section 6.
- The harness lands navigation instantly. Real `timeout` and `landed_elsewhere` results are covered only by grader unit tests and the scripted component tests.
- Clerk, access mode, rate limiting and the browser UI are not part of the real-model runs.

## 12. Excluded from commits

`app/layout.tsx`, untracked `docs/superpowers/plans/2026-10-22-assistant-v1e-phase1-tool-use.md`, untracked `.next-dev/**`, `.eval-results/` (ignored), `stash@{0}`: all untouched.
```

For the "Language rules unchanged" row, run `git log -1 --format=%h -- lib/assistant/prompt.ts` to get the Task 3 prompt commit, put `<that hash>~1` in the `git diff` command, run it, and confirm it shows only the one sentence.

- [ ] **Step 3: Confirm unrelated state is untouched**

Run: `git status --short && git stash list`
Expected: `app/layout.tsx` still modified, the Phase 1 plan still untracked, `stash@{0}` still present, and no other uncommitted changes from this plan.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/verification/2026-10-22-assistant-v1e-phase1-closure.md
git commit -m "docs(assistant): record V1-E phase 1 closure verification"
```

- [ ] **Step 5: Report to the user**

Report the outcome first:
- the corrected metrics: the Step 15 table, regraded versus live;
- the show-versus-ask decision;
- the remaining genuine agent failures, grouped;
- the Phase 2 recommendation and the numbers behind it.

Then list the checks with their exit codes. Do not push, merge or deploy.
