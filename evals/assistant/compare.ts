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
