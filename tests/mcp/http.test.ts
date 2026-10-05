import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, verifyClerkTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  verifyClerkTokenMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc: vi.fn() } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: verifyClerkTokenMock }));

import { DELETE, GET, POST } from "@/app/mcp/route";
import {
  MCP_MAX_BODY_BYTES,
  MCP_REQUIRED_SCOPE,
  MCP_RESOURCE_METADATA_PATH,
} from "@/lib/mcp/constants";

export const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "vitest", version: "1.0.0" },
  },
});

function mcpRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://umeh.top/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body,
  });
}

function authenticate(scopes: string[] = ["openid", MCP_REQUIRED_SCOPE]) {
  authMock.mockResolvedValue({
    isAuthenticated: true,
    tokenType: "oauth_token",
    clientId: "client_1",
    scopes,
    userId: "user_1",
  });
  verifyClerkTokenMock.mockReturnValue({
    token: "tok",
    clientId: "client_1",
    scopes,
    extra: { userId: "user_1" },
  });
}

describe("POST /mcp HTTP boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      isAuthenticated: false,
      tokenType: "oauth_token",
      clientId: null,
      scopes: null,
      userId: null,
    });
    verifyClerkTokenMock.mockReturnValue(undefined);
  });

  it("returns 401 with a challenge pointing at the protected resource metadata", async () => {
    const response = await POST(mcpRequest(INITIALIZE_BODY));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate") ?? "").toContain(MCP_RESOURCE_METADATA_PATH);
  });

  it("returns 401 for an invalid bearer token", async () => {
    const response = await POST(mcpRequest(INITIALIZE_BODY, { authorization: "Bearer nope" }));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the token lacks umhelper:read", async () => {
    authenticate(["openid", "profile"]);

    const response = await POST(mcpRequest(INITIALIZE_BODY, { authorization: "Bearer tok" }));

    expect(response.status).toBe(403);
  });

  it("rejects GET and DELETE with 405 without authenticating", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared Content-Length with 413 before authenticating", async () => {
    const response = await POST(
      mcpRequest(INITIALIZE_BODY, { "content-length": String(MCP_MAX_BODY_BYTES + 1) }),
    );

    expect(response.status).toBe(413);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects a streaming body over the limit that has no Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MCP_MAX_BODY_BYTES + 1));
        controller.close();
      },
    });
    const request = new Request("https://umeh.top/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: stream,
      // Node's fetch implementation requires this for stream bodies.
      // @ts-expect-error duplex is not in the DOM RequestInit type
      duplex: "half",
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("does not accept a bearer token supplied through the query string", async () => {
    const response = await POST(
      new Request("https://umeh.top/mcp?token=tok", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: INITIALIZE_BODY,
      }),
    );

    expect(response.status).toBe(401);
  });
});
