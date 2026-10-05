import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

import { MCP_REQUIRED_SCOPE, MCP_RESOURCE_URL } from "@/lib/mcp/constants";

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
 * data. `resource` is the explicit production MCP URL rather than an origin
 * derived from the incoming request.
 */
export function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }

  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: MCP_RESOURCE_URL,
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
