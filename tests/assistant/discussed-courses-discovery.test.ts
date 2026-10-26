import { describe, expect, it } from "vitest";

import { courseReferentFromRun } from "@/lib/assistant/course-referent";
import { DISCUSSED_COURSES_CONTEXT_DESCRIPTION, summarizeDiscussedCourses } from "@/lib/assistant/discussed-courses";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { PRESENT_RESPONSE_TOOL_NAME } from "@/lib/assistant/presentation";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";

describe("discussed courses with discovery-only recommendations", () => {
  it("keeps present_response order for a cross-turn ordinal follow-up", () => {
    const messages = [
      { role: "user", content: "Find GE courses that fit my timetable." },
      {
        role: "assistant",
        toolCalls: [
          {
            id: "d1",
            function: {
              name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
              arguments: JSON.stringify({ scope: { courseType: "GE" } }),
            },
          },
          {
            id: "p1",
            function: {
              name: PRESENT_RESPONSE_TOOL_NAME,
              arguments: JSON.stringify({
                recommendations: { courses: ["GEST1006", "GESB1013"] },
              }),
            },
          },
        ],
      },
      { role: "tool", toolCallId: "d1", content: discoverTwoCandidateResult("v1") },
      { role: "tool", toolCallId: "p1", content: JSON.stringify({ status: "ok" }) },
      { role: "user", content: "tell me more about the second one" },
    ];

    const discussedValue = summarizeDiscussedCourses(messages);
    const referent = courseReferentFromRun({
      context: [{ description: DISCUSSED_COURSES_CONTEXT_DESCRIPTION, value: discussedValue }],
      messages,
    });

    expect(referent).toEqual({
      kind: "ordinal",
      courseCode: "GESB1013",
      position: 2,
      resultSetId: expect.stringMatching(/^rec-/),
    });
  });
});
