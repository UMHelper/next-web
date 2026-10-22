import { isDeepStrictEqual } from "node:util";

import { parseDestination } from "@/lib/assistant/navigation";
import type { ASSISTANT_SERVER_TOOL_NAMES } from "@/lib/assistant/tools";

export type ServerToolName = (typeof ASSISTANT_SERVER_TOOL_NAMES)[number];

export type TurnExpectation = {
  /** optional: either answering or navigating is fine, but navigation must go to `destination`. */
  navigate: "required" | "forbidden" | "optional";
  /** Raw navigate input; compared after parseDestination on both sides. */
  destination?: Record<string, string>;
  /** Must be called, each before navigate. Not checked for an optional turn that navigated. */
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

export type NavigationOutcome =
  | "correct"
  | "missed"
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
  navigation: NavigationOutcome;
  academicTools: boolean | null;
  compound: boolean | null;
  responseProblems: string[];
  limits: TurnLimits;
  pass: boolean;
};

export type Summary = {
  turns: number;
  passed: number;
  navigation: { required: number; correct: number; missed: number; wrongDestination: number; omissions: number };
  unsolicited: { forbidden: number; navigated: number };
  optional: { turns: number; navigated: number; wrongDestination: number };
  academicTools: { required: number; ok: number };
  compound: { turns: number; complete: number };
  responses: { ok: number; total: number };
  limits: {
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
const ACCEPTED: ReadonlySet<NavigationOutcome> = new Set(["correct", "none", "optional_taken", "optional_skipped"]);

const normalized = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : value;

function matchesTool(call: ToolCallRecord, wanted: NonNullable<TurnExpectation["tools"]>[number]) {
  return (
    call.name === wanted.name &&
    Object.entries(wanted.args ?? {}).every(([key, value]) => normalized(call.args[key]) === normalized(value))
  );
}

function navigationOutcome(expectation: TurnExpectation, navigated: boolean, rightPlace: boolean): NavigationOutcome {
  switch (expectation.navigate) {
    case "required":
      return !navigated ? "missed" : rightPlace ? "correct" : "wrong_destination";
    case "forbidden":
      return navigated ? "unsolicited" : "none";
    case "optional":
      return !navigated ? "optional_skipped" : rightPlace ? "optional_taken" : "wrong_destination";
  }
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
  const navigateIndex = trace.toolCalls.findIndex((call) => call.name === "navigate");
  const navigated = navigateIndex >= 0;
  const actual = navigated ? parseDestination(trace.toolCalls[navigateIndex].args) : null;
  const wanted = expectation.destination ? parseDestination(expectation.destination) : null;
  const rightPlace = actual !== null && wanted !== null && isDeepStrictEqual(actual, wanted);
  const navigation = navigationOutcome(expectation, navigated, rightPlace);

  const toolsApply = expectation.tools !== undefined && !(expectation.navigate === "optional" && navigated);
  const positions = (expectation.tools ?? []).map((wantedTool) =>
    trace.toolCalls.findIndex((call) => matchesTool(call, wantedTool)),
  );
  const academicTools = toolsApply ? positions.every((index) => index >= 0) : null;
  const compound =
    expectation.navigate === "required" && expectation.tools !== undefined
      ? academicTools === true && navigation === "correct" && positions.every((index) => index < navigateIndex)
      : null;

  const limits = limitsOf(trace, maxSteps, navigation === "missed");
  const problems = responseProblems(trace, expectation, limits.truncated, knownCodes);
  return {
    caseId: trace.caseId,
    repeat: trace.repeat,
    turn: trace.turn,
    expectation: expectation.navigate,
    navigation,
    academicTools,
    compound,
    responseProblems: problems,
    limits,
    pass: ACCEPTED.has(navigation) && academicTools !== false && compound !== false && problems.length === 0,
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
    navigation: {
      required: required.length,
      correct: required.filter((grade) => grade.navigation === "correct").length,
      missed: required.filter((grade) => grade.navigation === "missed").length,
      wrongDestination: required.filter((grade) => grade.navigation === "wrong_destination").length,
      omissions: required.filter((grade) => grade.limits.omission).length,
    },
    unsolicited: {
      forbidden: forbidden.length,
      navigated: forbidden.filter((grade) => grade.navigation === "unsolicited").length,
    },
    optional: {
      turns: optional.length,
      navigated: optional.filter((grade) => grade.navigation === "optional_taken").length,
      wrongDestination: optional.filter((grade) => grade.navigation === "wrong_destination").length,
    },
    academicTools: { required: withTools.length, ok: withTools.filter((grade) => grade.academicTools).length },
    compound: { turns: compound.length, complete: compound.filter((grade) => grade.compound).length },
    responses: { ok: where((grade) => grade.responseProblems.length === 0).length, total: grades.length },
    limits: {
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
