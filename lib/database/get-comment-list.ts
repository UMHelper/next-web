import supabaseServer from "@/lib/supabase/server";
import type { CommentPageRow } from "@/lib/database/types";

export const getComentListByCourseIDAndPage = async (
  courseId: number,
  page: number,
  viewerId: string | null = null,
) => {
  const { data, error } = await supabaseServer.rpc("get_comment_page_v2", {
    target_course_id: Number(courseId),
    target_page: page,
    target_page_size: 20,
    target_viewer_id: viewerId,
  });

  if (error) {
    throw new Error(`get_comment_page failed: ${error.message}`);
  }

  return (data ?? []) as CommentPageRow[];
};

