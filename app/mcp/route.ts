import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyMcpAccessToken } from "@/lib/mcp/auth";
import {
  MCP_REQUIRED_SCOPE,
  MCP_RESOURCE_METADATA_PATH,
  MCP_RESOURCE_URL,
  isProductionRuntime,
} from "@/lib/mcp/constants";
import { enforceBodyLimit } from "@/lib/mcp/http";
import {
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registerMcpTools,
} from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

const mcpHandler = createMcpHandler(
  (server) => {
    registerMcpTools(server);
  },
  {
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    capabilities: { tools: {} },
    instructions: MCP_SERVER_INSTRUCTIONS,
  },
);

const authorizedHandler = withMcpAuth(mcpHandler, verifyMcpAccessToken, {
  required: true,
  requiredScopes: [MCP_REQUIRED_SCOPE],
  // `mcp-handler` treats this option as the ORIGIN and appends
  // `resourceMetadataPath` to build the `resource_metadata` challenge URL
  // (`${origin}${path}`). Passing the full resource URL would emit
  // `https://umeh.top/mcp/.well-known/oauth-protected-resource/mcp`, which 404s.
  //
  // Production pins the exact origin; `next dev` leaves it undefined so the
  // handler derives the origin from the request (any dev port/host works).
  resourceUrl: isProductionRuntime() ? new URL(MCP_RESOURCE_URL).origin : undefined,
  resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
});

/**
 * The only production MCP business entry point: stateless Streamable HTTP.
 * Authentication, scope enforcement and the 401 challenge are handled by
 * `withMcpAuth`; the body limit is enforced before either runs.
 */
export async function POST(request: Request) {
  const limited = await enforceBodyLimit(request);
  if (!limited.ok) return limited.response;

  return authorizedHandler(limited.request);
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function GET() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
