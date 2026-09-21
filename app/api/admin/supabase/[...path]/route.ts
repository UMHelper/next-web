import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  buildRelayHeaders,
  isAllowedRelayPath,
  MAX_RELAY_BODY_BYTES,
} from "@/lib/supabase-relay";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "HEAD"]);
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-range"];

// supabase-js only reads the top-level `message` of an error body. Relay-level
// errors must carry it, otherwise the client sees an empty message.
function relayError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message }, code, message }, { status });
}

async function passthroughAdminError(response: Response) {
  let code = "forbidden";
  let message = "Admin access required";
  try {
    const body = await response.clone().json();
    if (typeof body?.error?.code === "string") code = body.error.code;
    if (typeof body?.error?.message === "string") message = body.error.message;
  } catch {
    // keep defaults
  }
  console.error(`[relay] admin gate rejected: ${response.status} ${code}`);
  return relayError(code, message, response.status);
}

async function handle(request: Request, context: { params: { path: string[] } }) {
  try {
    const admin = await requireAdmin({ platformOnly: true });
    if (!admin.ok) return passthroughAdminError(admin.response);

    if (!ALLOWED_METHODS.has(request.method)) {
      return relayError("method_not_allowed", "Method not allowed", 405);
    }
    if (!isAllowedRelayPath(context.params.path)) {
      return relayError("forbidden", "Relay path not allowed", 403);
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!base || !secretKey) {
      return relayError("internal_error", "Relay not configured", 500);
    }

    const search = new URL(request.url).search;
    const upstream = `${base.replace(/\/$/, "")}/${context.params.path.join("/")}${search}`;
    const init: RequestInit = {
      method: request.method,
      headers: buildRelayHeaders(request.headers, secretKey),
      cache: "no-store",
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      const body = await request.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RELAY_BODY_BYTES) {
        return relayError("payload_too_large", "Request body too large", 413);
      }
      init.body = body;
    }

    const upstreamResponse = await fetch(upstream, init);

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      if (payload && typeof payload.message === "string") {
        return NextResponse.json(payload, { status: upstreamResponse.status });
      }
      const message = text.slice(0, 500) || `Upstream error ${upstreamResponse.status}`;
      console.error(`[relay] upstream ${upstreamResponse.status}: ${message.slice(0, 200)}`);
      return relayError("upstream_error", message, upstreamResponse.status);
    }

    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[relay] unexpected failure:", message);
    return relayError("internal_error", message, 500);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as HEAD };
