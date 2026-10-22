import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { ThinkingMode } from "@/lib/assistant/config";

import type { EvalCase } from "./cases";
import { gradeTurn, summarize, type CatalogFacts, type Summary, type TurnGrade, type TurnTrace } from "./grade";
import type { RequestAudit } from "./request-audit";

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
  requestMismatches?: string[];
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
  [
    "Intent read correctly (navigation decision and lookups)",
    (s) => (s.intent ? ratio(s.intent.ok, s.intent.turns) : "n/a"),
  ],
  ["Tool selection: required navigate correct", (s) => ratio(s.toolSelection.correct, s.toolSelection.required)],
  [
    "Tool selection: missed (omissions) / invalid arguments / wrong page",
    (s) =>
      `${s.toolSelection.missed} (${s.toolSelection.omissions}) / ${s.toolSelection.invalidArguments} / ${s.toolSelection.wrongDestination}`,
  ],
  ["Unsolicited navigation", (s) => ratio(s.unsolicited.navigated, s.unsolicited.forbidden)],
  [
    "Premature navigation (clarify turns, lookups-first turns)",
    (s) => (s.premature ? ratio(s.premature.navigated, s.premature.checked) : "n/a"),
  ],
  ["Substituted page type", (s) => (s.substituted ? ratio(s.substituted.navigated, s.substituted.checked) : "n/a")],
  ["Ended on a page not asked for", (s) => (s.strayed ? ratio(s.strayed.count, s.strayed.turns) : "n/a")],
  [
    "Missing parameter detected (clarify turns)",
    (s) => (s.clarification ? ratio(s.clarification.detected, s.clarification.turns) : "n/a"),
  ],
  [
    "Clarification complete (lookup, every option, a question)",
    (s) => (s.clarification ? ratio(s.clarification.complete, s.clarification.turns) : "n/a"),
  ],
  [
    "Unavailable pages: stayed on page (navigate tried)",
    (s) => (s.unavailable ? `${ratio(s.unavailable.stayed, s.unavailable.turns)} (${s.unavailable.attempted})` : "n/a"),
  ],
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
  ["Reasoning tokens", (s) => (s.limits.reasoningTokens === undefined ? "n/a" : String(s.limits.reasoningTokens))],
  [
    "Model steps per turn (mean)",
    (s) => (s.limits.stepsPerTurnMean === undefined ? "n/a" : s.limits.stepsPerTurnMean.toFixed(2)),
  ],
  ["Latency p95", (s) => (s.limits.latencyP95Ms === undefined ? "n/a" : `${s.limits.latencyP95Ms} ms`)],
  ["Slowest model step", (s) => (s.limits.maxStepMs === undefined ? "n/a" : `${s.limits.maxStepMs} ms`)],
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

export function thinkingMode(value: string | undefined): ThinkingMode {
  if (value === undefined || value === "" || value === "off") return "off";
  if (value === "low") return "low";
  throw new Error(`ASSISTANT_EVAL_THINKING must be "off" or "low", got "${value}"`);
}

/** Every provider request must carry exactly the settings the run claims; returns one line per difference. */
export function requestMismatches(
  traces: readonly TurnTrace[],
  settings: Pick<RunSettings, "model" | "thinking" | "maxOutputTokens">,
): string[] {
  const wanted: Array<[keyof RequestAudit, unknown]> = [
    ["model", settings.model],
    ["maxTokens", settings.maxOutputTokens],
    ["thinking", { type: settings.thinking === "low" ? "enabled" : "disabled" }],
    ["reasoningEffort", settings.thinking === "low" ? "low" : null],
  ];
  return traces.flatMap((trace) =>
    trace.runs.flatMap((run, index) => {
      const where = `${trace.caseId} repeat ${trace.repeat} turn ${trace.turn + 1} run ${index + 1}`;
      const audits = run.requests ?? [];
      const lines =
        audits.length < run.steps.length
          ? [`${where}: ${run.steps.length} model steps but ${audits.length} provider requests captured`]
          : [];
      for (const audit of audits) {
        for (const [key, value] of wanted) {
          if (!isDeepStrictEqual(audit[key], value)) {
            lines.push(`${where}: ${key} ${JSON.stringify(audit[key])}, expected ${JSON.stringify(value)}`);
          }
        }
      }
      return lines;
    }),
  );
}
