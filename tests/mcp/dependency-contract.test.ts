import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("MCP dependency contract", () => {
  it("pins the reviewed MCP packages and Node engine", () => {
    expect(pkg.dependencies["@clerk/mcp-tools"]).toBe("0.6.0");
    expect(pkg.dependencies["mcp-handler"]).toBe("2.2.0");
    expect(pkg.dependencies["@modelcontextprotocol/server"]).toBe("2.3.1");
    expect(pkg.engines.node).toBe(">=20.9.0");
  });

  it("loads zod/v4 without migrating the site off zod 3", async () => {
    const zod4 = await import("zod/v4");
    expect(typeof zod4.z?.object).toBe("function");
    expect(typeof zod4.z?.string).toBe("function");
  });

  it("exposes the mcp-handler transport and auth wrappers", async () => {
    const handler = await import("mcp-handler");
    expect(typeof handler.createMcpHandler).toBe("function");
    expect(typeof handler.withMcpAuth).toBe("function");
  });

  it("exposes the Clerk MCP helpers used by the routes and adapter", async () => {
    const server = await import("@clerk/mcp-tools/server");
    expect(typeof server.verifyClerkToken).toBe("function");
    expect(typeof server.generateClerkProtectedResourceMetadata).toBe("function");

    const next = await import("@clerk/mcp-tools/next");
    expect(typeof next.authServerMetadataHandlerClerk).toBe("function");
    expect(typeof next.metadataCorsOptionsRequestHandler).toBe("function");
  });
});
