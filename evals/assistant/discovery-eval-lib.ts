import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect } from "vitest";

import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

import { DISCOVERY_CASES } from "./discovery-cases";
import {
  DISCOVERY_CASE_SETS,
  buildDiscoveryEvalPayload,
  discoveryPassThreshold,
  resolveDiscoveryCaseSetId,
} from "./discovery-case-sets";
import { DEFAULT_DISCOVERY_TIMETABLE } from "./discovery-fixture";
import { DISCOVERY_HOLDOUT_CASES } from "./discovery-holdout-cases";
import { discoverySucceeded, gradeDiscovery, summarizeDiscovery, type DiscoveryGrade } from "./discovery-grade";
import type { TurnTrace } from "./grade";
import { BudgetExhausted, PROMPT_FINGERPRINT, runCase, type EvalBudget, type HarnessOptions } from "./harness";
import { positiveInt, requestMismatches, thinkingMode } from "./results";

export const SUITES = {
  dev: DISCOVERY_CASES,
  holdout: DISCOVERY_HOLDOUT_CASES,
} as const;

export type DiscoveryEvalMode = "with_discovery" | "baseline";

function discoveryEvalFingerprint(
  suiteCases: readonly { id: string; turns: unknown[] }[],
  caseSetId: string,
): string {
  const hash = createHash("sha256");
  const files = [
    "evals/assistant/discovery-grade.ts",
    "evals/assistant/discovery-fixture.ts",
    "evals/assistant/discovery-cases.ts",
    "evals/assistant/discovery-case-sets.ts",
    "evals/assistant/discovery-holdout-cases.ts",
    "evals/assistant/discovery-eval-lib.ts",
  ];
  // The shadow set is fingerprinted on its own so the release-gate fingerprints stay unchanged.
  if (caseSetId === "shadow-v1") files.push("evals/assistant/discovery-shadow-cases.ts");
  if (caseSetId === "shadow-v2") files.push("evals/assistant/discovery-shadow2-cases.ts");
  if (caseSetId === "efficiency-v1") files.push("evals/assistant/discovery-efficiency-cases.ts");
  for (const file of files) {
    hash.update(readFileSync(path.join(process.cwd(), file)));
  }
  return hash.update(JSON.stringify(suiteCases)).digest("hex").slice(0, 12);
}

function readLocalEnv(names: readonly string[]): Record<string, string> {
  if (!existsSync(path.join(process.cwd(), ".env.local"))) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && names.includes(match[1])) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function assertDiscoveryToolRegistration(traces: TurnTrace[], mode: DiscoveryEvalMode): string[] {
  const violations: string[] = [];
  const toolName = DISCOVER_COURSE_CANDIDATES_TOOL_NAME;
  const expectPresent = mode === "with_discovery";

  for (const trace of traces) {
    for (const run of trace.runs) {
      for (const request of run.requests ?? []) {
        const hasTool = request.tools.includes(toolName);
        if (expectPresent && !hasTool) {
          violations.push(
            `${trace.caseId} turn ${trace.turn + 1}: provider request missing ${toolName} (tools: ${request.tools.join(", ")})`,
          );
        }
        if (!expectPresent && hasTool) {
          violations.push(
            `${trace.caseId} turn ${trace.turn + 1}: baseline run must not register ${toolName}`,
          );
        }
      }
    }
  }

  return violations;
}

export type RunDiscoveryEvalOptions = {
  getAppConfigMock: { mockResolvedValue: (value: unknown) => void };
  mode: DiscoveryEvalMode;
  enforceThresholds: boolean;
  writeArtifact?: (file: string, body: string) => void;
};

export type DiscoveryCaseRecord = {
  caseId: string;
  repeat: number;
  steps: number;
  toolCalls: number;
  discoveryAttempts: number;
  discoverySuccesses: number;
  ms: number;
  elapsedMs: number;
};

