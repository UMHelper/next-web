import { describe, expect, it } from "vitest";

import {
  bindCourseToolArgs,
  clarificationAsk,
  courseReferentFromRun,
  resolveCourseReferent,
  COURSE_REFERENT_DESCRIPTION,
} from "@/lib/assistant/course-referent";
import { shapeConversation } from "@/lib/assistant/conversation";
import { CATALOG_RESULTS_CONTEXT_DESCRIPTION } from "@/lib/assistant/catalog-result-sets";
import { DISCUSSED_COURSES_CONTEXT_DESCRIPTION } from "@/lib/assistant/discussed-courses";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { VISIBLE_BLOCKS_CONTEXT_DESCRIPTION } from "@/lib/assistant/visible-blocks-context";
import type { PageContext } from "@/lib/assistant/page-context";

const page = (courseCode: string): PageContext => ({ page: "course", courseCode });
const offered = {
  resultSetId: "call-1",
  newest: true,
  courses: [
    { position: 1, courseCode: "APAC1000" },
    { position: 2, courseCode: "ECON1002" },
  ],
};
const allResults = {
  resultSetId: "call-1",
  newest: true,
  courses: [
    { position: 1, courseCode: "APAC1000" },
    { position: 2, courseCode: "APAC2000" },
    { position: 10, courseCode: "ECON1002" },
  ],
};

function resolve(
  latestUserText: string,
  overrides: Partial<Parameters<typeof resolveCourseReferent>[0]> = {},
) {
  return resolveCourseReferent({
    latestUserText,
    page: { page: "home" },
    resultSets: [],
    priorCourseCodes: [],
    ...overrides,
  });
}

