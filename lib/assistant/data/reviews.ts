import { getReviewInfo } from "@/lib/database/get-prof-info";
import { McpToolError } from "@/lib/mcp/errors";
import supabaseServer from "@/lib/supabase/server";

import type { CountReviewsInput } from "../tool-schemas";

/**
 * Count the same public rows the review tool can read: top-level, not hidden.
 * The count is intentionally separate from page reading so the model can decide
 * whether more pages are worth fetching.
 */
export async function countCourseReviews(
  input: CountReviewsInput,
  signal: AbortSignal,
): Promise<{ totalCount: number }> {
  const mapping = await getReviewInfo(input.code, input.instructor);
  if (!mapping) throw new McpToolError("not_found");

  const { count, error } = await supabaseServer
    .from("comment")
    .select("id", { count: "exact", head: true })
    .eq("course_id", mapping.id)
    .is("replyto", null)
    .neq("hidden", 1)
    .abortSignal(signal);

  if (error) throw new McpToolError("temporarily_unavailable");
  return { totalCount: typeof count === "number" && count >= 0 ? count : 0 };
}
