import { auth } from "@clerk/nextjs/server";
import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";

import { apiError, readJsonBody } from "@/lib/api-response";
import { canUseAssistant } from "@/lib/assistant/access";
import { createAssistantAgent } from "@/lib/assistant/agent";
import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { countUserTurns, runInputSchema } from "@/lib/assistant/conversation";
import { claimAgentTurn } from "@/lib/assistant/rate-limit";
import {
  ASSISTANT_RUN_HEADER,
  getRunContext,
  registerRunContext,
  releaseRunContext,
} from "@/lib/assistant/run-context";
import {
  MAX_RUN_BODY_BYTES,
  MAX_RUN_WIRE_BYTES,
  estimateToolResultBytes,
  prepareRunMessages,
  runPayloadBytes,
} from "@/lib/assistant/run-messages";
import { resolveAssistantConfig } from "@/lib/assistant/settings";
import {
  createRunTelemetry,
  recordStreamError,
  type RunTelemetry,
} from "@/lib/assistant/telemetry";
import { finalizeRunUsage, recordRejectedRun } from "@/lib/assistant/telemetry-store";
import { deriveTurnIdentity } from "@/lib/assistant/turn-key";

export const dynamic = "force-dynamic";

const BASE_PATH = "/api/copilotkit";
const AGENT_ID = "default";

type Handler = (request: Request) => Promise<Response>;
type RouteKind = "info" | "run" | "connect" | "stop";

let cachedHandler: Handler | null = null;

// workerd forbids random/UUID generation at global scope, so the runtime is built on the first request.
// History travels with every request, so the runner only needs room for in-flight runs.
function getHandler(): Handler {
  if (cachedHandler) return cachedHandler;

  const runtime = new CopilotRuntime({
    agents: ({ request }: { request: Request }) => {
      const runKey = request.headers.get(ASSISTANT_RUN_HEADER);
      const context = runKey ? getRunContext(runKey) : null;
      return {
        default: createAssistantAgent(
          context?.config ?? readAssistantConfig(),
          request.signal,
          context?.telemetry,
        ),
      };
    },
    runner: new InMemoryAgentRunner({
      maxThreads: 16,
      // Frontend tools with followUp=true (e.g. filter_catalog_results) need a second run on the same thread.
      maxRunsPerThread: 8,
      maxBytes: 2 * 1024 * 1024,
    }),
  });

  cachedHandler = createCopilotRuntimeHandler({ runtime, basePath: BASE_PATH });
  return cachedHandler;
}

function classify(request: Request): RouteKind | null {
  const { pathname } = new URL(request.url);

  if (request.method === "GET") {
    return pathname === `${BASE_PATH}/info` ? "info" : null;
  }
  if (request.method !== "POST") return null;

  if (pathname === `${BASE_PATH}/agent/${AGENT_ID}/run`) return "run";
  if (pathname === `${BASE_PATH}/agent/${AGENT_ID}/connect`) return "connect";

  const stopPrefix = `${BASE_PATH}/agent/${AGENT_ID}/stop/`;
  if (pathname.startsWith(stopPrefix)) {
    const threadId = pathname.slice(stopPrefix.length);
    if (threadId.length > 0 && !threadId.includes("/")) return "stop";
  }

  return null;
}

