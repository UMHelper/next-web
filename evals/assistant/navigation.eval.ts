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
const repeats = Number(env.ASSISTANT_EVAL_REPEATS ?? "3");
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
        if (error instanceof BudgetExhausted) return error.message;
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
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();
    const cases = EVAL_CASES.filter((evalCase) => !only || only.includes(evalCase.id));
    expect(cases.length, "no eval case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const budget: EvalBudget = { maxSteps: Number(env.ASSISTANT_EVAL_MAX_STEPS ?? "200"), used: 0 };
    const traces: TurnTrace[] = [];
    const grades: TurnGrade[] = [];
    const stoppedEarly = await runAll(cases, budget, traces, grades);

    const settings = {
      model: config.model,
      thinking: config.thinking,
      maxOutputTokens: config.maxOutputTokens,
      maxSteps: ASSISTANT_MAX_STEPS,
      prompt: PROMPT_FINGERPRINT,
    };
    const summary = summarize(grades);
    const file = path.join(
      ".eval-results",
      "assistant",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`,
    );
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ label, settings, repeats, stepsUsed: budget.used, stoppedEarly, summary, grades, traces }, null, 2),
    );
    console.info(JSON.stringify({ file, settings, stepsUsed: budget.used, stoppedEarly, summary }, null, 2));
  });
});
