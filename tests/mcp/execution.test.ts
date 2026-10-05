import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeMock, authMock, verifyClerkTokenMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  authMock: vi.fn(),
  verifyClerkTokenMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc: vi.fn() } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: verifyClerkTokenMock }));
vi.mock("@/lib/mcp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/rate-limit")>();
  return { ...actual, consumeMcpRateLimits: consumeMock };
});

import { MCP_MAX_RESULT_BYTES, MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";
import { McpToolError } from "@/lib/mcp/errors";
import {
  executeMcpTool,
  type ExecuteMcpToolOptions,
  type McpToolContext,
} from "@/lib/mcp/execute";

type Output = { items: string[] };

const authInfo = {
  token: "tok",
  clientId: "client_1",
  scopes: ["openid", MCP_REQUIRED_SCOPE],
  extra: { userId: "user_1" },
};

const outputSchema = { parse: (value: unknown) => value as Output };

function makeOptions(
  overrides: Partial<ExecuteMcpToolOptions<Record<string, never>, Output>> = {},
): ExecuteMcpToolOptions<Record<string, never>, Output> {
  return {
    toolName: "search_catalog",
    input: {},
    outputSchema,
    ctx: { http: { authInfo } } as McpToolContext,
    run: vi.fn(async () => ({ items: ["a"] })),
    summarize: () => "1 result",
    countResults: (output) => output.items.length,
    requestId: "req-1",
    now: () => 1000,
    logger: vi.fn(),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("expected executeMcpTool to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(McpToolError);
    expect((error as McpToolError).code).toBe(code);
  }
}

describe("executeMcpTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  it("authenticates from ctx.http.authInfo and consumes both tiers in order", async () => {
    const options = makeOptions();

    const result = await executeMcpTool(options);

    expect(consumeMock).toHaveBeenCalledWith("user_1", "search_catalog");
    expect(result.structuredContent).toEqual({ items: ["a"] });
    expect(result.content).toEqual([{ type: "text", text: "1 result" }]);
  });

  it("fails closed when no auth context is present", async () => {
    const run = vi.fn(async () => ({ items: ["a"] }));

    await expectCode(executeMcpTool(makeOptions({ ctx: {}, run })), "unauthorized");

    expect(run).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("fails closed as forbidden when the scope is missing", async () => {
    const run = vi.fn(async () => ({ items: ["a"] }));
    const options = makeOptions({
      ctx: { http: { authInfo: { ...authInfo, scopes: ["openid"] } } },
      run,
    });

    await expectCode(executeMcpTool(options), "forbidden");

    expect(run).not.toHaveBeenCalled();
  });

  it("returns rate_limited with retry information and never touches the data layer", async () => {
    consumeMock.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const run = vi.fn(async () => ({ items: ["a"] }));

    await expectCode(executeMcpTool(makeOptions({ run })), "rate_limited");

    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed when the rate-limit store errors", async () => {
    consumeMock.mockRejectedValue(new Error("rpc down"));
    const run = vi.fn(async () => ({ items: ["a"] }));

    await expectCode(executeMcpTool(makeOptions({ run })), "temporarily_unavailable");

    expect(run).not.toHaveBeenCalled();
  });

  it("maps an aborted run to temporarily_unavailable", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    await expectCode(
      executeMcpTool(makeOptions({ ctx: { http: { authInfo }, signal: controller.signal }, run })),
      "temporarily_unavailable",
    );
  });

  it("treats an output that fails the schema as a server error", async () => {
    const options = makeOptions({
      outputSchema: {
        parse: () => {
          throw new Error("bad shape");
        },
      },
    });

    await expectCode(executeMcpTool(options), "internal_error");
  });

  it("rejects serialized results above the 64 KiB limit without returning a partial object", async () => {
    const huge = "x".repeat(MCP_MAX_RESULT_BYTES + 128);
    const options = makeOptions({ run: vi.fn(async () => ({ items: [huge] })) });

    await expectCode(executeMcpTool(options), "result_too_large");
  });

  it("logs only low-sensitivity fields and never the raw user id", async () => {
    const logger = vi.fn();
    const options = makeOptions({ logger });

    await executeMcpTool(options);

    expect(logger).toHaveBeenCalledTimes(1);
    const event = logger.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual(
      ["durationMs", "requestId", "resultCount", "status", "tool", "userHash"].sort(),
    );
    expect(JSON.stringify(event)).not.toContain("user_1");
    expect(event.userHash).toMatch(/^[0-9a-f]{32}$/);
  });
});
