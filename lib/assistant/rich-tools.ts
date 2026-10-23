import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";

/** Tool names with dedicated inline renderers; suppress generic ToolTrace when rich UI applies. */
export const RICH_TOOL_NAMES: ReadonlySet<string> = new Set([
  SEARCH_CATALOG_TOOL_NAME,
  GET_COURSE_TOOL_NAME,
]);
