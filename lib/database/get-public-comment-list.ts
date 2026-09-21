import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import supabaseServer from "@/lib/supabase/server";
import type { CommentPageRow } from "@/lib/database/types";

export const getPublicCommentPage = unstable_cache(
  async (courseId: number, page: number): Promise<CommentPageRow[]> => {
    const { data, error } = await supabaseServer.rpc("get_comment_page_v2", {
      target_course_id: Number(courseId),
      target_page: page,
      target_page_size: 20,
      target_viewer_id: null,
    });

    if (error) {
      throw new Error(`getPublicCommentPage failed: ${error.message}`);
    }

    return (data ?? []) as CommentPageRow[];
  },
  ["public-comment-page"],
  { revalidate: 300, tags: [CACHE_TAGS.comment, CACHE_TAGS.course, CACHE_TAGS.professor] },
);
