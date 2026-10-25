import { createHash, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/data/search-catalog", async () => ({
  searchCatalog: (await import("./agent-behavior-catalog")).searchCatalog,
}));
vi.mock("@/lib/mcp/data/get-course", async () => ({
  getCourse: (await import("./agent-behavior-catalog")).getCourse,
}));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({
  getInstructor: (await import("./agent-behavior-catalog")).getInstructor,
}));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("./agent-behavior-catalog")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("./agent-behavior-catalog")).getCourseSections,
}));
vi.mock("@/lib/assistant/data/search-catalog", async () => ({
  searchCatalogForAssistant: (await import("./agent-behavior-catalog")).searchCatalogForAssistant,
  countCoursesForAssistant: (await import("./agent-behavior-catalog")).countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/course-text", async () => ({
  getCourseText: (await import("./agent-behavior-catalog")).getCourseText,
}));
vi.mock("@/lib/assistant/data/instructor", async () => ({
  getInstructorForAssistant: (await import("./agent-behavior-catalog")).getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", async () => ({
  countCourseReviews: (await import("./agent-behavior-catalog")).countCourseReviews,
}));

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";
import { detectChineseScript } from "@/lib/assistant/reply-script";

import { AGENT_BEHAVIOR_CASES } from "./agent-behavior-cases";
import { AGENT_BEHAVIOR_CATALOG_FACTS, setAgentBehaviorFailingQuery } from "./agent-behavior-catalog";
import {
  AGENT_BEHAVIOR_HOLDOUT_CASES,
  type AgentBehaviorHoldoutCase,
} from "./agent-behavior-holdout-cases";
import {
  gradeAgentBehavior,
  summarizeAgentBehavior,
  type AgentBehaviorGrade,
} from "./agent-behavior-grade";
import { gradeTurn, type TurnTrace } from "./grade";
import { BudgetExhausted, PROMPT_FINGERPRINT, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import { positiveInt, requestMismatches, thinkingMode } from "./results";

const env = process.env;
const enabled = env.ASSISTANT_EVAL === "1";

function readLocalEnv(names: readonly string[]): Record<string, string> {
  if (!existsSync(path.join(process.cwd(), ".env.local"))) return {};
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
const label = env.ASSISTANT_EVAL_LABEL ?? "run";
const only = env.ASSISTANT_EVAL_CASES?.split(",").map((id) => id.trim());
const suiteName = env.ASSISTANT_EVAL_SUITE ?? "dev";

const SUITES = {
  dev: AGENT_BEHAVIOR_CASES,
  holdout: AGENT_BEHAVIOR_HOLDOUT_CASES,
} as const;

function agentBehaviorEvalFingerprint(suiteCases: readonly { id: string; turns: unknown[] }[]): string {
  const hash = createHash("sha256");
  for (const file of [
    "evals/assistant/agent-behavior-grade.ts",
    "evals/assistant/agent-behavior-catalog.ts",
    "evals/assistant/agent-behavior-cases.ts",
    "evals/assistant/agent-behavior-holdout-cases.ts",
  ]) {
    hash.update(readFileSync(path.join(process.cwd(), file)));
  }
  return hash.update(JSON.stringify(suiteCases)).digest("hex").slice(0, 12);
}

function gradeHoldoutLanguage(trace: TurnTrace, turn: AgentBehaviorHoldoutCase["turns"][number]): boolean {
  if (turn.replyLanguage === undefined && turn.chineseScript === undefined) return true;
  let ok = true;
  if (turn.replyLanguage !== undefined) {
    const languageGrade = gradeTurn(
      trace,
      { navigate: "forbidden", replyLanguage: turn.replyLanguage },
      ASSISTANT_MAX_STEPS,
      AGENT_BEHAVIOR_CATALOG_FACTS,
    );
    ok &&= languageGrade.languageOk === true;
  }
  if (turn.chineseScript === "traditional") {
    ok &&= detectChineseScript(trace.reply) === "traditional";
  }
  return ok;
}

describe.skipIf(!enabled)("assistant agent behavior against the real model", () => {
  it("grades agent-behavior turns and writes the summary", async () => {
    const suiteCases = SUITES[suiteName as keyof typeof SUITES];
    expect(suiteCases, `unknown ASSISTANT_EVAL_SUITE "${suiteName}"`).toBeDefined();
    const unknown = (only ?? []).filter((id) => !suiteCases.some((evalCase) => evalCase.id === id));
    expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the suite").toEqual([]);
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();

    const cases = suiteCases.filter((evalCase) => !only || only.includes(evalCase.id));
    expect(cases.length, "no eval case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
    const grades: AgentBehaviorGrade[] = [];
    const traces: TurnTrace[] = [];
    let stoppedEarly: string | undefined;

    for (let repeat = 0; repeat < repeats && stoppedEarly === undefined; repeat++) {
      for (const evalCase of cases) {
        if (evalCase.id === "partial_failure") {
          setAgentBehaviorFailingQuery(evalCase.turns[0]!.message);
        }
        const options: HarnessOptions = { config, budget, repeat };
        try {
          const caseTraces = await runCase(evalCase, options);
          for (const trace of caseTraces) {
            const turn = evalCase.turns[trace.turn]!;
            const graded = gradeAgentBehavior(trace, turn.expect);
            const languageOk =
              suiteName === "holdout"
                ? gradeHoldoutLanguage(trace, turn as AgentBehaviorHoldoutCase["turns"][number])
                : true;
            const pass = graded.pass && languageOk;
            const checks = {
              ...graded.checks,
              ...(suiteName === "holdout" && (turn as AgentBehaviorHoldoutCase["turns"][number]).replyLanguage
                ? { language: languageOk }
                : {}),
            };
            grades.push({
              caseId: trace.caseId,
              repeat: trace.repeat,
              turn: trace.turn,
              pass,
              checks,
            });
            traces.push(trace);
          }
        } catch (error) {
          if (error instanceof BudgetExhausted) {
            stoppedEarly = `${error.message} during ${evalCase.id} repeat ${repeat}`;
            break;
          }
          throw error;
        } finally {
          if (evalCase.id === "partial_failure") {
            setAgentBehaviorFailingQuery(null);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const expectedTurns = repeats * cases.reduce((sum, evalCase) => sum + evalCase.turns.length, 0);
    const complete = stoppedEarly === undefined && grades.length === expectedTurns;
    const summary = summarizeAgentBehavior(grades, cases.map((item) => item.id));
    const settings = {
      model: config.model,
      thinking: config.thinking,
      maxOutputTokens: config.maxOutputTokens,
      maxSteps: ASSISTANT_MAX_STEPS,
      prompt: PROMPT_FINGERPRINT,
      eval: agentBehaviorEvalFingerprint(cases),
    };
    const mismatches = requestMismatches(traces, settings);
    const failures = grades
      .filter((grade) => !grade.pass)
      .map(
        (grade) =>
          `${grade.caseId} repeat ${grade.repeat} turn ${grade.turn + 1}: checks ${JSON.stringify(grade.checks)}`,
      );

    const file = path.join(".eval-results", "assistant", `agent-behavior-${label}.json`);
    const payload = {
      kind: "agent-behavior" as const,
      label,
      suite: suiteName,
      settings,
      repeats,
      stepBudget,
      stepsUsed: budget.used,
      complete,
      expectedTurns,
      stoppedEarly,
      summary,
      failures,
      requestMismatches: mismatches,
      grades,
      traces,
    };
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(payload, null, 2));
    console.info(JSON.stringify({ file, summary, failures, stoppedEarly, requestMismatches: mismatches }, null, 2));

    expect(complete, `incomplete run, partial results in ${file}: ${stoppedEarly ?? "turn count mismatch"}`).toBe(true);
    expect(mismatches, `provider requests differ from the run settings, see ${file}`).toEqual([]);
  });
});