describe("resolveCourseReferent", () => {
  it("uses the visible second course under the offered summary", () => {
    expect(resolve("Tell me about the second course in those results", { resultSets: [offered] })).toEqual({
      kind: "ordinal",
      courseCode: "ECON1002",
      position: 2,
      resultSetId: "call-1",
    });
  });

  it("uses the loaded second course when the summary is unfiltered", () => {
    expect(resolve("Tell me about the second course in those results", { resultSets: [allResults] })).toEqual({
      kind: "ordinal",
      courseCode: "APAC2000",
      position: 2,
      resultSetId: "call-1",
    });
  });

  it("does not invent a course when the visible list is empty", () => {
    expect(
      resolve("Tell me about the second course", {
        resultSets: [{ resultSetId: "call-1", newest: true, courses: [] }],
      }),
    ).toEqual({
      kind: "ambiguous",
      reason: "missing_ordinal",
      ask: "None of the visible results is in that position.",
    });
  });

  it("binds an ordinal to the newest result set", () => {
    expect(
      resolve("the second one", {
        resultSets: [
          {
            resultSetId: "call-2",
            newest: true,
            courses: [
              { position: 1, courseCode: "ACCT1000" },
              { position: 2, courseCode: "ACCT2000" },
            ],
          },
          {
            resultSetId: "call-1",
            newest: false,
            courses: [
              { position: 1, courseCode: "APAC1000" },
              { position: 2, courseCode: "APAC2000" },
            ],
          },
        ],
      }),
    ).toMatchObject({ kind: "ordinal", courseCode: "ACCT2000", resultSetId: "call-2" });
  });

  it("uses a named result set id when the message contains one", () => {
    expect(
      resolve("the second course in call-1", {
        resultSets: [
          {
            resultSetId: "call-2",
            newest: true,
            courses: [{ position: 2, courseCode: "ACCT2000" }],
          },
          allResults,
        ],
      }),
    ).toMatchObject({ resultSetId: "call-1", courseCode: "APAC2000" });
  });

  it("leaves a same-turn ordinal unresolved when no results exist yet", () => {
    expect(resolve("Search for MATH and tell me about the second course")).toEqual({ kind: "none" });
  });

  it("uses the page course for this course after another course was discussed", () => {
    expect(
      resolve("What sections does this course offer?", {
        page: page("CISC3014"),
        priorCourseCodes: ["APAC2000"],
      }),
    ).toEqual({ kind: "page", courseCode: "CISC3014" });
  });

  it("uses an explicit code instead of the page", () => {
    expect(
      resolve("What sections does APAC2000 have?", { page: page("CISC3014"), priorCourseCodes: ["CISC2001"] }),
    ).toEqual({ kind: "explicit", courseCode: "APAC2000" });
  });

  it("uses the latest prior course for its", () => {
    expect(
      resolve("When are its classes?", {
        page: page("CISC3014"),
        priorCourseCodes: ["CISC2001", "APAC2000"],
      }),
    ).toEqual({ kind: "conversation", courseCode: "APAC2000" });
  });

  it("asks when this course has no course page", () => {
    expect(resolve("What sections does this course offer?", { page: { page: "catalog" } })).toEqual({
      kind: "ambiguous",
      reason: "no_page_course",
      ask: "Which course do you mean?",
    });
  });

  it("asks when it has no prior course", () => {
    expect(resolve("When are its classes?", { page: page("CISC3014") })).toEqual({
      kind: "ambiguous",
      reason: "no_prior_course",
      ask: "Which course do you mean?",
    });
  });

  it("does not collapse this course and a named course", () => {
    expect(resolve("Compare this course with CISC2001", { page: page("CISC3014") })).toEqual({
      kind: "multiple",
      explicitCodes: ["CISC2001"],
      pageCourseCode: "CISC3014",
    });
  });

  it("binds compare this with to the page course and the named code", () => {
    expect(resolve("Compare this with CISC2003.", { page: page("CISC2001") })).toEqual({
      kind: "multiple",
      explicitCodes: ["CISC2003"],
      pageCourseCode: "CISC2001",
    });
  });

  it("resolves compare this with off-page as the named course only", () => {
    expect(resolve("Compare this with CISC2003.", { page: { page: "catalog" } })).toEqual({
      kind: "explicit",
      courseCode: "CISC2003",
    });
  });

  it("does not collapse it and a named course", () => {
    expect(resolve("Compare it with CISC2001.", { page: page("CISC3014"), priorCourseCodes: ["APAC2000"] })).toEqual({
      kind: "multiple",
      explicitCodes: ["CISC2001"],
    });
  });

  it("asks when two ordinals appear", () => {
    expect(resolve("Compare the second course and the fourth course", { resultSets: [offered] })).toMatchObject({
      kind: "ambiguous",
      reason: "multiple",
    });
  });

  it("resolves the Chinese deictic and ordinal cues", () => {
    expect(resolve("这门课有哪些班次？", { page: page("CISC3014"), priorCourseCodes: ["APAC2000"] })).toEqual({
      kind: "page",
      courseCode: "CISC3014",
    });
    expect(resolve("第二门课呢", { resultSets: [offered] })).toMatchObject({
      kind: "ordinal",
      courseCode: "ECON1002",
    });
  });

  it("ignores messages that do not refer to a course", () => {
    expect(resolve("Search for MATH courses", { page: page("CISC3014"), resultSets: [offered] })).toEqual({
      kind: "none",
    });
  });

  it("binds a follow-up ordinal to discussed courses when newer than catalog", () => {
    expect(
      resolve("Tell me more about the first one", {
        discussed: { id: "d1", order: ["CISC2001", "CISC2003"], newerThanCatalog: true },
        resultSets: [offered],
      }),
    ).toEqual({
      kind: "ordinal",
      courseCode: "CISC2001",
      position: 1,
      resultSetId: "d1",
    });
  });

  it("prefers catalog ordinals when discussed courses are not newer", () => {
    expect(
      resolve("Tell me more about the first one", {
        discussed: { id: "d1", order: ["CISC2001", "CISC2003"], newerThanCatalog: false },
        resultSets: [offered],
      }),
    ).toMatchObject({ kind: "ordinal", courseCode: "APAC1000", resultSetId: "call-1" });
  });
});

