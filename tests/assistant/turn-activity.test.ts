import { describe, expect, it } from "vitest";

import {
  callsForExpandedActivity,
  formatTurnActivityDetail,
  summarizeTurnActivityCounts,
} from "@/lib/assistant/turn-activity";
import type { RichBlock, ToolCallLike } from "@/lib/assistant/presentation";

function call(id: string, name: string, args: unknown = {}): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

describe("turn activity helpers", () => {
  it("summarizes mixed research counts", () => {
    const calls = [
      call("s1", "search_catalog", { query: "AI" }),
      call("s2", "search_catalog", { query: "ML" }),
      call("g1", "get_course", { code: "CISC3023" }),
      call("r1", "get_course_reviews", { code: "CISC3023", instructor: "X" }),
    ];
    const results = new Map([
      ["s1", { content: "{}" }],
      ["s2", { content: "{}" }],
      ["g1", { content: "{}" }],
      ["r1", { content: "{}" }],
    ]);
    expect(summarizeTurnActivityCounts(calls, results)).toMatchObject({
      catalogSearches: 2,
      courseLookups: 1,
      reviewLookups: 1,
    });
    expect(formatTurnActivityDetail(summarizeTurnActivityCounts(calls, results))).toBe(
      "2 searches · 1 course lookup · 1 review lookup",
    );
  });

  it("excludes mounted rich tool calls from expanded activity", () => {
    const calls = [call("s1", "search_catalog", { query: "GEST" }), call("i1", "get_instructor", { name: "A" })];
    const richPlan: RichBlock[] = [{ kind: "tool", callId: "s1" }];
    expect(callsForExpandedActivity(calls, richPlan).map((entry) => entry.id)).toEqual(["i1"]);
  });
});
