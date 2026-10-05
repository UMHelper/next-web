import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DELETE, GET, PATCH, POST, PUT } from "@/app/.well-known/openai-apps-challenge/route";

const ENV_KEY = "OPENAI_APPS_CHALLENGE_TOKEN";
const ROUTE_SOURCE = readFileSync(
  path.join(process.cwd(), "app/.well-known/openai-apps-challenge/route.ts"),
  "utf8",
);

describe("OpenAI domain verification endpoint", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("returns the exact configured token as plain text", async () => {
    process.env[ENV_KEY] = "abc123";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("abc123");
  });

  it("returns the configured value byte-for-byte, including outer whitespace", async () => {
    process.env[ENV_KEY] = "  token with spaces  ";

    const response = await GET();

    expect(await response.text()).toBe("  token with spaces  ");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace only", "   "],
  ])("returns 404 when the token is %s", async (_label, value) => {
    if (value === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = value;

    const response = await GET();

    expect(response.status).toBe(404);
  });

  it.each([
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("rejects %s with 405", async (_method, handler) => {
    process.env[ENV_KEY] = "abc123";

    const response = await handler();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("does not import Clerk, Supabase, the MCP server or database modules", () => {
    for (const forbidden of [
      "@clerk",
      "clerkClient",
      "supabase",
      "lib/mcp/server",
      "lib/database",
      "verifyIOSRequest",
    ]) {
      expect(ROUTE_SOURCE, `route source must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("MCP constants", () => {
  it("pins the production resource, scope and limits", async () => {
    const constants = await import("@/lib/mcp/constants");

    expect(constants.MCP_RESOURCE_URL).toBe("https://umeh.top/mcp");
    expect(constants.MCP_REQUIRED_SCOPE).toBe("umhelper:read");
    expect(constants.MCP_RESOURCE_METADATA_PATH).toBe("/.well-known/oauth-protected-resource/mcp");
    expect(constants.MCP_MAX_BODY_BYTES).toBe(64 * 1024);
    expect(constants.MCP_MAX_RESULT_BYTES).toBe(64 * 1024);
    expect(constants.MCP_TOOL_TIMEOUT_MS).toBe(10_000);
  });
});
