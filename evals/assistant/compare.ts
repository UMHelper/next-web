import type { EvalCase } from "./cases";
import type { StepMetrics } from "./grade";
import type { RunSettings, SavedRun } from "./results";

/** USD per million tokens, from the provider's price list on the day of the runs. */
export type Prices = { inputCacheMiss: number; inputCacheHit: number; output: number };

type Rate = { passed: number; total: number };

export type Count = { count: number; of: number };

export type ArmReport = {
  file: string;
  label: string;
  prompt: string;
  thinking: string;
  maxOutputTokens: number;
  turns: number;
  passed: number;
  intentOk: number;
  truncatedTurns: number;
  steps: number;
  lengthSteps: number;
  outputTokens: number;
  reasoningTokens: number;
  visibleOutputTokens: number;
  /** Steps that ended the reply (stop or length), where the output budget binds. */
  answerOutputTokens: { p50: number; p90: number; max: number };
  stepsPerTurn: number;
  runsPerTurn: number;
  latencyMs: { p50: number; p90: number; p95: number };
  stepMs: { p95: number; max: number };
  replyChars: { p50: number; p90: number };
  costUsd: number | null;
  byCase: Record<string, { passed: number; total: number; truncated: number }>;
  byLanguage: Record<string, { passed: number; total: number; languageOk: number; languageChecked: number }>;
  /** Intents asked in two or more languages; spread is the best language's pass rate minus the worst's. */
  intents: Record<string, { languages: Record<string, Rate>; spread: number }>;
  /** Growth of the history the client resends on every run. */
  history: { messagesPerTurn: number; reasoningMessagesPerTurn: number; bytesPerTurn: number };
  requests: { total: number; reasoningReplayed: number; reasoningEmpty: number; reasoningAbsent: number };
  /** From the run summary; null where the summary predates the semantic-action grader. */
  semantic: {
    strayed: Count | null;
    unsolicited: Count;
    premature: Count | null;
    substituted: Count | null;
    wrongDestination: number;
    clarifyDetected: Count | null;
    clarifyComplete: Count | null;
  };
};

export type Vary = "inference" | "prompt";

const SETTINGS: ReadonlyArray<keyof RunSettings> = ["model", "maxSteps", "prompt", "eval", "thinking", "maxOutputTokens"];
const VARIED: Record<Vary, ReadonlyArray<keyof RunSettings>> = {
  inference: ["thinking", "maxOutputTokens"],
  prompt: ["prompt"],
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length === 0 ? 0 : sum(values) / values.length);

/** Runs in the given order; each must change exactly one of the varied settings from the one before and nothing else. */
export function checkControlled(runs: Array<{ file: string; run: SavedRun }>, vary: Vary = "inference"): string[] {
  if (runs.length < 2) return ["compare at least two runs"];
  const varied = VARIED[vary];
  const controlled = SETTINGS.filter((key) => !varied.includes(key));
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
    for (const key of controlled) {
      if (run.settings[key] !== first.settings[key]) problems.push(`${file}: settings.${key} differs`);
    }
  }
  if (problems.length > 0) return problems;
  for (let index = 1; index < runs.length; index++) {
    const before = runs[index - 1];
    const after = runs[index];
    const changed = varied.filter((key) => before.run.settings[key] !== after.run.settings[key]);
    if (changed.length === 0) problems.push(`${after.file}: same ${varied.join(" and ")} as ${before.file}`);
    if (changed.length > 1) problems.push(`${after.file}: changes both ${varied.join(" and ")} from ${before.file}`);
  }
  return problems;
}

/** DeepSeek bills reasoning tokens as output, and outputTokens already includes them. */
export function costOf(steps: StepMetrics[], prices: Prices): number {
  return steps.reduce((total, step) => {
    const cached = step.cachedInputTokens ?? 0;
    const uncached = (step.inputTokens ?? 0) - cached;
    return (
      total +
      (uncached * prices.inputCacheMiss + cached * prices.inputCacheHit + (step.outputTokens ?? 0) * prices.output) /
        1_000_000
    );
  }, 0);
}