function visibleRecommendations(
  turns: Array<{ turn: number; blocks: Array<{ kind: string; courses?: string[] }> }>,
): string {
  return JSON.stringify({ latestTurn: turns[0]?.turn ?? 0, turns });
}

describe("courseReferentFromRun discovery recommendations", () => {
  it("binds the second option to the second displayed recommendation", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find an easy GEST option that does not start in the morning." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me more about the second option and who teaches it." },
      ],
    });
    expect(referent).toEqual({
      kind: "ordinal",
      courseCode: "GESB1013",
      position: 2,
      resultSetId: "visible-recommendations-1",
    });
    expect(bindCourseToolArgs(referent, "get_course", { code: "GEST1006" })).toEqual({
      action: "rewrite",
      args: { code: "GESB1013" },
    });
  });

  it("uses displayed order even when it differs from discovery candidate order", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GESB1013", "GEST1006"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me about the second option." },
      ],
    });
    expect(referent).toMatchObject({ kind: "ordinal", courseCode: "GEST1006", position: 2 });
  });

  it("uses the newest displayed recommendation list", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 2, blocks: [{ kind: "recommendations", courses: ["ACCT1000", "ACCT2000"] }] },
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["APAC1000", "APAC2000"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find options." },
        { role: "assistant", content: "First list." },
        { role: "user", content: "Find more options." },
        { role: "assistant", content: "Second list." },
        { role: "user", content: "Tell me about the second option." },
      ],
    });
    expect(referent).toMatchObject({ kind: "ordinal", courseCode: "ACCT2000", position: 2 });
  });

  it("binds the last displayed recommendation", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me about the last recommendation." },
      ],
    });
    expect(referent).toMatchObject({ kind: "ordinal", courseCode: "GESB1013", position: 2 });
  });

  it("lets an explicit code override a conversational recommendation reference", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "What about GEST1005?" },
      ],
    });
    expect(referent).toEqual({ kind: "explicit", courseCode: "GEST1005" });
  });

  it("keeps a fresh page course ahead of an older shown list", () => {
    const referent = courseReferentFromRun({
      context: [
        { description: PAGE_CONTEXT_DESCRIPTION, value: JSON.stringify(page("CISC3014")) },
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "What sections does this course offer?" },
      ],
    });
    expect(referent).toEqual({ kind: "page", courseCode: "CISC3014" });
  });

  it("binds the phrase 'second recommendation' as an ordinal", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me about the second recommendation." },
      ],
    });
    expect(referent).toMatchObject({ kind: "ordinal", courseCode: "GESB1013", position: 2 });
  });

  it("keeps a later course lookup ahead of an older recommendation list for its", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 1, blocks: [{ kind: "recommendations", courses: ["GESB1013", "GEST1006"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me about GEST1006." },
        {
          role: "assistant",
          toolCalls: [
            { id: "g1", function: { name: "get_course", arguments: JSON.stringify({ code: "GEST1006" }) } },
          ],
        },
        { role: "tool", toolCallId: "g1", content: JSON.stringify({ course: { courseCode: "GEST1006" } }) },
        { role: "user", content: "When are its classes?" },
      ],
    });
    expect(referent).toEqual({ kind: "conversation", courseCode: "GEST1006" });
  });

  it("does not treat an unpresented discovery result as a visible recommendation list", () => {
    const referent = courseReferentFromRun({
      messages: [
        { role: "user", content: "Find an easy GEST option." },
        {
          role: "assistant",
          toolCalls: [
            { id: "d1", function: { name: "discover_course_candidates", arguments: "{}" } },
          ],
        },
        {
          role: "tool",
          toolCallId: "d1",
          content: JSON.stringify({ candidates: [{ courseCode: "GEST1006" }, { courseCode: "GESB1013" }] }),
        },
        { role: "user", content: "Tell me more about the second option." },
      ],
    });
    expect(referent.kind).not.toBe("ordinal");
  });

  it("does not fall through to a stale catalog list when the newest list is recommendations", () => {
    const referent = courseReferentFromRun({
      context: [
        {
          description: CATALOG_RESULTS_CONTEXT_DESCRIPTION,
          value: JSON.stringify({ resultSets: [offered] }),
        },
        {
          description: VISIBLE_BLOCKS_CONTEXT_DESCRIPTION,
          value: visibleRecommendations([
            { turn: 2, blocks: [{ kind: "recommendations", courses: ["GEST1006", "GESB1013"] }] },
          ]),
        },
      ],
      messages: [
        { role: "user", content: "Find GE options." },
        { role: "assistant", content: "Here are two options." },
        { role: "user", content: "Tell me about the second option." },
      ],
    });
    expect(referent).toMatchObject({ kind: "ordinal", courseCode: "GESB1013", resultSetId: "visible-recommendations-2" });
  });
});