export function discoveryCaseRecord(
  caseId: string,
  repeat: number,
  traces: readonly TurnTrace[],
  elapsedMs: number,
): DiscoveryCaseRecord {
  const steps = traces.reduce(
    (sum, trace) => sum + trace.runs.reduce((runSum, run) => runSum + run.steps.length, 0),
    0,
  );
  const toolCalls = traces.reduce(
    (sum, trace) => sum + trace.toolCalls.filter((call) => call.name !== "present_response").length,
    0,
  );
  const discoveryAttempts = traces.reduce(
    (sum, trace) =>
      sum + trace.toolCalls.filter((call) => call.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME).length,
    0,
  );
  const discoverySuccesses = traces.reduce(
    (sum, trace) => sum + trace.toolCalls.filter((call) => discoverySucceeded(call)).length,
    0,
  );
  return {
    caseId,
    repeat,
    steps,
    toolCalls,
    discoveryAttempts,
    discoverySuccesses,
    ms: elapsedMs,
    elapsedMs,
  };
}

export function writeDiscoveryArtifact(
  file: string,
  body: string,
  io?: {
    mkdirSync: (directory: string, options: { recursive: boolean }) => void;
    writeFileSync: (file: string, body: string) => void;
    renameSync: (from: string, to: string) => void;
  },
) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  if (io) {
    io.mkdirSync(directory, { recursive: true });
    io.writeFileSync(temporary, body);
    io.renameSync(temporary, file);
    return;
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporary, body);
  renameSync(temporary, file);
}

