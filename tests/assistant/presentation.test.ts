import { describe, expect, it } from "vitest";

import { ALWAYS_RICH_TOOL_NAMES, RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import {
  activePresent,
  callsForActivity,
  courseCallIdentity,
  executePresentResponse,
  parsePresentArguments,
  planRichBlocks,
  PRESENT_RESPONSE_TOOL_NAME,
  sectionCallIdentity,
  type ToolCallLike,
} from "@/lib/assistant/presentation";

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function results(entries: Record<string, string>): Map<string, { content?: unknown }> {
  return new Map(Object.entries(entries).map(([id, content]) => [id, { content }]));
}

const course = (code: string) =>
  JSON.stringify({
    course: {
      courseCode: code,
      titleEn: code,
      titleZh: null,
      credits: "3",
      faculty: null,
      department: null,
      programLevel: null,
      suggestedYear: null,
      medium: null,
      gradingSystem: null,
      courseType: null,
      duration: null,
      description: null,
      isOffered: true,
      url: `https://umeh.top/course/${code}`,
    },
    page: 1,
    hasMore: false,
    totalCount: 0,
    instructors: [],
  });

describe("executePresentResponse", () => {
  it("accepts an empty show list and ignores unknown extra fields", () => {
    expect(executePresentResponse({ show: [], extra: true })).toEqual({ status: "accepted", show: [] });
    expect(executePresentResponse({})).toEqual({ status: "accepted", show: [] });
  });

  it("normalizes up to three distinct existing-component claims", () => {
    expect(
      executePresentResponse({
        show: [
          { component: "course_detail", course: "cisc2001" },
          { component: "course_sections", course: "CISC2001" },
        ],
      }),
    ).toEqual({
      status: "accepted",
      show: [
        { component: "course_detail", course: "CISC2001" },
        { component: "course_sections", course: "CISC2001" },
      ],
    });
  });

  it("rejects comparison modes, unknown components, and bad codes", () => {
    expect(executePresentResponse({ mode: "course_comparison", courses: ["CISC2001", "CISC2003"] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
    expect(executePresentResponse({ show: [{ component: "course_comparison", course: "CISC2001" }] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
    expect(executePresentResponse({ show: [{ component: "course_detail", course: "CISC 2001" }] })).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
  });

  it("rejects a show list with more than three items", () => {
    expect(
      executePresentResponse({
        show: [
          { component: "course_detail", course: "CISC2001" },
          { component: "course_detail", course: "CISC2002" },
          { component: "course_detail", course: "CISC2003" },
          { component: "course_sections", course: "CISC2004" },
        ],
      }),
    ).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
  });

  it("rejects duplicate component and course pairs", () => {
    expect(
      executePresentResponse({
        show: [
          { component: "course_detail", course: "CISC2001" },
          { component: "course_detail", course: "CISC2001" },
        ],
      }),
    ).toEqual({
      status: "rejected",
      reason: "invalid_request",
    });
  });
});

describe("parsePresentArguments", () => {
  it("returns null while JSON is incomplete", () => {
    expect(parsePresentArguments('{"show":')).toBeNull();
  });

  it("parses a finished payload", () => {
    expect(parsePresentArguments('{"show":[]}')).toEqual({ status: "accepted", show: [] });
  });
});

describe("planRichBlocks", () => {
  const always = ALWAYS_RICH_TOOL_NAMES;

  it("keeps search and filter rich, and hides course and section cards by default", () => {
    const calls = [
      call("s", "search_catalog", { query: "MATH" }),
      call("g", "get_course", { code: "CISC2001" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
    ];
    expect(planRichBlocks(calls, results({}), always, true).map((block) => block.callId)).toEqual(["s"]);
    expect(planRichBlocks(calls, results({}), always, false).map((block) => block.callId)).toEqual([]);
    expect(RICH_TOOL_NAMES.has("get_course")).toBe(true);
    expect(ALWAYS_RICH_TOOL_NAMES.has("get_course")).toBe(false);
  });

  it("mounts claimed course and section cards, including a rewritten canonical code", () => {
    const calls = [
      call("g", "get_course", { code: "CISC9999" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, {
        show: [
          { component: "course_detail", course: "CISC9999" },
          { component: "course_sections", course: "CISC2001" },
        ],
      }),
    ];
    const map = results({
      g: course("CISC2001"),
      sec: JSON.stringify({
        courseCode: "CISC2001",
        instructor: "CHAN TAI MAN",
        courseUrl: "https://umeh.top/course/CISC2001",
        sections: [],
      }),
    });
    expect(courseCallIdentity(calls[0], map.get("g")?.content as string)).toEqual({
      argument: "CISC9999",
      canonical: "CISC2001",
    });
    expect(sectionCallIdentity(calls[1], map.get("sec")?.content as string)).toEqual({
      argument: "CISC2001",
      canonical: "CISC2001",
    });
    expect(planRichBlocks(calls, map, always, false).map((block) => block.callId)).toEqual(["g", "sec"]);
  });

  it("lets a later accepted show replace an earlier one, and ignores a later rejection", () => {
    const lookups = [call("g", "get_course", { code: "CISC2001" })];
    const first = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(planRichBlocks(first, results({}), always, false)).toEqual([]);
    const rejectedLater = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { mode: "course_comparison" }),
    ];
    const map = results({
      p2: JSON.stringify({ status: "rejected", reason: "invalid_request" }),
    });
    expect(activePresent(rejectedLater, map)?.request).toEqual({
      status: "accepted",
      show: [{ component: "course_detail", course: "CISC2001" }],
    });
    expect(planRichBlocks(rejectedLater, map, always, false)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("still shows a clarification from get_course", () => {
    const calls = [call("g", "get_course", { code: "CISC2001" })];
    const map = results({ g: JSON.stringify({ status: "needs_clarification", ask: "Which course do you mean?" }) });
    expect(planRichBlocks(calls, map, always, true)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("drops present_response from activity", () => {
    const calls = [
      call("g", "get_course", { code: "CISC2001" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(callsForActivity(calls).map((entry) => entry.id)).toEqual(["g"]);
  });
});
