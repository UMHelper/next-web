import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError("invalid_request", "Invalid JSON body", 400) };
  }
}

export async function readFormData(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<FormData>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  try {
    return { ok: true, data: await request.formData() };
  } catch {
    return { ok: false, response: apiError("invalid_request", "Invalid multipart body", 400) };
  }
}
