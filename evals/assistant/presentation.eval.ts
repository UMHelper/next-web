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

import { EVAL_CATALOG_FACTS } from "./catalog";
import { BudgetExhausted, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import { gradeTurn, type TurnTrace } from "./grade";
import { PRESENTATION_CASES } from "./presentation-cases";
import { gradePresentation, summarizePresentation, type PresentationGrade } from "./presentation-grade";
import { positiveInt, thinkingMode } from "./results";

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

const local = enabled ? readLocalEnv(["AI_API_KEY", "AI_BASE_URL"]) : {};
const config = readAssistantConfig({
  AI_API_KEY: env.AI_API_KEY ?? local.AI_API_KEY,
  AI_BASE_URL: env.AI_BASE_URL ?? local.AI_BASE_URL,
  AI_THINKING: thinkingMode(env.ASSISTANT_EVAL_THINKING),
  AI_MAX_OUTPUT_TOKENS: String(positiveInt("ASSISTANT_EVAL_MAX_OUTPUT_TOKENS", env.ASSISTANT_EVAL_MAX_OUTPUT_TOKENS, 1_200)),
});
const repeats = positiveInt("ASSISTANT_EVAL_REPEATS", env.ASSISTANT_EVAL_REPEATS, 1);
const stepBudget = positiveInt("ASSISTANT_EVAL_MAX_STEPS", env.ASSISTANT_EVAL_MAX_STEPS, 200);
const delayMs = Number(env.ASSISTANT_EVAL_DELAY_MS ?? "500");
const label = env.ASSISTANT_EVAL_LABEL ?? "run";
const only = env.ASSISTANT_EVAL_CASES?.split(",").map((id) => id.trim());

describe.skipIf(process.env.ASSISTANT_EVAL !== "1")("assistant presentation selection against the real model", () => {
  it("grades presentation choices and writes the summary", async () => {
    const unknown = (only ?? []).filter((id) => !PRESENTATION_CASES.some((item) => item.id === id));
    expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the presentation suite").toEqual([]);
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();

    const cases = PRESENTATION_CASES.filter((item) => !only || only.includes(item.id));
    expect(cases.length, "no presentation case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
    const grades: PresentationGrade[] = [];
    const tracesOut: Array<{
      caseId: string;
      repeat: number;
      presentation: PresentationGrade;
      retrievalOk: boolean;
      reply: string;
      toolCalls: TurnTrace["toolCalls"];
    }> = [];
    let stoppedEarly: string | undefined;

    for (let repeat = 0; repeat < repeats && stoppedEarly === undefined; repeat++) {
      for (const presentationCase of cases) {
        const options: HarnessOptions = { config, budget, repeat };
        try {
          const traces = await runCase(presentationCase.evalCase, options);
          for (const trace of traces) {
            const presentation = gradePresentation(trace);
            grades.push(presentation);
            const retrieval = gradeTurn(
              trace,
              presentationCase.evalCase.turns[trace.turn].expect,
              ASSISTANT_MAX_STEPS,
              EVAL_CATALOG_FACTS,
            );
            tracesOut.push({
              caseId: trace.caseId,
              repeat: trace.repeat,
              presentation,
              retrievalOk: retrieval.academicTools === true,
              reply: trace.reply,
              toolCalls: trace.toolCalls,
            });
          }
        } catch (error) {
          if (error instanceof BudgetExhausted) {
            stoppedEarly = `${error.message} during ${presentationCase.id} repeat ${repeat}`;
            break;
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const summary = summarizePresentation(grades);
    const file = path.join(".eval-results", "assistant", `presentation-${label}.json`);
    const payload = {
      kind: "presentation" as const,
      label,
      caseIds: cases.map((item) => item.id),
      repeats,
      stepsUsed: budget.used,
      stoppedEarly,
      summary,
      grades,
      traces: tracesOut,
      retrievalHits: tracesOut.filter((entry) => entry.retrievalOk).length,
      ...summary,
    };
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(payload, null, 2));
    console.info(JSON.stringify({ file, ...summary, stoppedEarly }, null, 2));
    expect(stoppedEarly, `incomplete run, partial results in ${file}: ${stoppedEarly}`).toBeUndefined();
    expect(grades.length, `turn count mismatch, partial results in ${file}`).toBe(cases.length * repeats);
  });
});