export function armReport(file: string, run: SavedRun, prices: Prices | null, cases: readonly EvalCase[] = []): ArmReport {
  const summary = run.summary;
  const meta = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const runs = run.traces.flatMap((trace) => trace.runs);
  const steps = runs.flatMap((entry) => entry.steps);
  const audits = runs.flatMap((entry) => entry.requests ?? []);
  const answers = steps.filter((step) => step.finish === "stop" || step.finish === "length").map((step) => step.outputTokens ?? 0);
  const replies = run.traces.map((trace) => trace.reply.length);
  const turnMs = run.traces.map((trace) => trace.ms);
  const stepMs = steps.map((step) => step.ms);
  const outputTokens = sum(steps.map((step) => step.outputTokens ?? 0));
  const reasoningTokens = sum(steps.map((step) => step.reasoningTokens ?? 0));
  const traceCount = run.traces.length;

  const byCase: ArmReport["byCase"] = {};
  const byLanguage: ArmReport["byLanguage"] = {};
  const intentRates: Record<string, Record<string, Rate>> = {};
  for (const grade of run.grades) {
    const entry = (byCase[grade.caseId] ??= { passed: 0, total: 0, truncated: 0 });
    entry.total++;
    if (grade.pass) entry.passed++;
    if (grade.limits.truncated) entry.truncated++;

    const evalCase = meta.get(grade.caseId);
    if (!evalCase?.language) continue;
    const language = (byLanguage[evalCase.language] ??= { passed: 0, total: 0, languageOk: 0, languageChecked: 0 });
    language.total++;
    if (grade.pass) language.passed++;
    if (grade.languageOk !== null) {
      language.languageChecked++;
      if (grade.languageOk) language.languageOk++;
    }
    if (evalCase.intent) {
      const rate = ((intentRates[evalCase.intent] ??= {})[evalCase.language] ??= { passed: 0, total: 0 });
      rate.total++;
      if (grade.pass) rate.passed++;
    }
  }
  const intents: ArmReport["intents"] = {};
  for (const [intent, languages] of Object.entries(intentRates)) {
    const rates = Object.values(languages).map((rate) => rate.passed / rate.total);
    if (rates.length >= 2) intents[intent] = { languages, spread: Math.max(...rates) - Math.min(...rates) };
  }

  return {
    file,
    label: run.label,
    prompt: run.settings.prompt,
    thinking: run.settings.thinking,
    maxOutputTokens: run.settings.maxOutputTokens,
    turns: run.summary.turns,
    passed: run.summary.passed,
    intentOk: run.grades.filter((grade) => grade.intentOk).length,
    truncatedTurns: run.summary.limits.truncatedTurns,
    steps: steps.length,
    lengthSteps: steps.filter((step) => step.finish === "length").length,
    outputTokens,
    reasoningTokens,
    visibleOutputTokens: outputTokens - reasoningTokens,
    answerOutputTokens: { p50: percentile(answers, 0.5), p90: percentile(answers, 0.9), max: Math.max(0, ...answers) },
    stepsPerTurn: traceCount === 0 ? 0 : steps.length / traceCount,
    runsPerTurn: traceCount === 0 ? 0 : runs.length / traceCount,
    latencyMs: { p50: percentile(turnMs, 0.5), p90: percentile(turnMs, 0.9), p95: percentile(turnMs, 0.95) },
    stepMs: { p95: percentile(stepMs, 0.95), max: Math.max(0, ...stepMs) },
    replyChars: { p50: percentile(replies, 0.5), p90: percentile(replies, 0.9) },
    costUsd: prices ? costOf(steps, prices) : null,
    byCase,
    byLanguage,
    intents,
    history: {
      messagesPerTurn: mean(run.traces.map((trace) => trace.messagesAdded ?? 0)),
      reasoningMessagesPerTurn: mean(run.traces.map((trace) => sum(trace.runs.map((entry) => entry.reasoningMessages ?? 0)))),
      bytesPerTurn: mean(run.traces.map((trace) => trace.bytesAdded ?? 0)),
    },
    requests: {
      total: audits.length,
      reasoningReplayed: sum(audits.map((audit) => audit.reasoningReplayed)),
      reasoningEmpty: sum(audits.map((audit) => audit.reasoningEmpty)),
      reasoningAbsent: sum(audits.map((audit) => audit.reasoningAbsent)),
    },
    semantic: {
      strayed: summary.strayed ? { count: summary.strayed.count, of: summary.strayed.turns } : null,
      unsolicited: { count: summary.unsolicited.navigated, of: summary.unsolicited.forbidden },
      premature: summary.premature ? { count: summary.premature.navigated, of: summary.premature.checked } : null,
      substituted: summary.substituted ? { count: summary.substituted.navigated, of: summary.substituted.checked } : null,
      wrongDestination: summary.toolSelection.wrongDestination,
      clarifyDetected: summary.clarification
        ? { count: summary.clarification.detected, of: summary.clarification.turns }
        : null,
      clarifyComplete: summary.clarification
        ? { count: summary.clarification.complete, of: summary.clarification.turns }
        : null,
    },
  };
}

