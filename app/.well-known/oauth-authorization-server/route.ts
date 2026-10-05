import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";

export const dynamic = "force-dynamic";

const getAuthorizationServerMetadata = authServerMetadataHandlerClerk();
const corsPreflight = metadataCorsOptionsRequestHandler();

/**
 * RFC 8414 authorization server metadata, proxied from Clerk for older MCP
 * clients. Public protocol metadata only; no business data is reachable here.
 */
export function GET() {
  return getAuthorizationServerMetadata();
}

export function OPTIONS() {
  return corsPreflight();
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "GET, OPTIONS" } });
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
