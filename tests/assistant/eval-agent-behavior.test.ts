import { describe, expect, it } from "vitest";

import type { ToolCallRecord, TurnTrace } from "@/evals/assistant/grade";
import {
  gradeAgentBehavior,
  type AgentBehaviorExpect,
} from "@/evals/assistant/agent-behavior-grade";

function present(args: Record<string, unknown>, result: Record<string, unknown>): ToolCallRecord {
  return { name: "present_response", args, result: JSON.stringify(result) };
}

function trace(reply: string, toolCalls: ToolCallRecord[]): TurnTrace {
  return {
    caseId: "test",
    repeat: 0,
    turn: 0,
    message: "test",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls,
    runs: [],
    reply,
    ms: 0,
    runCapHit: false,
  };
}

describe("gradeAgentBehavior", () => {
  it("flags a false card-above claim when no detail or section card is planned", () => {
    const graded = gradeAgentBehavior(
      trace("The course details are shown above.", [{ name: "get_course", args: { code: "GELH1000" } }]),
      { card: "none" },
    );
    expect(graded.checks.falseCardClaim).toBe(false);
    expect(graded.pass).toBe(false);
  });

  it("allows a card-above claim when a course detail card is planned for the turn", () => {
    const graded = gradeAgentBehavior(
      trace("See the card above for the full picture.", [
        { name: "get_course", args: { code: "GELH1000" }, result: courseJson("GELH1000") },
        present(
          { show: [{ component: "course_detail", course: "GELH1000" }] },
          {
            status: "requested",
            items: [{ component: "course_detail", course: "GELH1000", eligibility: "ready" }],
          },
        ),
      ]),
      { card: "detail" },
    );
    expect(graded.checks.falseCardClaim).toBe(true);
    expect(graded.checks.card).toBe(true);
    expect(graded.pass).toBe(true);
  });

  it("grades card none, detail, sections, and any from synthetic traces", () => {
    const lookupOnly = gradeAgentBehavior(
      trace("GEST1004 is worth 3 credits.", [{ name: "get_course", args: { code: "GEST1004" } }]),
      { card: "none" },
    );
    expect(lookupOnly.checks.card).toBe(true);

    const detail = gradeAgentBehavior(
      trace("Here is a deeper look.", [
        { name: "get_course", args: { code: "GELH1000" }, result: courseJson("GELH1000") },
        present(
          { show: [{ component: "course_detail", course: "GELH1000" }] },
          {
            status: "requested",
            items: [{ component: "course_detail", course: "GELH1000", eligibility: "ready" }],
          },
        ),
      ]),
      { card: "detail" },
    );
    expect(detail.checks.card).toBe(true);

    const sections = gradeAgentBehavior(
      trace("Section times are below.", [
        {
          name: "get_course_sections",
          args: { code: "GELH1000", instructor: "LEE MEI LING" },
          result: sectionsJson("GELH1000", "LEE MEI LING"),
        },
        present(
          { show: [{ component: "course_sections", course: "GELH1000" }] },
          {
            status: "requested",
            items: [{ component: "course_sections", course: "GELH1000", eligibility: "ready" }],
          },
        ),
      ]),
      { card: "sections" },
    );
    expect(sections.checks.card).toBe(true);
    expect(sections.checks.falseCardClaim).toBe(true);

    const anyCard = gradeAgentBehavior(
      trace("Summary.", [
        { name: "get_course", args: { code: "GELH1000" }, result: courseJson("GELH1000") },
        present(
          { show: [{ component: "course_detail", course: "GELH1000" }] },
          {
            status: "requested",
            items: [{ component: "course_detail", course: "GELH1000", eligibility: "ready" }],
          },
        ),
      ]),
      { card: "any" },
    );
    expect(anyCard.checks.card).toBe(true);
  });

  it("checks required and forbidden tools, mention patterns, and forbid patterns", () => {
    const wanted: AgentBehaviorExpect = {
      requiredTools: ["get_course"],
      forbiddenTools: ["get_course_reviews"],
      card: "none",
      mention: [/\d+ reviews?/],
      forbid: [/CHAN TAI MAN[^.]{0,60}easier/i],
    };
    const pass = gradeAgentBehavior(
      trace("LEE MEI LING has 31 reviews and looks easier on ratings.", [
        { name: "get_course", args: { code: "GELH1000" } },
      ]),
      wanted,
    );
    expect(pass.checks.tools).toBe(true);
    expect(pass.checks.mention).toBe(true);
    expect(pass.checks.forbid).toBe(true);
    expect(pass.pass).toBe(true);

    const failForbid = gradeAgentBehavior(
      trace("CHAN TAI MAN is easier than the others.", [{ name: "get_course", args: { code: "GELH1000" } }]),
      wanted,
    );
    expect(failForbid.checks.forbid).toBe(false);
    expect(failForbid.pass).toBe(false);
  });
});

function courseJson(code: string): string {
  return JSON.stringify({
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
}

function sectionsJson(code: string, instructor: string): string {
  return JSON.stringify({
    courseCode: code,
    instructor,
    courseUrl: `https://umeh.top/course/${code}`,
    sectionDataComplete: true,
    term: { year: 2026, sem: 1 },
    sections: [
      {
        section: "001",
        schedules: [{ weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E11-1001" }],
        courseUrl: `https://umeh.top/course/${code}`,
      },
    ],
  });
}