const two = (value: number) => value.toFixed(2);
const shown = (value: Count | null) => (value === null ? "n/a" : `${value.count}/${value.of}`);

export function armTable(arms: readonly ArmReport[]): string {
  const languages = [...new Set(arms.flatMap((arm) => Object.keys(arm.byLanguage)))].sort();
  const intents = [...new Set(arms.flatMap((arm) => Object.keys(arm.intents)))].sort();
  const rows: Array<[string, (arm: ArmReport) => string]> = [
    ["Thinking / output budget", (arm) => `${arm.thinking} / ${arm.maxOutputTokens}`],
    ["Prompt fingerprint", (arm) => arm.prompt],
    ["Turns passed", (arm) => `${arm.passed}/${arm.turns}`],
    ["Intent read correctly", (arm) => `${arm.intentOk}/${arm.turns}`],
    ["Ended on a page not asked for", (arm) => shown(arm.semantic.strayed)],
    ["Unsolicited navigation", (arm) => shown(arm.semantic.unsolicited)],
    ["Premature navigation", (arm) => shown(arm.semantic.premature)],
    ["Substituted page type", (arm) => shown(arm.semantic.substituted)],
    ["Wrong first destination (required turns)", (arm) => String(arm.semantic.wrongDestination)],
    ["Clarify turns: missing parameter detected", (arm) => shown(arm.semantic.clarifyDetected)],
    ["Clarify turns: complete clarification", (arm) => shown(arm.semantic.clarifyComplete)],
    ["Turns with finish: length", (arm) => `${arm.truncatedTurns}/${arm.turns}`],
    ["Output tokens: reasoning / visible", (arm) => `${arm.reasoningTokens} / ${arm.visibleOutputTokens}`],
    [
      "Answer-step output tokens p50 / p90 / max",
      (arm) => `${arm.answerOutputTokens.p50} / ${arm.answerOutputTokens.p90} / ${arm.answerOutputTokens.max}`,
    ],
    ["Model steps per turn / CopilotKit runs per turn", (arm) => `${two(arm.stepsPerTurn)} / ${two(arm.runsPerTurn)}`],
    ["Turn latency p50 / p90 / p95", (arm) => `${arm.latencyMs.p50} / ${arm.latencyMs.p90} / ${arm.latencyMs.p95} ms`],
    ["Model step latency p95 / max", (arm) => `${arm.stepMs.p95} / ${arm.stepMs.max} ms`],
    ["Estimated cost", (arm) => (arm.costUsd === null ? "n/a" : `$${arm.costUsd.toFixed(4)}`)],
    [
      "History added per turn: messages (reasoning) / bytes",
      (arm) =>
        `${two(arm.history.messagesPerTurn)} (${two(arm.history.reasoningMessagesPerTurn)}) / ${Math.round(arm.history.bytesPerTurn)}`,
    ],
    [
      "Earlier assistant messages sent: reasoning replayed / empty / absent",
      (arm) => `${arm.requests.reasoningReplayed} / ${arm.requests.reasoningEmpty} / ${arm.requests.reasoningAbsent}`,
    ],
    ...languages.map((language): [string, (arm: ArmReport) => string] => [
      `Language ${language}: passed / reply language correct`,
      (arm) => {
        const entry = arm.byLanguage[language];
        return entry ? `${entry.passed}/${entry.total} / ${entry.languageOk}/${entry.languageChecked}` : "n/a";
      },
    ]),
    ...intents.map((intent): [string, (arm: ArmReport) => string] => [
      `Intent ${intent}: pass-rate spread across languages`,
      (arm) => (arm.intents[intent] ? two(arm.intents[intent].spread) : "n/a"),
    ]),
  ];
  return [
    `| Metric | ${arms.map((arm) => arm.label).join(" | ")} |`,
    `|---|${arms.map(() => "---").join("|")}|`,
    ...rows.map(([name, pick]) => `| ${name} | ${arms.map(pick).join(" | ")} |`),
  ].join("\n");
}

/** Pass counts per intent and language, for intents asked in two or more languages. */
export function intentTable(arm: ArmReport): string {
  const languages = [...new Set(Object.values(arm.intents).flatMap((entry) => Object.keys(entry.languages)))].sort();
  const rows = Object.entries(arm.intents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([intent, entry]) => {
      const cells = languages.map((language) => {
        const rate = entry.languages[language];
        return rate ? `${rate.passed}/${rate.total}` : "—";
      });
      return `| ${intent} | ${cells.join(" | ")} |`;
    });
  return [`| ${arm.label}: intent | ${languages.join(" | ")} |`, `|---|${languages.map(() => "---").join("|")}|`, ...rows].join(
    "\n",
  );
}
