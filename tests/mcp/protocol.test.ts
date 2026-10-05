import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, verifyClerkTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  verifyClerkTokenMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: verifyClerkTokenMock }));

import { POST } from "@/app/mcp/route";
import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";
import { MCP_SERVER_NAME } from "@/lib/mcp/server";

function mcpRequest(payload: unknown) {
  return new Request("https://umeh.top/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer tok",
    },
    body: JSON.stringify(payload),
  });
}

async function readJsonRpc(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    return dataLine ? JSON.parse(dataLine.slice("data:".length).trim()) : null;
  }
  return text.length > 0 ? JSON.parse(text) : null;
}

describe("MCP protocol over the protected transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      isAuthenticated: true,
      tokenType: "oauth_token",
      clientId: "client_1",
      scopes: ["openid", MCP_REQUIRED_SCOPE],
      userId: "user_1",
    });
    verifyClerkTokenMock.mockReturnValue({
      token: "tok",
      clientId: "client_1",
      scopes: ["openid", MCP_REQUIRED_SCOPE],
      extra: { userId: "user_1" },
    });
  });

  it("completes the initialize handshake", async () => {
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    );

    expect(response.status).toBe(200);
    const message = await readJsonRpc(response);
    expect(message?.result?.serverInfo?.name).toBe(MCP_SERVER_NAME);
    expect(message?.result?.protocolVersion).toBeTruthy();
  });

  it("lists the temporary health tool during Task 4", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));

    expect(response.status).toBe(200);
    const message = await readJsonRpc(response);
    const names = (message?.result?.tools ?? []).map((tool: { name: string }) => tool.name);
    expect(names).toEqual(["health"]);
  });

  it("calls the temporary health tool", async () => {
    const response = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "health", arguments: {} } }),
    );

    expect(response.status).toBe(200);
    const message = await readJsonRpc(response);
    expect(message?.result?.content?.[0]?.text).toBe("ok");
  });
});
