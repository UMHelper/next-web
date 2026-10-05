import type { McpServer } from "@modelcontextprotocol/server";

import { registerGetCourseReviewsTool } from "@/lib/mcp/tools/get-course-reviews";
import { registerGetCourseSectionsTool } from "@/lib/mcp/tools/get-course-sections";
import { registerGetCourseTool } from "@/lib/mcp/tools/get-course";
import { registerGetInstructorTool } from "@/lib/mcp/tools/get-instructor";
import { registerSearchCatalogTool } from "@/lib/mcp/tools/search-catalog";

export const MCP_SERVER_NAME = "what2reg-um";
export const MCP_SERVER_VERSION = "0.1.0";

/**
 * Review-facing server instructions, surfaced by `initialize` (spec §6/§7/§9).
 *
 * They tell the model where the data comes from, that every tool is read-only,
 * that the returned `https://umeh.top` reference URLs must be preserved, that
 * results can be paginated or truncated, and that UMHelper data is not the
 * University of Macau's official opinion.
 */
export const MCP_SERVER_INSTRUCTIONS =
  "What2Reg @ UM (UMHelper) is a read-only course and instructor catalog for the University of " +
  "Macau. All five tools only read public UMHelper data: catalog entries, instructor review " +
  "summaries, public top-level reviews and class sections. Never present UMHelper results as " +
  "the official opinion or official statement of the University of Macau; they are community " +
  "data. Keep and cite the absolute https://umeh.top reference URLs returned with every result " +
  "in factual answers. Results may be paginated or truncated by the list, page and text limits, " +
  "so use the documented page/limit arguments or narrow the query when more detail is needed, " +
  "and call search_catalog first when an exact course code or instructor name is unknown.";

/**
 * Register exactly the five approved public tools.
 *
 * No temporary, diagnostic or write-capable tools belong here, and no other
 * module registers tools for this server. `tests/mcp/protocol.test.ts` asserts
 * the runtime `tools/list` result is exactly these five, and
 * `tests/mcp/security-boundaries.test.ts` asserts this source inventory stays
 * closed.
 */
export function registerMcpTools(server: McpServer): void {
  registerSearchCatalogTool(server);
  registerGetCourseTool(server);
  registerGetInstructorTool(server);
  registerGetCourseReviewsTool(server);
  registerGetCourseSectionsTool(server);
}
