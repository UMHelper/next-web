import type { McpServer } from "@modelcontextprotocol/server";

import { searchCatalog } from "@/lib/mcp/data/search-catalog";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type McpToolContext,
  type McpToolResult,
  executeMcpTool,
} from "@/lib/mcp/execute";
import {
  type SearchCatalogOutput,
  mcpReadOnlyAnnotations,
  mcpSearchCatalogInputSchema,
  mcpSearchCatalogOutputSchema,
  searchCatalogInputSchema,
  searchCatalogOutputSchema,
} from "@/lib/mcp/schemas";

export const SEARCH_CATALOG_TOOL_NAME = "search_catalog";

export const SEARCH_CATALOG_ANNOTATIONS = {
  ...mcpReadOnlyAnnotations,
  title: "Search the What2REG@UM course and instructor catalog (read-only)",
} as const;

export const SEARCH_CATALOG_DESCRIPTION =
  "Read-only search of the What2REG@UM 澳大選咩課 catalog by course code, course title or " +
  "instructor name, optionally filtered by faculty or department. Returns one page of matching " +
  "courses (courseCode, titles, faculty, department, credits, offering flag) or instructors " +
  "(name, course count) together with `page`, `totalCount` and `hasMore`. When `hasMore` is " +
  "true, call the tool again with `page` + 1 to read the next page rather than reporting that " +
  "only the first page exists. Data comes from What2REG@UM, an unofficial student project by the " +
  "UMHelper developer team, and is not an official University of Macau statement. Keep and cite the returned https://umeh.top reference URLs in factual " +
  "answers, and call get_course / get_instructor before answering detailed questions.";

export const SEARCH_CATALOG_TOOL_CONFIG = {
  title: "Search What2REG@UM catalog",
  description: SEARCH_CATALOG_DESCRIPTION,
  inputSchema: mcpSearchCatalogInputSchema,
  outputSchema: mcpSearchCatalogOutputSchema,
  annotations: SEARCH_CATALOG_ANNOTATIONS,
};

function summarizeSearchCatalog(output: SearchCatalogOutput): string {
  const footer = output.hasMore
    ? `Page ${output.page} of ${output.totalCount} match(es); more results exist — request page ${output.page + 1} to continue.`
    : `Page ${output.page} of ${output.totalCount} match(es); this is the last page.`;

  if (output.type === "instructor") {
    if (output.results.length === 0) {
      return `No matching instructors on page ${output.page}. ${footer} Try a different instructor name, faculty or department, or request an earlier page.`;
    }
    return [
      "Instructors from the What2REG@UM catalog (keep these reference links):",
      ...output.results.map((item) => `- ${item.name} (${item.courseCount} courses) — ${item.url}`),
      footer,
    ].join("\n");
  }

  if (output.results.length === 0) {
    return `No matching courses on page ${output.page}. ${footer} Try a different course code, title, faculty or department, or request an earlier page.`;
  }

  return [
    "Courses from the What2REG@UM catalog (keep these reference links):",
    ...output.results.map((item) => {
      const title = item.titleEn ?? item.titleZh ?? "Untitled";
      return `- ${item.courseCode} — ${title} — ${item.url}`;
    }),
    footer,
  ].join("\n");
}

/**
 * Execute `search_catalog` through the shared MCP execution boundary:
 * authentication, both rate-limit tiers, the 10s budget, output validation and
 * the 64 KiB result cap all happen in `executeMcpTool`.
 *
 * Input is re-validated here (defense in depth) and a malformed argument set
 * becomes a stable `invalid_request` instead of reaching the data layer.
 */
export async function handleSearchCatalog(
  input: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  return executeMcpTool<unknown, SearchCatalogOutput>({
    toolName: SEARCH_CATALOG_TOOL_NAME,
    input,
    outputSchema: searchCatalogOutputSchema,
    ctx,
    run: async (rawInput, signal) => {
      const parsed = searchCatalogInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new McpToolError("invalid_request");
      return searchCatalog(parsed.data, signal);
    },
    summarize: summarizeSearchCatalog,
    countResults: (output) => output.results.length,
  });
}

export function registerSearchCatalogTool(server: McpServer): void {
  server.registerTool(SEARCH_CATALOG_TOOL_NAME, SEARCH_CATALOG_TOOL_CONFIG, (args, ctx) =>
    handleSearchCatalog(args, { http: ctx.http, signal: ctx.mcpReq.signal }),
  );
}
