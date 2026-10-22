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

import type { EvalCase } from "./cases";
import { EVAL_CATALOG_FACTS } from "./catalog";
import { gradeTurn, summarize, type TurnGrade, type TurnTrace } from "./grade";
import { BudgetExhausted, PROMPT_FINGERPRINT, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import {
  evalFingerprint,
  expectedTurns,
  failureLines,
  isComplete,
  positiveInt,
  requestMismatches,
  resultFileName,
  thinkingMode,
} from "./results";
import { SUITES } from "./suites";

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

// Model and maxSteps stay at the production defaults. Thinking mode and the output budget are the Phase 2 arms
// and are parsed strictly, so a typo fails the run instead of quietly falling back to a default.
const local = enabled ? readLocalEnv(["AI_API_KEY", "AI_BASE_URL"]) : {};
const config = readAssistantConfig({
  AI_API_KEY: env.AI_API_KEY ?? local.AI_API_KEY,
  AI_BASE_URL: env.AI_BASE_URL ?? local.AI_BASE_URL,
  AI_THINKING: thinkingMode(env.ASSISTANT_EVAL_THINKING),
  AI_MAX_OUTPUT_TOKENS: String(positiveInt("ASSISTANT_EVAL_MAX_OUTPUT_TOKENS", env.ASSISTANT_EVAL_MAX_OUTPUT_TOKENS, 400)),
});
const repeats = positiveInt("ASSISTANT_EVAL_REPEATS", env.ASSISTANT_EVAL_REPEATS, 3);
const stepBudget = positiveInt("ASSISTANT_EVAL_MAX_STEPS", env.ASSISTANT_EVAL_MAX_STEPS, 200);
const delayMs = Number(env.ASSISTANT_EVAL_DELAY_MS ?? "500");
const label = env.ASSISTANT_EVAL_LABEL ?? "run";
const only = env.ASSISTANT_EVAL_CASES?.split(",").map((id) => id.trim());
const suite = env.ASSISTANT_EVAL_SUITE ?? "navigation";

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
    const suiteCases = SUITES[suite];
    expect(suiteCases, `unknown ASSISTANT_EVAL_SUITE "${suite}"`).toBeDefined();
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
    const mismatches = requestMismatches(traces, header.settings);
    const file = path.join(".eval-results", "assistant", resultFileName(startedAt, label, complete));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ ...header, summary, failures, requestMismatches: mismatches, grades, traces }, null, 2),
    );
    console.info(JSON.stringify({ file, ...header, summary, failures, requestMismatches: mismatches }, null, 2));
    expect(complete, `incomplete run, partial results in ${file}: ${stoppedEarly ?? "turn count mismatch"}`).toBe(true);
    expect(mismatches, `provider requests differ from the run settings, see ${file}`).toEqual([]);
  });
});