function emptyEventStream() {
  return new Response("", {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

async function loadConfig(): Promise<AssistantConfig> {
  try {
    return await resolveAssistantConfig();
  } catch (error) {
    console.error(
      "[assistant] settings load failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return readAssistantConfig();
  }
}

/** Persists the run outcome once, before the stream closes so the isolate stays alive for the write. */
function withUsageFinalization(response: Response, telemetry: RunTelemetry): Response {
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    releaseRunContext(telemetry.runKey);
    await finalizeRunUsage(telemetry);
  };

  if (!response.body) {
    void finish();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await finish();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        recordStreamError(telemetry, error);
        await finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      telemetry.aborted = true;
      await finish();
      return reader.cancel(reason);
    },
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleRun(request: Request, userId: string, config: AssistantConfig) {
  const runKey = crypto.randomUUID();
  const body = await readJsonBody(request, MAX_RUN_WIRE_BYTES);
  if (!body.ok) return body.response;

  const parsed = runInputSchema.safeParse(body.data);
  if (!parsed.success) return apiError("invalid_request", "Invalid assistant request", 400);

  const messages = parsed.data.messages;
  const threadId = typeof parsed.data.threadId === "string" ? parsed.data.threadId : undefined;
  const requestRunId = typeof parsed.data.runId === "string" ? parsed.data.runId : undefined;
  const turns = countUserTurns(messages);
  if (turns > config.maxTurns) {
    void recordRejectedRun({
      runKey,
      identity: deriveTurnIdentity({ userId, threadId, messages }),
    });
    return apiError("conversation_limit", "Conversation is too long, start a new one", 409);
  }

  const wireBytes = runPayloadBytes(messages, { threadId, runId: requestRunId });
  const prepared = prepareRunMessages(messages, config.historyTurns);
  const preparedBytes = runPayloadBytes(prepared, { threadId, runId: requestRunId });
  if (preparedBytes > MAX_RUN_BODY_BYTES) {
    void recordRejectedRun({
      runKey,
      identity: deriveTurnIdentity({ userId, threadId, messages }),
    });
    return apiError(
      "payload_too_large",
      "This message is too large for the assistant. Start a new chat or ask a shorter question.",
      413,
    );
  }

  const identity = deriveTurnIdentity({ userId, threadId, messages });

  let claim;
  try {
    claim = await claimAgentTurn({
      userId,
      threadId,
      messages,
      runKey,
      limits: { perHour: config.ratePerHour, perDay: config.ratePerDay },
    });
  } catch (error) {
    console.error(
      "[assistant] quota claim failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return apiError("temporarily_unavailable", "Assistant is temporarily unavailable", 503);
  }

  if (!claim.allowed) {
    console.warn("[assistant] rate limited", JSON.stringify({ window: claim.window, turns }));
    const response = apiError("quota_exhausted", "Too many assistant requests", 429);
    response.headers.set("Retry-After", String(claim.retryAfter));
    return response;
  }

  const payload = JSON.stringify({ ...parsed.data, messages: prepared });
  console.log(
    "[assistant] run",
    JSON.stringify({
      turns,
      continuation: identity.isContinuation,
      charged: claim.charged,
      messages: prepared.length,
      wireBytes,
      preparedBytes,
      toolResultBytes: estimateToolResultBytes(prepared),
    }),
  );

  const telemetry = createRunTelemetry({
    runKey,
    identity: claim.identity,
    charged: claim.charged,
    maxSteps: config.maxSteps,
  });
  registerRunContext(runKey, { config, telemetry });

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set(ASSISTANT_RUN_HEADER, runKey);

  let response: Response;
  try {
    response = await getHandler()(
      new Request(request.url, { method: "POST", headers, body: payload, signal: request.signal }),
    );
  } catch (error) {
    recordStreamError(telemetry, error);
    releaseRunContext(runKey);
    await finalizeRunUsage(telemetry);
    throw error;
  }

  if (!response.ok) telemetry.errorClass ??= "runtime_error";
  return withUsageFinalization(response, telemetry);
}

async function handle(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  if (!(await canUseAssistant(userId))) {
    return apiError("forbidden", "Assistant access required", 403);
  }

  const config = await loadConfig();
  if (!config.apiKey) return apiError("assistant_unavailable", "Assistant is not configured", 503);

  const kind = classify(request);
  if (!kind) return apiError("not_found", "Not found", 404);
  if (kind === "connect") return emptyEventStream();
  if (kind === "run") return handleRun(request, userId, config);
  return getHandler()(request);
}

export const GET = handle;
export const POST = handle;
