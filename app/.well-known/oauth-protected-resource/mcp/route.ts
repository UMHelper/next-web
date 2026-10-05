import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

import { MCP_REQUIRED_SCOPE, resolveMcpResourceUrl } from "@/lib/mcp/constants";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

/**
 * RFC 9728 protected resource metadata for the MCP endpoint.
 *
 * Public protocol metadata only: it never reads course, review, user or database
 * data. `resource` is the pinned production MCP URL; in `next dev` it is derived
 * from the request so local discovery stays self-consistent (see
 * `resolveMcpResourceUrl`).
 */
export function GET(request: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }

  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: resolveMcpResourceUrl(request),
    properties: {
      scopes_supported: ["openid", "profile", "email", MCP_REQUIRED_SCOPE],
      resource_documentation: "https://umeh.top/support",
    },
  });

  return Response.json(metadata, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, OPTIONS", ...CORS_HEADERS },
  });
}

export function POST() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