export async function runDiscoveryEval({
  getAppConfigMock,
  mode,
  enforceThresholds,
  writeArtifact,
}: RunDiscoveryEvalOptions) {
  const env = process.env;
  const local = readLocalEnv(["AI_API_KEY", "AI_BASE_URL"]);
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
  const caseSetId = resolveDiscoveryCaseSetId({
    ASSISTANT_EVAL_CASE_SET: env.ASSISTANT_EVAL_CASE_SET,
    ASSISTANT_EVAL_SUITE: env.ASSISTANT_EVAL_SUITE,
  });

  getAppConfigMock.mockResolvedValue({ ...DEFAULT_APP_CONFIG });

  const suiteCases = DISCOVERY_CASE_SETS[caseSetId as keyof typeof DISCOVERY_CASE_SETS];
  expect(suiteCases, `unknown ASSISTANT_EVAL_CASE_SET "${caseSetId}"`).toBeDefined();
  const unknown = (only ?? []).filter((id) => !suiteCases.some((evalCase) => evalCase.id === id));
  expect(unknown, "ASSISTANT_EVAL_CASES names cases that are not in the suite").toEqual([]);
  expect(config.apiKey, "AI_API_KEY is not set").toBeDefined();

  const cases = suiteCases.filter((evalCase) => !only || only.includes(evalCase.id));
  expect(cases.length, "no discovery case matches ASSISTANT_EVAL_CASES").toBeGreaterThan(0);

  const budget: EvalBudget = { maxSteps: stepBudget, used: 0 };
  const grades: DiscoveryGrade[] = [];
  const traces: TurnTrace[] = [];
  const caseRecords: DiscoveryCaseRecord[] = [];
  let stoppedEarly: string | undefined;
  const expectedTurns = repeats * cases.reduce((sum, evalCase) => sum + evalCase.turns.length, 0);
  const file = path.join(".eval-results", "assistant", `discovery-${label}.json`);
  const write = writeArtifact ?? writeDiscoveryArtifact;
  const noDiscovery = mode === "baseline";
  const settingsInput = {
    model: config.model,
    thinking: config.thinking,
    maxOutputTokens: config.maxOutputTokens,
    maxSteps: ASSISTANT_MAX_STEPS,
    prompt: PROMPT_FINGERPRINT,
    eval: discoveryEvalFingerprint(cases, caseSetId),
    noDiscovery,
    mode,
  };

  const publish = () => {
    const timedOutTurns = traces.flatMap((trace) =>
      trace.timedOut === true ? [{ caseId: trace.caseId, repeat: trace.repeat, turn: trace.turn }] : [],
    );
    const complete = stoppedEarly === undefined && grades.length === expectedTurns && timedOutTurns.length === 0;
    const partial = timedOutTurns.length > 0 || stoppedEarly !== undefined;
    const summary = summarizeDiscovery(
      grades,
      cases.map((item) => item.id),
    );
    const mismatches = requestMismatches(traces, settingsInput);
    const toolRegistrationViolations = assertDiscoveryToolRegistration(traces, mode);
    const discoveryAttempts = traces.reduce(
      (sum, trace) => sum + trace.toolCalls.filter((call) => call.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME).length,
      0,
    );
    const discoverySuccesses = traces.reduce(
      (sum, trace) => sum + trace.toolCalls.filter((call) => discoverySucceeded(call)).length,
      0,
    );
    const failures = grades
      .filter((grade) => !grade.pass)
      .map(
        (grade) =>
          `${grade.caseId} repeat ${grade.repeat} turn ${grade.turn + 1}: checks ${JSON.stringify(grade.checks)} falseFit ${JSON.stringify(grade.falseFitClaims)}`,
      );
    write(
      file,
      JSON.stringify(
        buildDiscoveryEvalPayload({
          label,
          suite: suiteName,
          caseSetId,
          settings: settingsInput,
          repeats,
          stepBudget,
          stepsUsed: budget.used,
          complete,
          partial,
          timedOutTurns,
          cases: caseRecords,
          expectedTurns,
          stoppedEarly,
          summary,
          failures,
          requestMismatches: mismatches,
          toolRegistrationViolations,
          discoveryAttempts,
          discoverySuccesses,
          grades,
          traces,
        }),
        null,
        2,
      ),
    );
    return { summary, failures, mismatches, toolRegistrationViolations, discoveryAttempts, discoverySuccesses, complete };
  };

  for (let repeat = 0; repeat < repeats && stoppedEarly === undefined; repeat++) {
    for (const evalCase of cases) {
      const options: HarnessOptions = { config, budget, repeat };
      const caseStarted = Date.now();
      try {
        const caseTraces = await runCase(evalCase, options, {
          timetableForTurn: (turn) =>
            evalCase.turns[turn]?.timetable ?? evalCase.timetable ?? DEFAULT_DISCOVERY_TIMETABLE,
        });
        const elapsedMs = Date.now() - caseStarted;
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
            toolChoice: graded.toolChoice,
            discoveryBucket: graded.discoveryBucket,
            difficulty: graded.difficulty,
          });
          traces.push(trace);
        }
        caseRecords.push(discoveryCaseRecord(evalCase.id, repeat, caseTraces, elapsedMs));
      } catch (error) {
        if (error instanceof BudgetExhausted) {
          stoppedEarly = `${error.message} during ${evalCase.id} repeat ${repeat}`;
          break;
        }
        throw error;
      }
      publish();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const published = publish();
  const { summary, failures, mismatches, toolRegistrationViolations, discoveryAttempts, discoverySuccesses, complete } =
    published;
  console.info(
    JSON.stringify(
      {
        file,
        summary,
        failures,
        stoppedEarly,
        requestMismatches: mismatches,
        toolRegistrationViolations,
        discoveryAttempts,
        discoverySuccesses,
      },
      null,
      2,
    ),
  );

  const incompleteReason =
    stoppedEarly ?? (traces.some((trace) => trace.timedOut === true) ? "turn timed out" : "turn count mismatch");
  expect(complete, `incomplete run, partial results in ${file}: ${incompleteReason}`).toBe(true);
  expect(mismatches, `provider requests differ from the run settings, see ${file}`).toEqual([]);
  expect(toolRegistrationViolations, `discovery tool registration violations, see ${file}`).toEqual([]);

  if (mode === "with_discovery" && traces.length > 0) {
    expect(discoverySuccesses, `no successful ${DISCOVER_COURSE_CANDIDATES_TOOL_NAME} calls in ${file}`).toBeGreaterThan(
      0,
    );
  }

  if (enforceThresholds && mode === "with_discovery") {
    const passThreshold = discoveryPassThreshold(caseSetId);
    expect(summary.passRate, "discovery pass rate below threshold").toBeGreaterThanOrEqual(passThreshold);
    expect(summary.discoveryUse.rate, "discovery tool use below threshold").toBeGreaterThanOrEqual(0.9);
    expect(summary.falseFitClaims, "false fit claims above threshold").toBe(0);
    expect(summary.difficultyDirection.inverted.length, "difficulty direction inverted").toBe(0);
    expect(summary.noMidtermCertainty.violations, "no-midterm certainty violations").toBe(0);
    expect(summary.medianToolCalls, "median tool calls above threshold").toBeLessThanOrEqual(2);
  }
}
