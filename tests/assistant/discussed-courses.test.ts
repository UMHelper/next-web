import { describe, expect, it } from "vitest";

import {
  DISCUSSED_COURSES_CONTEXT_DESCRIPTION,
  MAX_DISCUSSED_CONTEXT_CHARS,
  summarizeDiscussedCourses,
  type DiscussedMessage,
} from "@/lib/assistant/discussed-courses";
import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { PRESENT_RESPONSE_TOOL_NAME } from "@/lib/assistant/presentation";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";
import { SITE_URL } from "@/lib/site";

function coursePayload(courseCode: string) {
  return JSON.stringify({
    course: {
      courseCode,
      titleEn: "Sample",
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
      url: `${SITE_URL}/course/${courseCode}`,
    },
    page: 1,
    hasMore: false,
    totalCount: 1,
    instructors: [],
  });
}

function getCourseTurn(userText: string, codes: string[], callPrefix = "g") {
  const messages: DiscussedMessage[] = [{ role: "user", content: userText }];
  const toolCalls = codes.map((code, index) => ({
    id: `${callPrefix}${index + 1}`,
    function: { name: GET_COURSE_TOOL_NAME, arguments: JSON.stringify({ code }) },
  }));
  messages.push({ role: "assistant", toolCalls });
  for (let index = 0; index < codes.length; index++) {
    messages.push({
      role: "tool",
      toolCallId: `${callPrefix}${index + 1}`,
      content: coursePayload(codes[index]),
    });
  }
  return messages;
}

describe("summarizeDiscussedCourses", () => {
  it("exports context metadata", () => {
    expect(DISCUSSED_COURSES_CONTEXT_DESCRIPTION.length).toBeGreaterThan(0);
    expect(MAX_DISCUSSED_CONTEXT_CHARS).toBe(1200);
  });

  it("stringifies empty messages", () => {
    expect(JSON.parse(summarizeDiscussedCourses([]))).toEqual({ active: null, turns: [] });
  });

  it("orders an explicit two-code comparison newest first", () => {
    const messages = [
      ...getCourseTurn("Tell me about MATH1001", ["MATH1001"], "m"),
      ...getCourseTurn("CISC2001 vs CISC2003?", ["CISC2001", "CISC2003"]),
    ];
    const parsed = JSON.parse(summarizeDiscussedCourses(messages));
    expect(parsed.turns[0].order).toEqual(["CISC2001", "CISC2003"]);
    expect(parsed.active?.order).toEqual(["CISC2001", "CISC2003"]);
    expect(parsed.turns[0].order).not.toContain("MATH1001");
  });

  it("clears active after a later catalog search", () => {
    const messages = [
      ...getCourseTurn("CISC2001 vs CISC2003?", ["CISC2001", "CISC2003"]),
      { role: "user", content: "Search for ACCT" },
      {
        role: "assistant",
        toolCalls: [{ id: "s1", function: { name: "search_catalog", arguments: "{}" } }],
      },
      { role: "tool", toolCallId: "s1", content: JSON.stringify({ results: [], totalCount: 0 }) },
    ];
    const parsed = JSON.parse(summarizeDiscussedCourses(messages));
    expect(parsed.active).toBeNull();
    expect(parsed.turns[0].order).toEqual(["CISC2001", "CISC2003"]);
  });

  it("puts the page course before the named code for this plus one", () => {
    const messages = getCourseTurn("Compare this with CISC2003.", ["CISC2001", "CISC2003"]);
    const parsed = JSON.parse(summarizeDiscussedCourses(messages));
    expect(parsed.turns[0].order).toEqual(["CISC2001", "CISC2003"]);
    expect(parsed.active?.order).toEqual(["CISC2001", "CISC2003"]);
  });

  it("uses presented discovery shortlist order for ordinals", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "Suggest some GE courses" },
      {
        role: "assistant",
        toolCalls: [
          {
            id: "d1",
            function: {
              name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
              arguments: '{"scope":{"courseType":"GE"}}',
            },
          },
          {
            id: "p1",
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: '{"recommendations":{"courses":["GEST1006-002","GESB1013"]}}',
            },
          },
        ],
      },
      { role: "tool", toolCallId: "d1", content: discoverTwoCandidateResult() },
      { role: "tool", toolCallId: "p1", content: JSON.stringify({ status: "requested", items: [], note: "" }) },
    ];
    const parsed = JSON.parse(summarizeDiscussedCourses(messages));
    expect(parsed.active).toEqual({
      id: "rec-0",
      order: ["GEST1006", "GESB1013"],
      newerThanCatalog: true,
    });
  });
});
