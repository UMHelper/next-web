import { describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import { getComentListByCourseIDAndPage } from "@/lib/database/get-comment-list";

describe("getComentListByCourseIDAndPage", () => {
  it("passes viewer id to the RPC", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 1,
          avatar_seed: "abc",
          upvote_count: 2,
          downvote_count: 1,
          emoji_counts: [],
          vote_history: [],
        },
      ],
      error: null,
    });

    const result = await getComentListByCourseIDAndPage(42, 0, "user_2abcDEF");

    expect(rpc).toHaveBeenCalledWith(
      "get_comment_page_v2",
      expect.objectContaining({
        target_course_id: 42,
        target_page: 0,
        target_viewer_id: "user_2abcDEF",
      }),
    );
    expect(result[0].avatar_seed).toBe("abc");
  });
});
