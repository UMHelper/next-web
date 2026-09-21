import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const UM_BASE = "https://api.data.um.edu.mo/service/academic";
const UM_RESOURCES: Record<string, string> = {
  course_catalog: "course_catalog/all",
  course_catalog_v1: "course_catalog/v1.0.0/all",
  courses: "courses/all",
};

export function resolveUmResource(resource: string | null): string | null {
  if (!resource) return null;
  return UM_RESOURCES[resource] ?? null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const token = process.env.UM_OPEN_DATA_TOKEN;
  if (!token) return apiError("internal_error", "UM token not configured", 500);

  const url = new URL(request.url);
  const path = resolveUmResource(url.searchParams.get("resource"));
  const code = (url.searchParams.get("course_code") ?? "").trim().toUpperCase();

  if (!path) return apiError("invalid_request", "Unknown UM resource", 400);
  if (!/^[A-Z]{4}\d{4}$/.test(code)) {
    return apiError("invalid_request", "Invalid course code", 400);
  }

  const upstream = `${UM_BASE}/${path}?course_code=${encodeURIComponent(code)}`;
  const response = await fetch(upstream, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
