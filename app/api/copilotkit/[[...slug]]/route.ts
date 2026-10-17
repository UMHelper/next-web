import { auth } from "@clerk/nextjs/server";
import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";

import { apiError, readJsonBody } from "@/lib/api-response";
import { createAssistantAgent } from "@/lib/assistant/agent";
import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import {
  MAX_RUN_BODY_BYTES,
  countUserTurns,
  runInputSchema,
  shapeConversation,
} from "@/lib/assistant/conversation";
import { isAssistantPilot } from "@/lib/assistant/pilot";
import { consumeAgentRateLimits, type AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";

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
    agents: ({ request }: { request: Request }) => ({
      default: createAssistantAgent(readAssistantConfig(), request.signal),
    }),
    runner: new InMemoryAgentRunner({ maxThreads: 16, maxRunsPerThread: 1, maxBytes: 2 * 1024 * 1024 }),
  });

  cachedHandler = createCopilotRuntimeHandler({ runtime, basePath: BASE_PATH });
  return cachedHandler;
}

function classify(request: Request): RouteKind | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(`${BASE_PATH}/`)) return null;
  const segments = pathname.slice(BASE_PATH.length + 1).split("/").filter(Boolean);

  if (request.method === "GET") {
    return segments.length === 1 && segments[0] === "info" ? "info" : null;
  }
  if (request.method !== "POST" || segments[0] !== "agent" || segments[1] !== AGENT_ID) return null;
  if (segments.length === 3 && segments[2] === "run") return "run";
  if (segments.length === 3 && segments[2] === "connect") return "connect";
  if (segments.length === 4 && segments[2] === "stop") return "stop";
  return null;
}

function emptyEventStream() {
  return new Response("", {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

async function handleRun(request: Request, userId: string, config: AssistantConfig) {
  const body = await readJsonBody(request, MAX_RUN_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = runInputSchema.safeParse(body.data);
  if (!parsed.success) return apiError("invalid_request", "Invalid assistant request", 400);

  const turns = countUserTurns(parsed.data.messages);
  if (turns > config.maxTurns) {
    return apiError("conversation_limit", "Conversation is too long, start a new one", 409);
  }

  let outcome: AgentRateLimitOutcome;
  try {
    outcome = await consumeAgentRateLimits(userId, {
      perHour: config.ratePerHour,
      perDay: config.ratePerDay,
    });
  } catch (error) {
    console.error("[assistant] rate limit failed:", error instanceof Error ? error.message : "unknown");
    return apiError("temporarily_unavailable", "Assistant is temporarily unavailable", 503);
  }
  if (!outcome.allowed) {
    const response = apiError("rate_limited", "Too many assistant requests", 429);
    response.headers.set("Retry-After", String(outcome.retryAfter));
    return response;
  }

  const messages = shapeConversation(parsed.data.messages, config.historyTurns);
  const payload = JSON.stringify({ ...parsed.data, messages });
  console.log(
    "[assistant] run",
    JSON.stringify({ turns, messages: messages.length, bytes: payload.length }),
  );

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return getHandler()(
    new Request(request.url, { method: "POST", headers, body: payload, signal: request.signal }),
  );
}

async function handle(request: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  if (!isAssistantPilot(sessionClaims)) {
    return apiError("forbidden", "Assistant pilot access required", 403);
  }

  const config = readAssistantConfig();
  if (!config.apiKey) return apiError("assistant_unavailable", "Assistant is not configured", 503);

  const kind = classify(request);
  if (!kind) return apiError("not_found", "Not found", 404);
  if (kind === "connect") return emptyEventStream();
  if (kind === "run") return handleRun(request, userId, config);
  return getHandler()(request);
}

export const GET = handle;
export const POST = handle;
