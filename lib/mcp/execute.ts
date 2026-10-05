import { randomUUID } from "node:crypto";

import type { AuthInfo } from "@modelcontextprotocol/server";

import { requireMcpPrincipal } from "@/lib/mcp/auth";
import { MCP_MAX_RESULT_BYTES, MCP_TOOL_TIMEOUT_MS } from "@/lib/mcp/constants";
import { McpToolError, toMcpToolError } from "@/lib/mcp/errors";
import { consumeMcpRateLimits, hashUserId } from "@/lib/mcp/rate-limit";

export type McpStructuredContent = Record<string, unknown>;

export type McpToolContext = {
  http?: { authInfo?: AuthInfo };
  signal?: AbortSignal;
};

export type McpToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: McpStructuredContent;
};

/** Minimal structural view of a Zod output schema; avoids coupling to a zod major. */
export type OutputSchema<TOutput> = { parse: (value: unknown) => TOutput };

export type McpLogEvent = {
  requestId: string;
  userHash: string;
  tool: string;
  durationMs: number;
  resultCount: number | null;
  status: "ok" | "error";
  errorCode?: string;
};

export type ExecuteMcpToolOptions<TInput, TOutput extends McpStructuredContent> = {
  toolName: string;
  input: TInput;
  outputSchema: OutputSchema<TOutput>;
  ctx: McpToolContext;
  run: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  summarize: (output: TOutput) => string;
  countResults?: (output: TOutput) => number;
  requestId?: string;
  now?: () => number;
  logger?: (event: McpLogEvent) => void;
};

function defaultLogger(event: McpLogEvent) {
  console.log(JSON.stringify(event));
}

/** Combine the caller signal with the timeout signal (TS 5.2 lib lacks AbortSignal.any). */
function combineSignals(caller: AbortSignal, timeout: AbortSignal): AbortSignal {
  if (caller.aborted || timeout.aborted) return AbortSignal.abort();

  const controller = new AbortController();
  const abort = () => controller.abort();
  caller.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

/**
 * Single execution path for every MCP tool.
 *
 * Order is deliberate: authenticate, consume both rate-limit tiers, run the data
 * handler under a 10s timeout, validate the projected output, then enforce the
 * 64 KiB serialized limit. Any failure short-circuits before data access and
 * surfaces a stable, non-leaking error code.
 */
export async function executeMcpTool<TInput, TOutput extends McpStructuredContent>(
  options: ExecuteMcpToolOptions<TInput, TOutput>,
): Promise<McpToolResult> {
  const requestId = options.requestId ?? randomUUID();
  const now = options.now ?? Date.now;
  const logger = options.logger ?? defaultLogger;
  const started = now();
  let userHash = "";

  const fail = (error: McpToolError): never => {
    logger({
      requestId,
      userHash,
      tool: options.toolName,
      durationMs: now() - started,
      resultCount: null,
      status: "error",
      errorCode: error.code,
    });
    throw error;
  };

  let userId: string;
  try {
    ({ userId } = requireMcpPrincipal(options.ctx?.http?.authInfo));
  } catch (error) {
    return fail(toMcpToolError(error));
  }
  userHash = hashUserId(userId);

  let rate;
  try {
    rate = await consumeMcpRateLimits(userId, options.toolName);
  } catch {
    return fail(new McpToolError("temporarily_unavailable"));
  }
  if (!rate.allowed) {
    return fail(new McpToolError("rate_limited", { retryAfter: rate.retryAfter }));
  }

  const timeoutSignal = AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS);
  const signal = options.ctx?.signal
    ? combineSignals(options.ctx.signal, timeoutSignal)
    : timeoutSignal;

  let output: TOutput;
  try {
    output = await options.run(options.input, signal);
  } catch (error) {
    if (signal.aborted) return fail(new McpToolError("temporarily_unavailable"));
    return fail(toMcpToolError(error));
  }
  if (signal.aborted) return fail(new McpToolError("temporarily_unavailable"));

  let validated: TOutput;
  try {
    validated = options.outputSchema.parse(output);
  } catch {
    return fail(new McpToolError("internal_error"));
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(validated);
  } catch {
    return fail(new McpToolError("internal_error"));
  }
  if (new TextEncoder().encode(serialized).byteLength > MCP_MAX_RESULT_BYTES) {
    return fail(new McpToolError("result_too_large"));
  }

  logger({
    requestId,
    userHash,
    tool: options.toolName,
    durationMs: now() - started,
    resultCount: options.countResults?.(validated) ?? null,
    status: "ok",
  });

  return {
    content: [{ type: "text", text: options.summarize(validated) }],
    structuredContent: validated,
  };
}