describe("courseReferentFromRun", () => {
  it("reads page context, visible positions, and prior tool results", () => {
    const referent = courseReferentFromRun({
      context: [
        { description: PAGE_CONTEXT_DESCRIPTION, value: JSON.stringify(page("CISC3014")) },
        {
          description: CATALOG_RESULTS_CONTEXT_DESCRIPTION,
          value: JSON.stringify({ resultSets: [offered] }),
        },
      ],
      messages: [
        { role: "user", content: "Tell me about APAC2000" },
        {
          role: "assistant",
          toolCalls: [
            { id: "g1", function: { name: "get_course", arguments: JSON.stringify({ code: "APAC2000" }) } },
          ],
        },
        { role: "tool", toolCallId: "g1", content: JSON.stringify({ course: { courseCode: "APAC2000" } }) },
        { role: "user", content: "When are its classes?" },
      ],
    });
    expect(referent).toEqual({ kind: "conversation", courseCode: "APAC2000" });
    expect(COURSE_REFERENT_DESCRIPTION.length).toBeGreaterThan(0);
  });

  it("keeps the corrected course after shapeConversation shortens tool results", () => {
    const longTail = "x".repeat(250);
    const toolPayload = JSON.stringify({
      course: { courseCode: "ECON1002", title: longTail },
    });
    const messages = shapeConversation(
      [
        { role: "user", content: "the second course" },
        {
          role: "assistant",
          toolCalls: [
            { id: "g1", function: { name: "get_course", arguments: JSON.stringify({ code: "MATH1002" }) } },
          ],
        },
        { role: "tool", toolCallId: "g1", content: toolPayload },
        { role: "user", content: "When are its classes?" },
      ],
      8,
    );
    expect(courseReferentFromRun({ messages })).toEqual({
      kind: "conversation",
      courseCode: "ECON1002",
    });
  });

  it("prefers a corrected tool result over the model's original arguments", () => {
    const referent = courseReferentFromRun({
      messages: [
        { role: "user", content: "the second course" },
        {
          role: "assistant",
          toolCalls: [
            { id: "g1", function: { name: "get_course", arguments: JSON.stringify({ code: "APAC2000" }) } },
          ],
        },
        { role: "tool", toolCallId: "g1", content: JSON.stringify({ course: { courseCode: "ECON1002" } }) },
        { role: "user", content: "When are its classes?" },
      ],
    });
    expect(referent).toEqual({ kind: "conversation", courseCode: "ECON1002" });
  });

  it("uses discussed courses for ordinals when catalog context is absent", () => {
    const discussedValue = JSON.stringify({
      active: { id: "turn-0", order: ["CISC2001", "CISC2003"], newerThanCatalog: true },
      turns: [{ id: "turn-0", order: ["CISC2001", "CISC2003"] }],
    });
    const referent = courseReferentFromRun({
      context: [{ description: DISCUSSED_COURSES_CONTEXT_DESCRIPTION, value: discussedValue }],
      messages: [
        { role: "user", content: "CISC2001 vs CISC2003?" },
        {
          role: "assistant",
          toolCalls: [
            { id: "g1", function: { name: "get_course", arguments: JSON.stringify({ code: "CISC2001" }) } },
            { id: "g2", function: { name: "get_course", arguments: JSON.stringify({ code: "CISC2003" }) } },
          ],
        },
        { role: "tool", toolCallId: "g1", content: JSON.stringify({ course: { courseCode: "CISC2001" } }) },
        { role: "tool", toolCallId: "g2", content: JSON.stringify({ course: { courseCode: "CISC2003" } }) },
        { role: "user", content: "the first one" },
      ],
    });
    expect(referent).toEqual({
      kind: "ordinal",
      courseCode: "CISC2001",
      position: 1,
      resultSetId: "turn-0",
    });
  });

  it("does not treat a search row as the prior course", () => {
    const referent = courseReferentFromRun({
      messages: [
        { role: "user", content: "Search for MATH" },
        {
          role: "assistant",
          toolCalls: [{ id: "s1", function: { name: "search_catalog", arguments: "{}" } }],
        },
        {
          role: "tool",
          toolCallId: "s1",
          content: JSON.stringify({ results: [{ courseCode: "APAC2000" }] }),
        },
        { role: "user", content: "When are its classes?" },
      ],
    });
    expect(referent).toMatchObject({ kind: "ambiguous", reason: "no_prior_course" });
  });
});

