import { FILTER_CATALOG_RESULTS_TOOL_NAME } from "@/lib/assistant/catalog-result-sets";
import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { GET_COURSE_SECTIONS_TOOL_NAME } from "@/lib/assistant/course-sections-ui";
import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";

/** Tool names with dedicated inline renderers. The generic ToolTrace row is omitted; AssistantTurn pairs one ToolRow with the renderer. */
export const RICH_TOOL_NAMES: ReadonlySet<string> = new Set([
  SEARCH_CATALOG_TOOL_NAME,
  GET_COURSE_TOOL_NAME,
  GET_COURSE_SECTIONS_TOOL_NAME,
  FILTER_CATALOG_RESULTS_TOOL_NAME,
]);
