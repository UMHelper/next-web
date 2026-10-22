import { isDeepStrictEqual } from "node:util";

import { buildNavigationPath, parseDestination, type NavigationDestination } from "@/lib/assistant/navigation";

import type { RequestAudit } from "./request-audit";
import type { ASSISTANT_SERVER_TOOL_NAMES } from "@/lib/assistant/tools";

export type ServerToolName = (typeof ASSISTANT_SERVER_TOOL_NAMES)[number];

export type ReplyLanguage = "chinese" | "english" | "korean" | "japanese";

export type TurnExpectation = {
  /**
   * optional: either answering or navigating is fine, but navigation must land on `destination`.
   * unavailable: the student asked for a page this site cannot open; trying navigate is fine, but the turn must end where it started.
   */
  navigate: "required" | "forbidden" | "optional" | "unavailable";
  /** Raw navigate input; compared after parseDestination on both sides. */
  destination?: Record<string, string>;
  /** Must be called, each before the navigate call that lands. Not checked for an optional turn that navigated. */
  tools?: Array<{ name: ServerToolName; args?: Record<string, string> }>;
  /** Each group needs one of its strings in the reply, case-insensitively. */
  mustMention?: string[][];
  replyLanguage?: ReplyLanguage;
  /** Course codes the student typed that are not in the catalog; the reply may repeat them. */
  studentCodes?: string[];
};

/** What the fixture catalog knows: codes the reply may mention, and titles it may quote in their original language. */
export type CatalogFacts = { courseCodes: readonly string[]; officialTitles: readonly string[] };

export type ToolCallRecord = { name: string; args: Record<string, unknown>; result?: string };

export type StepMetrics = {
  ms: number;
  firstChunkMs?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  /** Included in outputTokens. Absent before Phase 2 and when thinking is off. */
  reasoningTokens?: number;
  finish: string;
  tools: string[];
};

export type RunTrace = {
  continuation: boolean;
  ms: number;
  steps: StepMetrics[];
  error?: string;
  /** One per provider request. Absent before Phase 2. */
  requests?: RequestAudit[];
  /** Reasoning messages this run added to the client history. Absent before Phase 2. */
  reasoningMessages?: number;
};

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
  /** Messages and UTF-8 JSON bytes this turn added to the history the client resends. Absent before Phase 2. */
  messagesAdded?: number;
  bytesAdded?: number;
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
  | "optional_skipped"
  /** unavailable turns only: navigate was tried. */
  | "attempted";

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
  reasoningTokens: number;
  maxStepMs: number;
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
  /** unavailable turns: the turn ended on the page it started on; null otherwise. */
  stayed: boolean | null;
  /** The model read the request right (navigation decision and lookups), whether or not the page then loaded. */
  intentOk: boolean;
  /** null when the turn has no replyLanguage expectation. */
  languageOk: boolean | null;
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
  language: { checked: number; ok: number };
  /** Absent in results written before Phase 2. */
  intent?: { turns: number; ok: number };
  unavailable?: { turns: number; stayed: number; attempted: number };
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
    /** Absent in results written before Phase 2. */
    stepsPerTurnMean?: number;
    latencyP95Ms?: number;
    reasoningTokens?: number;
    maxStepMs?: number;
  };
  byTurn: Record<string, { passed: number; total: number }>;
};

const COURSE_CODE_IN_TEXT = /\b[A-Z]{4}\d{4}\b/g;
const HAN = /\p{Script=Han}/u;
const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
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
  if (expectation.navigate === "unavailable") return first ? "attempted" : "none";
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
    reasoningTokens: sum((step) => step.reasoningTokens),
    maxStepMs: Math.max(0, ...steps.map((step) => step.ms)),
    finishes,
    ms: trace.ms,
  };
}

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
  const own = withoutOfficialTitles(reply, officialTitles);
  const han = HAN.test(own);
  const hangul = HANGUL.test(own);
  const kana = KANA.test(own);
  switch (language) {
    case "english":
      if (kana) return "reply contains Japanese";
      if (hangul) return "reply contains Korean";
      return han ? "reply contains Chinese" : null;
    case "chinese":
      if (!han) return "reply is not in Chinese";
      if (kana) return "reply contains Japanese";
      return hangul ? "reply contains Korean" : null;
    case "korean":
      if (!hangul) return "reply is not in Korean";
      return kana ? "reply contains Japanese" : null;
    case "japanese":
      if (!kana) return "reply is not in Japanese";
      return hangul ? "reply contains Korean" : null;
  }
}

function responseProblems(
  trace: TurnTrace,
  expectation: TurnExpectation,
  truncated: boolean,
  knownCodes: readonly string[],
  language: string | null,
): string[] {
  const problems: string[] = [];
  if (trace.error !== undefined) problems.push(`error: ${trace.error}`);
  if (trace.reply.trim() === "") problems.push("empty reply");
  if (truncated) problems.push("finish: length");
  const reply = trace.reply.toLowerCase();
  for (const group of expectation.mustMention ?? []) {
    if (!group.some((text) => reply.includes(text.toLowerCase()))) problems.push(`missing: ${group.join(" | ")}`);
  }
  const allowed = [...knownCodes, ...(expectation.studentCodes ?? [])];
  const unknown = [...new Set(trace.reply.match(COURSE_CODE_IN_TEXT) ?? [])].filter((code) => !allowed.includes(code));
  if (unknown.length > 0) problems.push(`unknown course codes: ${unknown.join(", ")}`);
  if (language !== null) problems.push(language);
  return problems;
}

export function gradeTurn(
  trace: TurnTrace,
  expectation: TurnExpectation,
  maxSteps: number,
  catalog: CatalogFacts,
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

  const stayed = expectation.navigate === "unavailable" ? trace.pathnameAfter === trace.pathnameBefore : null;
  const navigationRead =
    expectation.navigate === "required"
      ? selection === "correct"
      : expectation.navigate === "forbidden"
        ? selection === "none"
        : expectation.navigate === "optional"
          ? selection === "optional_taken" || selection === "optional_skipped"
          : stayed === true;

  const limits = limitsOf(trace, maxSteps, selection === "missed");
  const language = languageProblem(trace.reply, expectation.replyLanguage, catalog.officialTitles);
  const problems = responseProblems(trace, expectation, limits.truncated, catalog.courseCodes, language);
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
    stayed,
    intentOk: navigationRead && academicTools !== false,
    languageOk: expectation.replyLanguage === undefined ? null : language === null,
    responseProblems: problems,
    limits,
    pass:
      selection !== "unsolicited" &&
      landed !== false &&
      stayed !== false &&
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
  const languageChecked = where((grade) => grade.languageOk !== null);
  const unavailable = where((grade) => grade.expectation === "unavailable");
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
    language: { checked: languageChecked.length, ok: languageChecked.filter((grade) => grade.languageOk).length },
    intent: { turns: grades.length, ok: where((grade) => grade.intentOk).length },
    unavailable: {
      turns: unavailable.length,
      stayed: unavailable.filter((grade) => grade.stayed === true).length,
      attempted: unavailable.filter((grade) => grade.selection === "attempted").length,
    },
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
      stepsPerTurnMean: grades.length === 0 ? 0 : total((limits) => limits.steps) / grades.length,
      latencyP95Ms: percentile(0.95),
      reasoningTokens: total((limits) => limits.reasoningTokens),
      maxStepMs: highest((limits) => limits.maxStepMs),
    },
    byTurn,
  };
}
