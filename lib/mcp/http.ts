import { MCP_MAX_BODY_BYTES } from "@/lib/mcp/constants";

export type BodyLimitResult =
  | { ok: true; request: Request }
  | { ok: false; response: Response };

function bodyTooLarge() {
  return Response.json(
    { error: { code: "invalid_request", message: "Request body too large" } },
    { status: 413 },
  );
}

/**
 * Enforce the MCP request-body limit before authentication or dispatch.
 *
 * `Content-Length` is checked first so an oversized declared body is rejected
 * without reading it; the body is then read once and re-checked against the real
 * byte length, and the Request is rebuilt so the handler can still consume it.
 * The body and the Authorization header are never logged.
 */
export async function enforceBodyLimit(request: Request): Promise<BodyLimitResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MCP_MAX_BODY_BYTES) {
    return { ok: false, response: bodyTooLarge() };
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MCP_MAX_BODY_BYTES) {
    return { ok: false, response: bodyTooLarge() };
  }

  return {
    ok: true,
    request: new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: buffer.byteLength > 0 ? buffer : undefined,
    }),
  };
}
