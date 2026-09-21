import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";
import {
  buildRelayHeaders,
  isAllowedRelayPath,
  MAX_RELAY_BODY_BYTES,
} from "@/lib/supabase-relay";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "HEAD"]);
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-range"];

async function handle(request: Request, context: { params: { path: string[] } }) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  if (!ALLOWED_METHODS.has(request.method)) {
    return apiError("method_not_allowed", "Method not allowed", 405);
  }
  if (!isAllowedRelayPath(context.params.path)) {
    return apiError("forbidden", "Relay path not allowed", 403);
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secretKey) {
    return apiError("internal_error", "Relay not configured", 500);
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
      return apiError("payload_too_large", "Request body too large", 413);
    }
    init.body = body;
  }

  const upstreamResponse = await fetch(upstream, init);
  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as HEAD };
