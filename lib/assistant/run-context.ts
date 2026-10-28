import "server-only";

import type { AssistantConfig } from "@/lib/assistant/config";
import type { RunTelemetry } from "@/lib/assistant/telemetry";

export const ASSISTANT_RUN_HEADER = "x-assistant-run-key";

const RUN_CONTEXT_TTL_MS = 10 * 60 * 1000;
const MAX_RUN_CONTEXTS = 64;

export type RunContext = {
  config: AssistantConfig;
  telemetry: RunTelemetry;
};

type Entry = { context: RunContext; expiresAt: number };

const contexts = new Map<string, Entry>();

function pruneExpired(now: number) {
  for (const [key, entry] of contexts) {
    if (entry.expiresAt <= now) contexts.delete(key);
  }
}

export function registerRunContext(runKey: string, context: RunContext, now = Date.now()): void {
  pruneExpired(now);
  if (!contexts.has(runKey)) {
    while (contexts.size >= MAX_RUN_CONTEXTS) {
      const oldest = contexts.keys().next().value;
      if (oldest === undefined) break;
      contexts.delete(oldest);
    }
  }
  contexts.set(runKey, { context, expiresAt: now + RUN_CONTEXT_TTL_MS });
}

export function getRunContext(runKey: string, now = Date.now()): RunContext | null {
  const entry = contexts.get(runKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    contexts.delete(runKey);
    return null;
  }
  return entry.context;
}

export function releaseRunContext(runKey: string): void {
  contexts.delete(runKey);
}
