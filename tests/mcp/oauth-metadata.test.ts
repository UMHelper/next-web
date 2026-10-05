import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MCP_REQUIRED_SCOPE, MCP_RESOURCE_URL } from "@/lib/mcp/constants";

const PUBLISHABLE_KEY = `pk_test_${Buffer.from("clerk.test.invalid$")
  .toString("base64")
  .replace(/=+$/, "")}`;

const PROTECTED_RESOURCE_ROUTE = "app/.well-known/oauth-protected-resource/mcp/route.ts";

describe("protected resource metadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  });

  it("publishes the exact MCP resource, public scopes and documentation URL", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/mcp/route");

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resource).toBe(MCP_RESOURCE_URL);
    expect(body.authorization_servers).toEqual(["https://clerk.test.invalid"]);
    expect(body.scopes_supported).toEqual(
      expect.arrayContaining(["openid", "profile", "email", MCP_REQUIRED_SCOPE]),
    );
    expect(body.resource_documentation).toBe("https://umeh.top/support");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers an anonymous CORS preflight", async () => {
    const { OPTIONS } = await import("@/app/.well-known/oauth-protected-resource/mcp/route");

    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects non-protocol methods with 405", async () => {
    const { POST, PUT, PATCH, DELETE } = await import(
      "@/app/.well-known/oauth-protected-resource/mcp/route"
    );

    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, OPTIONS");
    }
  });

  it("does not reach the database, Supabase or Clerk server data", () => {
    const source = readFileSync(path.join(process.cwd(), PROTECTED_RESOURCE_ROUTE), "utf8");

    for (const forbidden of ["lib/database", "supabase", "clerkClient", "verifyIOSRequest"]) {
      expect(source, `metadata route must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("authorization server metadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          issuer: "https://clerk.test.invalid",
          authorization_endpoint: "https://clerk.test.invalid/oauth/authorize",
          token_endpoint: "https://clerk.test.invalid/oauth/token",
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves Clerk authorization metadata anonymously with CORS", async () => {
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.issuer).toBe("https://clerk.test.invalid");
    expect(body.authorization_endpoint).toBe("https://clerk.test.invalid/oauth/authorize");
  });

  it("answers OPTIONS and rejects other methods", async () => {
    const { OPTIONS, POST, DELETE } = await import(
      "@/app/.well-known/oauth-authorization-server/route"
    );

    const preflight = await OPTIONS();
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect((await POST()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});
