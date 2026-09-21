import { describe, expect, it } from "vitest";

import { buildReplyPayload, buildVotePayload } from "@/lib/comment-payload";

describe("comment payload builders", () => {
  it("builds a reply payload without client identity fields", () => {
    const payload = buildReplyPayload(42, "hello");
    expect(payload).toEqual({ replyto: 42, content: "hello" });
    expect(Object.keys(payload).sort()).toEqual(["content", "replyto"]);
  });

  it("builds a vote payload without client identity fields", () => {
    const payload = buildVotePayload(42, 1);
    expect(payload).toEqual({ comment: 42, offset: 1 });
    expect(Object.keys(payload).sort()).toEqual(["comment", "offset"]);
  });

  it("includes emoji only when provided", () => {
    expect(buildVotePayload(42, 0, "🔥")).toEqual({ comment: 42, offset: 0, emoji: "🔥" });
    expect(buildVotePayload(42, 0)).toEqual({ comment: 42, offset: 0 });
  });
});
