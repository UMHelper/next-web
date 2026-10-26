import { describe, expect, it } from "vitest";

import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { PREVIEW_TIMETABLE_TOOL_NAME } from "@/lib/assistant/timetable-preview";
import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";
import { PRESENT_RESPONSE_TOOL_NAME } from "@/lib/assistant/presentation";
import {
  MAX_VISIBLE_BLOCKS_CONTEXT_CHARS,
  summarizeVisibleBlocks,
  VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
} from "@/lib/assistant/visible-blocks";
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

const turnWithClaimedAndUnclaimed: DiscussedMessage[] = [
  { role: "user", content: "Tell me about GELH1000 and also look up CISC2001." },
  {
    role: "assistant",
    toolCalls: [
      { id: "g1", function: { name: GET_COURSE_TOOL_NAME, arguments: '{"code":"GELH1000"}' } },
      { id: "g2", function: { name: GET_COURSE_TOOL_NAME, arguments: '{"code":"CISC2001"}' } },
      {
        id: "p1",
        function: {
          name: PRESENT_RESPONSE_TOOL_NAME,
          arguments: '{"show":[{"component":"course_detail","course":"GELH1000"}]}',
        },
      },
    ],
  },
  { role: "tool", toolCallId: "g1", content: coursePayload("GELH1000") },
  { role: "tool", toolCallId: "g2", content: coursePayload("CISC2001") },
  {
    role: "tool",
    toolCallId: "p1",
    content: JSON.stringify({
      status: "requested",
      items: [{ component: "course_detail", course: "GELH1000", eligibility: "ready" }],
      note: "note",
    }),
  },
];

describe("summarizeVisibleBlocks", () => {
  it("exports context metadata", () => {
    expect(VISIBLE_BLOCKS_CONTEXT_DESCRIPTION).toContain("Rich blocks the chat actually displayed");
    expect(MAX_VISIBLE_BLOCKS_CONTEXT_CHARS).toBe(900);
  });

  it("lists a claimed course card and omits an unclaimed lookup", () => {
    expect(JSON.parse(summarizeVisibleBlocks(turnWithClaimedAndUnclaimed))).toEqual({
      latestTurn: 1,
      turns: [{ turn: 1, blocks: [{ kind: "course_detail", course: "GELH1000" }] }],
    });
  });

  it("omits a claimed lookup that failed and a call with no result yet", () => {
    const failed: DiscussedMessage[] = [
      { role: "user", content: "GELH1000" },
      {
        role: "assistant",
        toolCalls: [
          { id: "g1", function: { name: GET_COURSE_TOOL_NAME, arguments: '{"code":"GELH1000"}' } },
          {
            id: "p1",
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: '{"show":[{"component":"course_detail","course":"GELH1000"}]}',
            },
          },
        ],
      },
      { role: "tool", toolCallId: "g1", content: JSON.stringify({ error: "not_found" }) },
    ];
    expect(JSON.parse(summarizeVisibleBlocks(failed))).toEqual({
      latestTurn: 1,
      turns: [{ turn: 1, blocks: [] }],
    });

    const pending: DiscussedMessage[] = [
      { role: "user", content: "GELH1000" },
      {
        role: "assistant",
        toolCalls: [
          { id: "g1", function: { name: GET_COURSE_TOOL_NAME, arguments: '{"code":"GELH1000"}' } },
          {
            id: "p1",
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: '{"show":[{"component":"course_detail","course":"GELH1000"}]}',
            },
          },
        ],
      },
    ];
    expect(JSON.parse(summarizeVisibleBlocks(pending))).toEqual({
      latestTurn: 1,
      turns: [{ turn: 1, blocks: [] }],
    });
  });

  it("lists search lists and timetable previews", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "Search and preview" },
      {
        role: "assistant",
        toolCalls: [
          { id: "s1", function: { name: SEARCH_CATALOG_TOOL_NAME, arguments: '{"query":"CISC"}' } },
          {
            id: "p1",
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: '{"catalog":{"mode":"browse","resultSetId":"s1"}}',
            },
          },
          { id: "t1", function: { name: PREVIEW_TIMETABLE_TOOL_NAME, arguments: "{}" } },
        ],
      },
      {
        role: "tool",
        toolCallId: "s1",
        content: JSON.stringify({
          type: "course",
          page: 1,
          hasMore: false,
          totalCount: 12,
          results: [
            {
              courseCode: "CISC1001",
              titleEn: "Intro",
              titleZh: null,
              faculty: null,
              department: null,
              credits: "3",
              isOffered: true,
              aka: [],
              url: `${SITE_URL}/course/CISC1001`,
            },
          ],
        }),
      },
      {
        role: "tool",
        toolCallId: "t1",
        content: JSON.stringify({
          status: "ready",
          kind: "saved",
          plan: { name: "Main", year: 2026, sem: 1 },
          term: "2026-27 Sem 1",
          version: "v1",
          focusDay: "MON",
          sections: [],
          replaced: [],
          partial: [],
          facts: { conflicts: [], unscheduled: [], complete: true },
        }),
      },
    ];
    expect(JSON.parse(summarizeVisibleBlocks(messages))).toEqual({
      latestTurn: 1,
      turns: [
        {
          turn: 1,
          blocks: [
            { kind: "course_list", count: 12 },
            { kind: "timetable_preview", preview: "saved" },
          ],
        },
      ],
    });
  });

  it("keeps text-only turns as empty block lists so the model knows nothing was shown", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "What is registration?" },
      { role: "assistant", content: "Registration opens next week." },
    ];
    expect(JSON.parse(summarizeVisibleBlocks(messages))).toEqual({
      latestTurn: 1,
      turns: [{ turn: 1, blocks: [] }],
    });
  });

  it("stays under 900 characters by dropping the oldest turns", () => {
    const messages: DiscussedMessage[] = [];
    for (let turn = 1; turn <= 6; turn += 1) {
      messages.push({ role: "user", content: `Turn ${turn}` });
      const callId = `g${turn}`;
      messages.push({
        role: "assistant",
        toolCalls: [
          { id: callId, function: { name: GET_COURSE_TOOL_NAME, arguments: `{"code":"CISC${turn}001"}` } },
          {
            id: `p${turn}`,
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: `{"show":[{"component":"course_detail","course":"CISC${turn}001"}]}`,
            },
          },
        ],
      });
      messages.push({ role: "tool", toolCallId: callId, content: coursePayload(`CISC${turn}001`) });
    }

    const serialized = summarizeVisibleBlocks(messages);
    expect(serialized.length).toBeLessThanOrEqual(MAX_VISIBLE_BLOCKS_CONTEXT_CHARS);
    const parsed = JSON.parse(serialized) as { latestTurn: number; turns: Array<{ turn: number }> };
    expect(parsed.latestTurn).toBe(6);
    expect(parsed.turns.length).toBeLessThan(6);
    expect(parsed.turns[0]?.turn).toBeGreaterThan(parsed.turns.at(-1)?.turn ?? 0);
  });
});
