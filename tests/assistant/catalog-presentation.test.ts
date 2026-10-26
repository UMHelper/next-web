import { describe, expect, it } from "vitest";

import {
  parsePresentRequest,
  planRichBlocks,
  PRESENT_RESPONSE_TOOL_NAME,
  type ToolCallLike,
} from "@/lib/assistant/presentation";
import { ALWAYS_RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import { SITE_URL } from "@/lib/site";

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function catalogBody(codes: string[], totalCount?: number) {
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: false,
    totalCount: totalCount ?? codes.length,
    results: codes.map((courseCode) => ({
      courseCode,
      titleEn: courseCode,
      titleZh: null,
      faculty: null,
      department: null,
      credits: "3",
      isOffered: true,
      aka: [],
      url: `${SITE_URL}/course/${courseCode}`,
    })),
  });
}

describe("parsePresentRequest catalog and recommendations", () => {
  it("accepts browse catalog without show items", () => {
    expect(parsePresentRequest({ catalog: { mode: "browse" } })).toEqual({
      show: [],
      catalog: { mode: "browse" },
    });
  });

  it("accepts recommendations with course codes", () => {
    expect(
      parsePresentRequest({
        recommendations: { courses: ["GEST1000", "GEST1001"] },
      }),
    ).toEqual({
      show: [],
      recommendations: { courses: ["GEST1000", "GEST1001"] },
    });
  });
});

describe("planRichBlocks catalog presentation", () => {
  const always = ALWAYS_RICH_TOOL_NAMES;

  it("hides multiple search lists unless browse is claimed", () => {
    const calls = [
      call("s1", "search_catalog", { query: "AI" }),
      call("s2", "search_catalog", { query: "ML" }),
      call("s3", "search_catalog", { query: "CISC" }),
    ];
    const results = new Map([
      ["s1", { content: catalogBody(["CISC3023"]) }],
      ["s2", { content: catalogBody(["CISC3014"]) }],
      ["s3", { content: catalogBody(["CISC1001"]) }],
    ]);
    expect(planRichBlocks(calls, results, always, false)).toEqual([]);
  });

  it("mounts one browse list when present_response claims browse", () => {
    const calls = [
      call("s1", "search_catalog", { query: "AI" }),
      call("s2", "search_catalog", { query: "ML" }),
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { catalog: { mode: "browse", resultSetId: "s1" } }),
    ];
    const results = new Map([
      ["s1", { content: catalogBody(["CISC3023"]) }],
      ["s2", { content: catalogBody(["CISC3014"]) }],
    ]);
    expect(
      planRichBlocks(calls, results, always, false)
        .filter((block): block is { kind: "tool"; callId: string } => block.kind === "tool")
        .map((block) => block.callId),
    ).toEqual(["s1"]);
  });

  it("mounts recommendations when every code has turn evidence", () => {
    const calls = [
      call("s1", "search_catalog", { query: "AI" }),
      call("p1", PRESENT_RESPONSE_TOOL_NAME, {
        recommendations: { courses: ["CISC3023", "CISC3014"] },
      }),
    ];
    const results = new Map([["s1", { content: catalogBody(["CISC3023", "CISC3014"]) }]]);
    expect(planRichBlocks(calls, results, always, false)).toEqual([
      { kind: "recommendations", presentCallId: "p1", courses: ["CISC3023", "CISC3014"] },
    ]);
  });

  it("skips recommendations shortlist when any code lacks evidence", () => {
    const calls = [
      call("s1", "search_catalog", { query: "AI" }),
      call("p1", PRESENT_RESPONSE_TOOL_NAME, {
        recommendations: { courses: ["CISC3023", "CISC9999"] },
      }),
    ];
    const results = new Map([["s1", { content: catalogBody(["CISC3023"]) }]]);
    expect(planRichBlocks(calls, results, always, false)).toEqual([]);
  });

  it("defers catalog lists while the turn is streaming", () => {
    const calls = [
      call("s1", "search_catalog", { query: "GEST" }),
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { catalog: { mode: "browse" } }),
    ];
    const results = new Map([["s1", { content: catalogBody(["GEST1000"], 19) }]]);
    expect(planRichBlocks(calls, results, always, true)).toEqual([]);
  });
});