describe("bindCourseToolArgs", () => {
  it("rewrites a stale code for a single page referent", () => {
    expect(bindCourseToolArgs({ kind: "page", courseCode: "CISC3014" }, "get_course", { code: "APAC2000" })).toEqual({
      action: "rewrite",
      args: { code: "CISC3014" },
    });
  });

  it("rewrites the page code when the message named a course", () => {
    expect(
      bindCourseToolArgs({ kind: "explicit", courseCode: "APAC2000" }, "get_course_sections", {
        code: "CISC3014",
        instructor: "CHAN TAI MAN",
      }),
    ).toEqual({
      action: "rewrite",
      args: { code: "APAC2000", instructor: "CHAN TAI MAN" },
    });
  });

  it("leaves a matching code and non-course tools alone", () => {
    expect(bindCourseToolArgs({ kind: "page", courseCode: "CISC3014" }, "get_course", { code: "cisc3014" })).toEqual({
      action: "passthrough",
      args: { code: "cisc3014" },
    });
    expect(bindCourseToolArgs({ kind: "page", courseCode: "CISC3014" }, "get_instructor", { name: "CHAN" })).toEqual({
      action: "passthrough",
      args: { name: "CHAN" },
    });
  });

  it("does not rewrite a comparison", () => {
    const referent = { kind: "multiple" as const, explicitCodes: ["CISC2001"], pageCourseCode: "CISC3014" };
    expect(bindCourseToolArgs(referent, "get_course", { code: "CISC2001" })).toEqual({
      action: "passthrough",
      args: { code: "CISC2001" },
    });
    expect(bindCourseToolArgs(referent, "get_course", { code: "CISC3014" })).toEqual({
      action: "passthrough",
      args: { code: "CISC3014" },
    });
    expect(bindCourseToolArgs(referent, "get_course", { code: "APAC2000" })).toEqual({
      action: "clarify",
      result: { status: "needs_clarification", ask: "Which course do you mean?" },
    });
    expect(bindCourseToolArgs(referent, "present_response", { show: [] })).toEqual({
      action: "passthrough",
      args: { show: [] },
    });
  });

  it("does not call through when the referent is ambiguous", () => {
    expect(
      bindCourseToolArgs(
        { kind: "ambiguous", reason: "no_page_course", ask: "Which course do you mean?" },
        "get_course_reviews",
        { code: "APAC2000" },
      ),
    ).toEqual({
      action: "clarify",
      result: { status: "needs_clarification", ask: "Which course do you mean?" },
    });
  });

  it("reads a clarification payload", () => {
    expect(clarificationAsk(JSON.stringify({ status: "needs_clarification", ask: "Which course do you mean?" }))).toBe(
      "Which course do you mean?",
    );
    expect(clarificationAsk("{\"course\":{}}")).toBeNull();
  });
});
