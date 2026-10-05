import type { McpServer } from "@modelcontextprotocol/server";

export const MCP_SERVER_NAME = "what2reg-um";
export const MCP_SERVER_VERSION = "0.1.0";

/**
 * Temporary transport smoke tool.
 *
 * Exists only to prove initialize / tools/list / tools/call over the real
 * Cloudflare transport. It MUST be deleted in Task 9 before the portable plugin
 * package is built; `tests/mcp/protocol.test.ts` asserts the final tool list
 * contains exactly the five approved tools.
 */
export function registerTemporaryHealthTool(server: McpServer): void {
  server.registerTool(
    "health",
    {
      title: "Health",
      description: "Temporary transport smoke tool. Not part of the public plugin.",
    },
    async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
  );
}
