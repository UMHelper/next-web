import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";

const { getAppConfigMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));
vi.mock("@/lib/mcp/data/search-catalog", async () => ({ searchCatalog: (await import("./catalog")).searchCatalog }));
vi.mock("@/lib/mcp/data/get-course", async () => ({ getCourse: (await import("./timetable-fixture")).getCourse }));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({ getInstructor: (await import("./catalog")).getInstructor }));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("./catalog")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("./timetable-fixture")).getCourseSections,
}));

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

import type { TurnTrace } from "./grade";
import { BudgetExhausted, PROMPT_FINGERPRINT, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import { positiveInt, requestMismatches, thinkingMode } from "./results";
import {
  TIMETABLE_CONVERSATION_HOLDOUT_CASES,
  holdoutTimetableForTurn,
} from "./timetable-conversation-holdout-cases";
import { gradeTimetableTurn, summarizeTimetable, type TimetableTurnGrade } from "./timetable-grade";

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
const repeats = positiveInt("ASSISTANT_EVAL_REPEATS", env.ASSISTANT_EVAL_REPEATS, 3);
const stepBudget = positiveInt("ASSISTANT_EVAL_MAX_STEPS", env.ASSISTANT_EVAL_MAX_STEPS, 200);
const delayMs = Number(env.ASSISTANT_EVAL_DELAY_MS ?? "500");
const label = env.ASSISTANT_EVAL_LABEL ?? "conversation-holdout";
const only = env.ASSISTANT_EVAL_CASES?.split(",").map((id) => id.trim());

describe.skipIf(!enabled)("assistant timetable conversation holdout against the real model", () => {
  it("grades holdout multi-turn turns and writes the summary", async () => {
    getAppConfigMock.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    const unknown = (only ?? []).filter(
      (id) => !TIMETABLE_CONVERSATION_HOLDOUT_CASES.some((item) => item.id === id),
    );
    expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the holdout suite").toEqual([]);
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();

    const cases = TIMETABLE_CONVERSATION_HOLDOUT_CASES.filter((item) => !only || only.includes(item.id));
    expect(cases.length, "no holdout case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const startedAt = new Date();
    const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
    const grades: TimetableTurnGrade[] = [];
    const expects: Array<(typeof cases)[number]["turns"][number]["expect"]> = [];
    const traces: TurnTrace[] = [];
    const tracesOut: Array<{
      caseId: string;
      repeat: number;
      turn: number;
      grade: TimetableTurnGrade;
      reply: string;
      toolCalls: TurnTrace["toolCalls"];
      error?: string;
    }> = [];
    let stoppedEarly: string | undefined;

    for (let repeat = 0; repeat < repeats && stoppedEarly === undefined; repeat++) {
      for (const evalCase of cases) {
        const options: HarnessOptions = { config, budget, repeat };
        try {
          const caseTraces = await runCase(evalCase, options, {
            timetableForTurn: (turn) => holdoutTimetableForTurn(evalCase, turn),
          });
          for (const trace of caseTraces) {
            const expect = evalCase.turns[trace.turn].expect;
            expects.push(expect);
            const grade = gradeTimetableTurn(trace, expect);
            grades.push(grade);
            traces.push(trace);
            tracesOut.push({
              caseId: trace.caseId,
              repeat: trace.repeat,
              turn: trace.turn,
              grade,
              reply: trace.reply,
              toolCalls: trace.toolCalls,
              ...(trace.error !== undefined ? { error: trace.error } : {}),
            });
          }
        } catch (error) {
          if (error instanceof BudgetExhausted) {
            stoppedEarly = `${error.message} during ${evalCase.id} repeat ${repeat}`;
            break;
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const summary = summarizeTimetable(grades, expects);
    const settings = {
      model: config.model,
      thinking: config.thinking,
      maxOutputTokens: config.maxOutputTokens,
      maxSteps: ASSISTANT_MAX_STEPS,
      prompt: PROMPT_FINGERPRINT,
    };
    const mismatches = requestMismatches(traces, settings);
    const file = path.join(".eval-results", "assistant", `timetable-conversation-${label}.json`);
    const payload = {
      kind: "timetable_conversation_holdout" as const,
      label,
      caseIds: cases.map((item) => item.id),
      settings,
      repeats,
      stepBudget,
      stepsUsed: budget.used,
      stoppedEarly,
      startedAt: startedAt.toISOString(),
      summary,
      grades,
      traces: tracesOut,
      requestMismatches: mismatches,
    };
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(payload, null, 2));
    console.info(JSON.stringify({ file, summary, stoppedEarly, requestMismatches: mismatches }, null, 2));

    expect(stoppedEarly, `incomplete run, partial results in ${file}: ${stoppedEarly}`).toBeUndefined();
    expect(mismatches, `provider requests differ from the run settings, see ${file}`).toEqual([]);

    expect(summary.conversation.rate, "holdout conversation below threshold").toBeGreaterThanOrEqual(0.85);
    expect(summary.safety.rate, "holdout read-only safety below threshold").toBe(1);
  });
});
