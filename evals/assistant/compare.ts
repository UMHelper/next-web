import type { EvalCase } from "./cases";
import type { StepMetrics } from "./grade";
import type { RunSettings, SavedRun } from "./results";

/** USD per million tokens, from the provider's price list on the day of the runs. */
export type Prices = { inputCacheMiss: number; inputCacheHit: number; output: number };

type Rate = { passed: number; total: number };

export type ArmReport = {
  file: string;
  label: string;
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
};

const CONTROLLED: ReadonlyArray<keyof RunSettings> = ["model", "maxSteps", "prompt", "eval"];
const VARIED: ReadonlyArray<keyof RunSettings> = ["thinking", "maxOutputTokens"];

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length === 0 ? 0 : sum(values) / values.length);

/** Runs in the given order; each must change exactly one of thinking and maxOutputTokens from the one before. */
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
  if (problems.length > 0) return problems;
  for (let index = 1; index < runs.length; index++) {
    const before = runs[index - 1];
    const after = runs[index];
    const changed = VARIED.filter((key) => before.run.settings[key] !== after.run.settings[key]);
    if (changed.length === 0) problems.push(`${after.file}: same thinking and maxOutputTokens as ${before.file}`);
    if (changed.length > 1) problems.push(`${after.file}: changes both thinking and maxOutputTokens from ${before.file}`);
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
  };
}

const two = (value: number) => value.toFixed(2);

export function armTable(arms: readonly ArmReport[]): string {
  const languages = [...new Set(arms.flatMap((arm) => Object.keys(arm.byLanguage)))].sort();
  const intents = [...new Set(arms.flatMap((arm) => Object.keys(arm.intents)))].sort();
  const rows: Array<[string, (arm: ArmReport) => string]> = [
    ["Thinking / output budget", (arm) => `${arm.thinking} / ${arm.maxOutputTokens}`],
    ["Turns passed", (arm) => `${arm.passed}/${arm.turns}`],
    ["Intent read correctly", (arm) => `${arm.intentOk}/${arm.turns}`],
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
