import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";

const { getAppConfigMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
}));

const noDiscovery = process.env.ASSISTANT_EVAL_NO_DISCOVERY === "1";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

if (noDiscovery) {
  vi.mock("@/lib/assistant/discovery/tool", () => ({
    DISCOVER_COURSE_CANDIDATES_DESCRIPTION: "",
    createDiscoveryTools: () => [],
  }));
}

vi.mock("@/lib/assistant/data/discovery", async () => {
  const fixture = await import("./discovery-fixture");
  return {
    MAX_POOL_COURSES: 150,
    loadDiscoveryPool: fixture.loadDiscoveryPool,
    loadReviewTexts: fixture.loadReviewTexts,
  };
});

vi.mock("@/lib/mcp/data/search-catalog", async () => ({
  searchCatalog: (await import("./discovery-fixture")).searchCatalogForAssistant,
}));
vi.mock("@/lib/mcp/data/get-course", async () => ({
  getCourse: (await import("./discovery-fixture")).getCourse,
}));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({
  getInstructor: (await import("./discovery-fixture")).getInstructor,
}));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("./discovery-fixture")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("./discovery-fixture")).getCourseSections,
}));
vi.mock("@/lib/assistant/data/search-catalog", async () => ({
  searchCatalogForAssistant: (await import("./discovery-fixture")).searchCatalogForAssistant,
  countCoursesForAssistant: (await import("./discovery-fixture")).countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/course-text", async () => ({
  getCourseText: (await import("./discovery-fixture")).getCourseText,
}));
vi.mock("@/lib/assistant/data/instructor", async () => ({
  getInstructorForAssistant: (await import("./discovery-fixture")).getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", async () => ({
  countCourseReviews: (await import("./discovery-fixture")).countCourseReviews,
}));

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

import { DISCOVERY_CASES } from "./discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE } from "./discovery-fixture";
import { DISCOVERY_HOLDOUT_CASES } from "./discovery-holdout-cases";
import {
  gradeDiscovery,
  summarizeDiscovery,
  type DiscoveryGrade,
} from "./discovery-grade";
import type { TurnTrace } from "./grade";
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
  dev: DISCOVERY_CASES,
  holdout: DISCOVERY_HOLDOUT_CASES,
} as const;

function discoveryEvalFingerprint(suiteCases: readonly { id: string; turns: unknown[] }[]): string {
  const hash = createHash("sha256");
  for (const file of [
    "evals/assistant/discovery-grade.ts",
    "evals/assistant/discovery-fixture.ts",
    "evals/assistant/discovery-cases.ts",
    "evals/assistant/discovery-holdout-cases.ts",
  ]) {
    hash.update(readFileSync(path.join(process.cwd(), file)));
  }
  return hash.update(JSON.stringify(suiteCases)).digest("hex").slice(0, 12);
}

describe.skipIf(!enabled)("assistant discovery behaviour against the real model", () => {
  it("grades discovery turns and writes the summary", async () => {
    getAppConfigMock.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    const suiteCases = SUITES[suiteName as keyof typeof SUITES];
    expect(suiteCases, `unknown ASSISTANT_EVAL_SUITE "${suiteName}"`).toBeDefined();
    const unknown = (only ?? []).filter((id) => !suiteCases.some((evalCase) => evalCase.id === id));
    expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the suite").toEqual([]);
    expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();

    const cases = suiteCases.filter((evalCase) => !only || only.includes(evalCase.id));
    expect(cases.length, "no discovery case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

    const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
    const grades: DiscoveryGrade[] = [];
    const traces: TurnTrace[] = [];
    let stoppedEarly: string | undefined;

    for (let repeat = 0; repeat < repeats && stoppedEarly === undefined; repeat++) {
      for (const evalCase of cases) {
        const options: HarnessOptions = { config, budget, repeat };
        try {
          const caseTraces = await runCase(evalCase, options, {
            timetableForTurn: (turn) =>
              evalCase.turns[turn]?.timetable ?? evalCase.timetable ?? DEFAULT_DISCOVERY_TIMETABLE,
          });
          for (const trace of caseTraces) {
            const turn = evalCase.turns[trace.turn]!;
            const graded = gradeDiscovery(trace, turn.expect);
            grades.push({
              caseId: trace.caseId,
              repeat: trace.repeat,
              turn: trace.turn,
              pass: graded.pass,
              checks: graded.checks,
              falseFitClaims: graded.falseFitClaims,
              toolCalls: graded.toolCalls,
              discoveryRequired: turn.expect.discovery === "required",
            });
            traces.push(trace);
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

    const expectedTurns = repeats * cases.reduce((sum, evalCase) => sum + evalCase.turns.length, 0);
    const complete = stoppedEarly === undefined && grades.length === expectedTurns;
    const summary = summarizeDiscovery(grades, cases.map((item) => item.id));
    const settings = {
      model: config.model,
      thinking: config.thinking,
      maxOutputTokens: config.maxOutputTokens,
      maxSteps: ASSISTANT_MAX_STEPS,
      prompt: PROMPT_FINGERPRINT,
      eval: discoveryEvalFingerprint(cases),
      noDiscovery,
    };
    const mismatches = requestMismatches(traces, settings);
    const failures = grades
      .filter((grade) => !grade.pass)
      .map(
        (grade) =>
          `${grade.caseId} repeat ${grade.repeat} turn ${grade.turn + 1}: checks ${JSON.stringify(grade.checks)} falseFit ${JSON.stringify(grade.falseFitClaims)}`,
      );

    const file = path.join(".eval-results", "assistant", `discovery-${label}.json`);
    const payload = {
      kind: "discovery" as const,
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

    if (!noDiscovery) {
      const passThreshold = suiteName === "holdout" ? 0.75 : 0.8;
      expect(summary.passRate, "discovery pass rate below threshold").toBeGreaterThanOrEqual(passThreshold);
      expect(summary.discoveryUse.rate, "discovery tool use below threshold").toBeGreaterThanOrEqual(0.9);
      expect(summary.falseFitClaims, "false fit claims above threshold").toBe(0);
      expect(summary.difficultyDirection.rate, "difficulty direction below threshold").toBe(1);
      expect(summary.noMidtermCertainty.violations, "no-midterm certainty violations").toBe(0);
      expect(summary.medianToolCalls, "median tool calls above threshold").toBeLessThanOrEqual(2);
    }
  });
});
