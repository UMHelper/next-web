import type { TurnIdentity } from "@/lib/assistant/turn-key";

export type UsageOutcome =
  | "completed"
  | "provider_error"
  | "client_aborted"
  | "execution_limit";

export type RunTelemetry = {
  runKey: string;
  userHash: string;
  threadHash: string;
  turnKey: string;
  isContinuation: boolean;
  charged: boolean;
  startedAt: number;
  steps: number;
  toolCalls: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  lastFinish: string | null;
  errorClass: string | null;
  aborted: boolean;
  maxSteps: number;
};

export function createRunTelemetry(seed: {
  runKey: string;
  identity: TurnIdentity;
  charged: boolean;
  maxSteps: number;
  startedAt?: number;
}): RunTelemetry {
  return {
    runKey: seed.runKey,
    userHash: seed.identity.userHash,
    threadHash: seed.identity.threadHash,
    turnKey: seed.identity.turnKey,
    isContinuation: seed.identity.isContinuation,
    charged: seed.charged,
    startedAt: seed.startedAt ?? Date.now(),
    steps: 0,
    toolCalls: 0,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    lastFinish: null,
    errorClass: null,
    aborted: false,
    maxSteps: seed.maxSteps,
  };
}

const addUsage = (current: number | null, next: number | undefined | null) =>
  next == null ? current : (current ?? 0) + next;

export function recordStepUsage(
  telemetry: RunTelemetry,
  input: {
    inputTokens?: number | null;
    cachedInputTokens?: number | null;
    outputTokens?: number | null;
    reasoningTokens?: number | null;
    finish: string;
    toolCalls: number;
  },
): void {
  telemetry.steps += 1;
  telemetry.toolCalls += input.toolCalls;
  telemetry.inputTokens = addUsage(telemetry.inputTokens, input.inputTokens);
  telemetry.cachedInputTokens = addUsage(telemetry.cachedInputTokens, input.cachedInputTokens);
  telemetry.outputTokens = addUsage(telemetry.outputTokens, input.outputTokens);
  telemetry.reasoningTokens = addUsage(telemetry.reasoningTokens, input.reasoningTokens);
  telemetry.lastFinish = input.finish;
}

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  statusCode?: unknown;
  status?: unknown;
  cause?: unknown;
};

const errorName = (error: unknown): string =>
  typeof (error as ErrorLike | null)?.name === "string" ? ((error as ErrorLike).name as string) : "";

function statusCodeOf(error: unknown): number | null {
  const candidate = error as ErrorLike | null;
  if (!candidate || typeof candidate !== "object") return null;
  for (const value of [candidate.statusCode, candidate.status]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return candidate.cause ? statusCodeOf(candidate.cause) : null;
}

/** Classifies transport failures from status/name only; message bodies are never read. */
export function classifyRunError(error: unknown): {
  outcome: "provider_error" | "client_aborted";
  errorClass: string;
} {
  if (errorName(error) === "AbortError") {
    return { outcome: "client_aborted", errorClass: "client_aborted" };
  }

  const status = statusCodeOf(error);
  if (status === 402) return { outcome: "provider_error", errorClass: "provider_balance" };
  if (status === 401 || status === 403) {
    return { outcome: "provider_error", errorClass: "provider_auth" };
  }
  if (status === 429) return { outcome: "provider_error", errorClass: "provider_rate_limit" };

  const name = errorName(error);
  const code = (error as ErrorLike | null)?.code;
  if (name === "TimeoutError" || code === "ETIMEDOUT" || code === "timeout") {
    return { outcome: "provider_error", errorClass: "provider_timeout" };
  }

  return { outcome: "provider_error", errorClass: "provider_error" };
}

export function recordStreamError(telemetry: RunTelemetry, error: unknown): void {
  const classified = classifyRunError(error);
  telemetry.errorClass = classified.errorClass;
  if (classified.outcome === "client_aborted") telemetry.aborted = true;
}

export function resolveOutcome(
  telemetry: RunTelemetry,
  hint?: UsageOutcome,
): UsageOutcome {
  if (hint) return hint;
  if (telemetry.aborted) return "client_aborted";
  if (telemetry.errorClass) return "provider_error";
  if (telemetry.lastFinish === "tool-calls" && telemetry.steps >= telemetry.maxSteps) {
    return "execution_limit";
  }
  return "completed";
}
