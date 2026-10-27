import { DISCOVERY_CASES_V1, DISCOVERY_CASES_V2 } from "./discovery-cases";
import { DISCOVERY_HOLDOUT_CASES_V1 } from "./discovery-holdout-cases";
import { SHADOW_CASES_V1 } from "./discovery-shadow-cases";

export const CASE_SET_VERSION = "b2-v2";

export const DISCOVERY_CASE_SETS = {
  "dev-v1": DISCOVERY_CASES_V1,
  "dev-v2": DISCOVERY_CASES_V2,
  "holdout-v1": DISCOVERY_HOLDOUT_CASES_V1,
  "shadow-v1": SHADOW_CASES_V1,
} as const;

export function resolveDiscoveryCaseSetId(env: {
  ASSISTANT_EVAL_CASE_SET?: string;
  ASSISTANT_EVAL_SUITE?: string;
}): string {
  if (env.ASSISTANT_EVAL_CASE_SET) return env.ASSISTANT_EVAL_CASE_SET;
  const suite = env.ASSISTANT_EVAL_SUITE;
  if (suite === undefined || suite === "dev") return "dev-v2";
  if (suite === "holdout") return "holdout-v1";
  if (suite === "shadow") return "shadow-v1";
  throw new Error(`unknown ASSISTANT_EVAL_SUITE "${suite}"`);
}

export function discoveryPassThreshold(caseSetId: string): number {
  return caseSetId === "holdout-v1" ? 0.75 : 0.8;
}

export function discoveryEvalStamp(input: {
  model: string;
  thinking: string;
  maxOutputTokens: number;
  maxSteps: number;
  prompt: string;
  eval: string;
  noDiscovery: boolean;
  mode: "with_discovery" | "baseline";
  caseSetId: string;
}) {
  const rubricVersion = CASE_SET_VERSION;
  const caseSetId = input.caseSetId;
  const settings = {
    model: input.model,
    thinking: input.thinking,
    maxOutputTokens: input.maxOutputTokens,
    maxSteps: input.maxSteps,
    prompt: input.prompt,
    eval: input.eval,
    noDiscovery: input.noDiscovery,
    mode: input.mode,
    rubricVersion,
    caseSetId,
  };
  return { rubricVersion, caseSetId, settings };
}

type DiscoveryArtifactSettingsInput = {
  model: string;
  thinking: string;
  maxOutputTokens: number;
  maxSteps: number;
  prompt: string;
  eval: string;
  noDiscovery: boolean;
  mode: "with_discovery" | "baseline";
};

export function buildDiscoveryEvalPayload<TSummary, TGrade, TTrace>(input: {
  label: string;
  suite: string;
  caseSetId: string;
  settings: DiscoveryArtifactSettingsInput;
  repeats: number;
  stepBudget: number;
  stepsUsed: number;
  complete: boolean;
  partial?: boolean;
  timedOutTurns?: ReadonlyArray<{ caseId: string; repeat: number; turn: number }>;
  cases?: ReadonlyArray<{
    caseId: string;
    repeat: number;
    steps: number;
    toolCalls: number;
    discoveryAttempts: number;
    discoverySuccesses: number;
    ms: number;
    elapsedMs: number;
  }>;
  expectedTurns: number;
  stoppedEarly: string | undefined;
  summary: TSummary;
  failures: string[];
  requestMismatches: string[];
  toolRegistrationViolations: string[];
  discoveryAttempts: number;
  discoverySuccesses: number;
  grades: TGrade[];
  traces: TTrace[];
}) {
  const stamp = discoveryEvalStamp({ ...input.settings, caseSetId: input.caseSetId });
  return {
    kind: "discovery" as const,
    label: input.label,
    suite: input.suite,
    rubricVersion: stamp.rubricVersion,
    caseSetId: stamp.caseSetId,
    settings: stamp.settings,
    repeats: input.repeats,
    stepBudget: input.stepBudget,
    stepsUsed: input.stepsUsed,
    complete: input.complete,
    partial: input.partial ?? false,
    timedOutTurns: input.timedOutTurns ?? [],
    cases: input.cases ?? [],
    expectedTurns: input.expectedTurns,
    stoppedEarly: input.stoppedEarly,
    summary: input.summary,
    failures: input.failures,
    requestMismatches: input.requestMismatches,
    toolRegistrationViolations: input.toolRegistrationViolations,
    discoveryAttempts: input.discoveryAttempts,
    discoverySuccesses: input.discoverySuccesses,
    grades: input.grades,
    traces: input.traces,
  };
}
