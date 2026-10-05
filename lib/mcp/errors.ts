export const MCP_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "invalid_request",
  "not_found",
  "rate_limited",
  "result_too_large",
  "temporarily_unavailable",
  "internal_error",
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

const MESSAGES: Record<McpErrorCode, string> = {
  unauthorized: "Sign in required",
  forbidden: "Missing required scope",
  invalid_request: "Invalid tool arguments",
  not_found: "No matching record found. Try searching first.",
  rate_limited: "Too many requests. Try again shortly.",
  result_too_large: "Result is too large. Narrow the query.",
  temporarily_unavailable: "The service is temporarily unavailable. Try again later.",
  internal_error: "Unable to complete the request.",
};

export function isMcpErrorCode(value: unknown): value is McpErrorCode {
  return typeof value === "string" && (MCP_ERROR_CODES as readonly string[]).includes(value);
}

export class McpToolError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(MESSAGES[code]);
    this.name = "McpToolError";
  }
}

/**
 * Normalize any thrown value into a stable, non-leaking MCP error.
 *
 * Authentication errors thrown by `requireMcpPrincipal` carry an
 * `unauthorized`/`forbidden` code and are preserved; everything else becomes a
 * generic `internal_error` so Supabase messages and stack traces never reach the
 * model.
 */
export function toMcpToolError(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;

  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    isMcpErrorCode((error as { code: unknown }).code) &&
    ((error as { code: McpErrorCode }).code === "unauthorized" ||
      (error as { code: McpErrorCode }).code === "forbidden")
  ) {
    return new McpToolError((error as { code: McpErrorCode }).code);
  }

  return new McpToolError("internal_error");
}
