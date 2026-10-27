import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CASE_SET_VERSION,
  DISCOVERY_CASE_SETS,
  buildDiscoveryEvalPayload,
  discoveryEvalStamp,
  discoveryPassThreshold,
  resolveDiscoveryCaseSetId,
} from "@/evals/assistant/discovery-case-sets";
import {
  DISCOVERY_CASES,
  DISCOVERY_CASES_V1,
  DISCOVERY_CASES_V2,
} from "@/evals/assistant/discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE } from "@/evals/assistant/discovery-fixture";
import {
  gradeDiscovery,
  summarizeDiscovery,
  type DiscoveryExpect,
  type DiscoveryGrade,
} from "@/evals/assistant/discovery-grade";
import {
  DISCOVERY_HOLDOUT_CASES,
  DISCOVERY_HOLDOUT_CASES_V1,
} from "@/evals/assistant/discovery-holdout-cases";
import { FROZEN_SHADOW_V1, SHADOW_CASES_V1 } from "@/evals/assistant/discovery-shadow-cases";
import { FROZEN_SHADOW_V2, SHADOW_CASES_V2 } from "@/evals/assistant/discovery-shadow2-cases";
import { EFFICIENCY_CASES_V1, FROZEN_EFFICIENCY_V1 } from "@/evals/assistant/discovery-efficiency-cases";
import * as discoveryEvalLib from "@/evals/assistant/discovery-eval-lib";
import type { ToolCallRecord, TurnTrace } from "@/evals/assistant/grade";
import * as harness from "@/evals/assistant/harness";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { withTimeout } from "@/lib/assistant/model";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";

vi.mock("server-only", () => ({}));

const probe = vi.hoisted(() => ({
  script: "passthrough" as "passthrough" | "hang-first" | "immediate",
  events: [] as string[],
  runs: 0,
}));

vi.mock("@/lib/assistant/agent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/assistant/agent")>("@/lib/assistant/agent");
  return {
    ...actual,
    createAssistantAgent: (config: Parameters<typeof actual.createAssistantAgent>[0], signal?: AbortSignal) => {
      if (probe.script === "passthrough") return actual.createAssistantAgent(config, signal);
      return {
        setMessages() {},
        async runAgent() {
          const index = probe.runs++;
          if (probe.script === "hang-first" && index === 0) {
            await new Promise<never>((_resolve, reject) => {
              const settle = () => {
                setTimeout(() => {
                  probe.events.push("hang-settled");
                  const reason = signal?.reason;
                  reject(reason instanceof Error ? reason : new DOMException("aborted", "AbortError"));
                }, 50);
              };
              if (!signal) return;
              if (signal.aborted) settle();
              else signal.addEventListener("abort", settle, { once: true });
            });
          }
          if (index > 0) probe.events.push("next-case");
          return {
            newMessages: [
              {
                id: `assistant-${index}`,
                role: "assistant" as const,
                content: "CISC1001 CISC1002 CISC1003",
                toolCalls: [
                  {
                    id: `present-${index}`,
                    type: "function" as const,
                    function: { name: "present_response", arguments: "{}" },
                  },
                  {
                    id: `search-${index}`,
                    type: "function" as const,
                    function: { name: "search_catalog", arguments: "{\"query\":\"CIS\"}" },
                  },
                  {
                    id: `discover-${index}`,
                    type: "function" as const,
                    function: { name: "discover_course_candidates", arguments: "{\"scope\":{\"codePrefix\":\"CISC\"}}" },
                  },
                ],
              },
            ],
          };
        },
      } as unknown as ReturnType<typeof actual.createAssistantAgent>;
    },
  };
});

const FROZEN_HOLDOUT_V1 = [
  {
    id: "holdout-easy_ge",
    messages: ["Any chill GEST classes that aren't early mornings?"],
  },
  {
    id: "holdout-history_ge",
    messages: ["Got a GE about Macau history or Chinese heritage?"],
  },
  {
    id: "holdout-first_year_cs",
    messages: ["I'm a year-one student—what CIS intro courses are offered?"],
  },
  {
    id: "holdout-constraints_zh",
    messages: ["幫我搵通識課：不要十點前上堂、不要星期五，同我時間表唔好衝突。"],
  },
  {
    id: "holdout-no_midterm",
    messages: ["I'd rather skip courses with midterms—any easy GEST picks?"],
  },
  {
    id: "holdout-fill_credits_zh",
    messages: ["我还差学分，有没有三门学分的课可以推荐？"],
  },
] as const;

function invalidWindowExpect() {
  const turn = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "no_candidates_invalid_window")?.turns[0];
  if (turn === undefined) {
    throw new Error("no_candidates_invalid_window turn missing");
  }
  return turn.expect;
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

function discoveryCall(result: string): ToolCallRecord {
  return {
    name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
    args: { scope: { codePrefix: "GEST" } },
    result,
  };
}

function conflictCall(result: string, courseCode = "GEST1005"): ToolCallRecord {
  return {
    name: "check_plan_conflicts",
    args: { courseCode },
    result,
  };
}

function conflictResult(options: {
  courseCode: string;
  plannerVersion?: string;
  planComplete?: boolean;
  sectionListComplete?: boolean;
  sections: Array<{ section: string; fit: "verified_no_clash" | "confirmed_clash" | "incomplete" }>;
}): string {
  return JSON.stringify({
    status: "checked",
    courseCode: options.courseCode,
    instructor: "CHEUNG WAI",
    plan: { name: "Plan", term: "2026/2027 AY Sem 1" },
    planComplete: options.planComplete ?? true,
    unscheduled: [],
    sectionListComplete: options.sectionListComplete ?? true,
    plannerVersion: options.plannerVersion ?? "v-test",
    sections: options.sections.map((section) => ({
      section: section.section,
      meetings: ["TUE 15:00-16:15"],
      conflicts: [],
      complete: section.fit !== "incomplete",
      fit: section.fit,
    })),
  });
}

function discoverCandidates(
  candidates: Array<{
    courseCode: string;
    section?: string;
    fit?: string;
    otherSections?: Array<{ section: string; fit: string }>;
  }>,
  options?: {
    planComplete?: boolean;
    truncated?: boolean;
    plannerVersion?: string;
    mutualClashes?: Array<[string, string]>;
    compaction?: { truncated: true; dropped: string[] };
  },
): string {
  const timetable: { status: "ready"; plannerVersion: string; planComplete?: boolean } = {
    status: "ready",
    plannerVersion: options?.plannerVersion ?? "v-test",
  };
  if (options?.planComplete !== undefined) timetable.planComplete = options.planComplete;
  return JSON.stringify({
    status: "ok",
    term: { year: 2026, sem: 1, label: "2026/2027 AY Sem 1" },
    timetable,
    examined: {
      courses: candidates.length,
      sections: candidates.length,
      totalMatchingCourses: candidates.length,
      truncated: options?.truncated ?? false,
    },
    excluded: {
      alreadyInPlan: 0,
      excludedCodes: 0,
      noListedSections: 0,
      required: { startAfter: 0, endBefore: 0, avoidDays: 0, avoidWindows: 0, noClash: 0 },
    },
    notApplied: [],
    candidates: candidates.map((candidate, index) => ({
      rank: index + 1,
      courseCode: candidate.courseCode,
      titleEn: "Sample",
      titleZh: null,
      credits: 3,
      courseType: "GE",
      suggestedYear: 1,
      section: candidate.section ?? "001",
      instructors: [],
      meetings: ["TUE 11:30-12:45"],
      meetingsComplete: true,
      fit: candidate.fit ?? "verified_no_clash",
      matched: [],
      tradeoffs: [],
      signals: {},
      score: 1,
      otherSections: (candidate.otherSections ?? []).map((other) => ({
        section: other.section,
        meetings: ["MON 09:00-10:15"],
        fit: other.fit,
      })),
    })),
    unverified: [],
    noListedSections: [],
    mutualClashes: options?.mutualClashes ?? [],
    ranking: "test",
    notes: [],
    ...(options?.compaction ? { compaction: options.compaction } : {}),
  });
}

describe("gradeDiscovery", () => {
  it("flags a false fit claim when discover fit is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { codePrefix: "GEST" } },
          result: discoverTwoCandidateResult("v-test", "incomplete"),
        },
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level no-clash claim when another discovery section is unchecked", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [
        discoveryCall(discoverTwoCandidateResult("v-test", "verified_no_clash")),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("allows a section-level no-clash claim when that discovery section is verified", () => {
    const graded = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [
        discoveryCall(discoverTwoCandidateResult("v-test", "verified_no_clash")),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it.each([
    "GEST1006 §002 is confirmed conflict-free.",
    "GEST1006 §2 is confirmed conflict-free.",
    "GEST1006 #002 is confirmed conflict-free.",
    "GEST1006 Section 2 is confirmed conflict-free.",
    "GEST1006 section 002 is confirmed conflict-free.",
    "GEST1006 sec. 2 has no clash with your timetable.",
    "GEST1006-2 has no clash with your timetable.",
    "So of the options discussed, only GEST1006 §002 is confirmed conflict-free.",
  ])("supports a verified section written as %s", (reply) => {
    const result = discoverCandidates([
      {
        courseCode: "GEST1006",
        section: "002",
        fit: "verified_no_clash",
        otherSections: [{ section: "001", fit: "confirmed_clash" }],
      },
    ], { planComplete: true });
    const graded = gradeDiscovery(trace(reply, [discoveryCall(result)]), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it.each([
    "GEST1006 §003 is confirmed conflict-free.",
    "GEST1006 Section 3 is confirmed conflict-free.",
  ])("flags a section with no evidence written as %s", (reply) => {
    const result = discoverCandidates([
      {
        courseCode: "GEST1006",
        section: "002",
        fit: "verified_no_clash",
        otherSections: [{ section: "001", fit: "confirmed_clash" }],
      },
    ], { planComplete: true });
    const graded = gradeDiscovery(trace(reply, [discoveryCall(result)]), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("keeps a saved-plan reference out of the subject when a semicolon starts a new clause", () => {
    const result = discoverCandidates([
      {
        courseCode: "GEST1006",
        section: "002",
        fit: "verified_no_clash",
        otherSections: [{ section: "001", fit: "confirmed_clash" }],
      },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace(
        "§001 Mon & Thu 13:30–14:45 clashes with GEGA1000-007; §002 Tue & Thu 11:30–12:45 is verified conflict-free, but is late morning.",
        [discoveryCall(result)],
      ),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("attributes a genuine claim after a saved-plan reference instead of the reference", () => {
    const result = discoverCandidates([
      { courseCode: "GEST1005", section: "001", fit: "confirmed_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace("GEGA1000-007 clashes with GEST1005, and GEST1006 is verified conflict-free.", [
        discoveryCall(result),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("does not flag the saved-plan reference when the genuine claim is supported", () => {
    const result = discoverCandidates([
      { courseCode: "GEST1005", section: "001", fit: "confirmed_clash" },
      { courseCode: "GEST1006", section: "002", fit: "verified_no_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace("GEGA1000-007 clashes with GEST1005, and GEST1006 is verified conflict-free.", [
        discoveryCall(result),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("splits Chinese semicolon clauses before attributing a fit claim", () => {
    const result = discoverCandidates([
      { courseCode: "GEST1006", section: "002", fit: "verified_no_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace("GEST1006 不冲突；GEST1007 不冲突。", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1007"]);
    expect(graded.pass).toBe(false);
  });

  it("keeps a saved-plan reference out of the subject when a comma clause starts", () => {
    const result = discoverCandidates([
      {
        courseCode: "GEST1006",
        section: "002",
        fit: "verified_no_clash",
        otherSections: [{ section: "001", fit: "confirmed_clash" }],
      },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace(
        'Your plan currently holds only GEGA1000-007, so "no clash" here means no clash with that one section.',
        [discoveryCall(result)],
      ),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("does not attribute a clause-final no-clash claim to the course it was compared with", () => {
    const result = discoverCandidates([
      { courseCode: "GESB1015", section: "001", fit: "verified_no_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace(
        "GESB1015 runs TUE 13:00–14:15, which is the same slot as your GEGA1000 but on a free day, so no clash.",
        [discoveryCall(result)],
      ),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("attributes a genuine claim after a comma clause break to its own course", () => {
    const result = discoverCandidates([
      { courseCode: "GEST1006", section: "002", fit: "verified_no_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace("GEGA1000-007 is in your plan, so GEST1007 has no clash.", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1007"]);
    expect(graded.pass).toBe(false);
  });

  it("allows a two-code conjunction claim when both sections are verified", () => {
    const result = discoverCandidates([
      { courseCode: "GEST1006", section: "002", fit: "verified_no_clash" },
      { courseCode: "GEST1005", section: "001", fit: "verified_no_clash" },
    ], { planComplete: true });
    const graded = gradeDiscovery(
      trace("GEST1006 §002 and GEST1005 §001 are conflict-free.", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("allows a course-level no-clash claim for one complete discovery section", () => {
    const graded = gradeDiscovery(
      trace("GESB1013 has no clash with your timetable.", [
        discoveryCall(discoverTwoCandidateResult("v-test", "verified_no_clash")),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("marks discovery required when discover_course_candidates is missing", () => {
    const graded = gradeDiscovery(trace("Here are some ideas.", []), { discovery: "required" });
    expect(graded.checks.discovery).toBe(false);
    expect(graded.pass).toBe(false);
  });

  it("does not count an unavailable-tool attempt as discovery use", () => {
    const graded = gradeDiscovery(
      trace("Trying.", [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { courseType: "GE" } },
          result: "Error: Model tried to call unavailable tool",
        },
      ]),
      { discovery: "required" },
    );
    expect(graded.checks.discovery).toBe(false);
  });

  it("excludes presentation from the call count while leaving the raw trace intact", () => {
    const reviewCalls: ToolCallRecord[] = ["GEST1006", "GEST1005", "GEST1008"].map((courseCode) => ({
      name: "get_course_reviews",
      args: { courseCode },
      result: JSON.stringify({ courseCode, reviews: [] }),
    }));
    const withPresentation: ToolCallRecord[] = [
      discoveryCall(discoverTwoCandidateResult("v-test")),
      ...reviewCalls,
      { name: "present_response", args: {}, result: JSON.stringify({ ok: true }) },
    ];
    const graded = gradeDiscovery(trace("Recommendations ready.", withPresentation), {
      discovery: "required",
      maxToolCalls: 3,
    });
    expect(withPresentation).toHaveLength(5);
    expect(graded.toolCalls).toBe(4);
    expect(graded.checks.maxToolCalls).toBe(false);

    const withoutPresentation = gradeDiscovery(
      trace("Recommendations ready.", [discoveryCall(discoverTwoCandidateResult("v-test")), ...reviewCalls]),
      { discovery: "required", maxToolCalls: 3 },
    );
    expect(withoutPresentation.toolCalls).toBe(4);
    expect(withoutPresentation.checks.maxToolCalls).toBe(false);

    const withinBudget = gradeDiscovery(
      trace("Recommendations ready.", [
        discoveryCall(discoverTwoCandidateResult("v-test")),
        reviewCalls[0]!,
        reviewCalls[1]!,
      ]),
      { discovery: "required", maxToolCalls: 3 },
    );
    expect(withinBudget.toolCalls).toBe(3);
    expect(withinBudget.checks.maxToolCalls).toBe(true);
  });

  it("allows a code-only clash-free claim backed by check_plan_conflicts", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable.", [
        {
          name: "check_plan_conflicts",
          args: { courseCode: "GEST1006", section: "002" },
          result: JSON.stringify({
            status: "checked",
            courseCode: "GEST1006",
            instructor: "WONG",
            plan: { name: "Plan", term: "2026/2027 AY Sem 1" },
            planComplete: true,
            unscheduled: [],
            sectionListComplete: true,
            plannerVersion: "v-test",
            sections: [
              {
                section: "002",
                meetings: ["TUE 11:30-12:45"],
                conflicts: [],
                complete: true,
                fit: "verified_no_clash",
              },
            ],
          }),
        },
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("flags a subject code that has no tool evidence", () => {
    const graded = gradeDiscovery(trace("GEST1006 has no clash with your timetable.", []), {
      discovery: "optional",
    });
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level no-clash claim when the section is a confirmed clash", () => {
    const graded = gradeDiscovery(
      trace("GEST1005 has no clash with your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1005",
            sections: [{ section: "001", fit: "confirmed_clash" }],
          }),
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1005"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level no-clash claim when listed sections disagree", () => {
    const graded = gradeDiscovery(
      trace("GEST1005 has no clash with your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1005",
            sections: [
              { section: "001", fit: "verified_no_clash" },
              { section: "002", fit: "confirmed_clash" },
            ],
          }),
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1005"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a no-clash claim when the section fit is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1006",
            sections: [{ section: "002", fit: "incomplete" }],
          }),
          "GEST1006",
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a no-clash claim when the tool planner version is stale", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1006",
            plannerVersion: "v-tool",
            sections: [{ section: "002", fit: "verified_no_clash" }],
          }),
          "GEST1006",
        ),
      ]),
      { discovery: "optional" },
      { plannerVersion: "v-current" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("does not invent staleness when the caller omits plannerVersion", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1006",
            plannerVersion: "v-tool",
            sections: [{ section: "002", fit: "verified_no_clash" }],
          }),
          "GEST1006",
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("flags a verified section when the conflict check says the plan is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1006",
            planComplete: false,
            sections: [{ section: "002", fit: "verified_no_clash" }],
          }),
          "GEST1006",
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level claim when the section listing is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1006",
            sectionListComplete: false,
            sections: [{ section: "002", fit: "verified_no_clash" }],
          }),
          "GEST1006",
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level claim when both seen sections are verified but the listing is incomplete", () => {
    const graded = gradeDiscovery(
      trace("GEST1005 has no clash with your timetable.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1005",
            sectionListComplete: false,
            sections: [
              { section: "001", fit: "verified_no_clash" },
              { section: "002", fit: "verified_no_clash" },
            ],
          }),
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1005"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a course-level discovery claim when other sections are verified but the listing is not complete", () => {
    const parsed = JSON.parse(discoverTwoCandidateResult("v-test", "verified_no_clash")) as {
      timetable: { planComplete?: boolean };
      candidates: Array<{ otherSections: Array<{ fit: string }> }>;
    };
    parsed.timetable.planComplete = true;
    parsed.candidates[0]!.otherSections[0]!.fit = "verified_no_clash";
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [discoveryCall(JSON.stringify(parsed))]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a section claim when the discovery snapshot is truncated", () => {
    const parsed = JSON.parse(discoverTwoCandidateResult("v-test", "verified_no_clash")) as {
      timetable: { planComplete?: boolean };
      examined: { truncated: boolean };
    };
    parsed.timetable.planComplete = true;
    parsed.examined.truncated = true;
    const graded = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [discoveryCall(JSON.stringify(parsed))]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a verified discovery section when the plan is not complete", () => {
    const parsed = JSON.parse(discoverTwoCandidateResult("v-test", "verified_no_clash")) as {
      timetable: { planComplete?: boolean };
    };
    parsed.timetable.planComplete = false;
    const graded = gradeDiscovery(
      trace("GESB1013-001 has no clash with your timetable.", [discoveryCall(JSON.stringify(parsed))]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GESB1013"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a saved-plan code used as the subject of a no-clash claim", () => {
    const graded = gradeDiscovery(
      trace("GEGA1000 has no clash with your timetable.", []),
      { discovery: "optional" },
      { planCodes: ["GEGA1000-007"] },
    );
    expect(graded.falseFitClaims).toEqual(["GEGA1000"]);
    expect(graded.pass).toBe(false);
  });

  it("flags a Chinese clash-free claim that has no tool evidence", () => {
    const graded = gradeDiscovery(trace("GEST1006不衝突。", []), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("keeps an individual no-clash claim when mutualClashes is empty", () => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
  });

  it.each([
    "GEST1006, GESB1013, and CISC1001 all three fit together.",
    "GEST1006, GESB1013, and CISC1001 fit together.",
    "GEST1006, GESB1013, and CISC1001 are compatible with each other.",
    "GEST1006、GESB1013、CISC1001 互相兼容。",
    "GEST1006、GESB1013、CISC1001 彼此兼容。",
  ])("flags a mutual compatibility claim: %s", (reply) => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(trace(reply, [discoveryCall(result)]), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual(["GEST1006", "GESB1013", "CISC1001"]);
    expect(graded.pass).toBe(false);
  });

  it.each([
    "GEST1006, GESB1013, and CISC1001 all three clash with one another.",
    "GEST1006 與 GESB1013 的上課時間互相衝突。",
  ])("does not treat a clash statement as a mutual fit claim: %s", (reply) => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(trace(reply, [discoveryCall(result)]), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("does not let a later conflict check support an earlier unsupported section", () => {
    const discovery = discoverCandidates(
      [{ courseCode: "GEST1006", section: "002", fit: "verified_no_clash" }],
      { planComplete: false },
    );
    const later = conflictResult({
      courseCode: "GESB1013",
      planComplete: true,
      sectionListComplete: false,
      sections: [{ section: "001", fit: "verified_no_clash" }],
    });
    const graded = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [
        discoveryCall(discovery),
        conflictCall(later, "GESB1013"),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);

    const sameCourse = conflictResult({
      courseCode: "GEST1006",
      planComplete: true,
      sectionListComplete: false,
      sections: [{ section: "001", fit: "verified_no_clash" }],
    });
    const merged = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [
        discoveryCall(discovery),
        conflictCall(sameCourse, "GEST1006"),
      ]),
      { discovery: "optional" },
    );
    expect(merged.falseFitClaims).toEqual(["GEST1006"]);
  });

  it("does not inherit older section fits when a newer listing of the same course is incomplete", () => {
    const earlier = conflictResult({
      courseCode: "GEST1006",
      planComplete: true,
      sectionListComplete: true,
      sections: [{ section: "002", fit: "verified_no_clash" }],
    });
    const newer = conflictResult({
      courseCode: "GEST1006",
      planComplete: true,
      sectionListComplete: false,
      sections: [{ section: "001", fit: "verified_no_clash" }],
    });
    const graded = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [
        conflictCall(earlier, "GEST1006"),
        conflictCall(newer, "GEST1006"),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GEST1006"]);
    expect(graded.pass).toBe(false);
  });

  it("does not treat a compacted empty otherSections list as a complete course", () => {
    const result = discoverCandidates([{ courseCode: "GEST1006", section: "002" }], {
      planComplete: true,
      compaction: { truncated: true, dropped: ["otherSections"] },
    });
    const course = gradeDiscovery(
      trace("GEST1006 has no clash with your timetable.", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(course.falseFitClaims).toEqual(["GEST1006"]);

    const section = gradeDiscovery(
      trace("GEST1006-002 has no clash with your timetable.", [discoveryCall(result)]),
      { discovery: "optional" },
    );
    expect(section.falseFitClaims).toEqual([]);
    expect(section.pass).toBe(true);
  });

  it.each([["notes"], ["excerpts"]])(
    "keeps the primary section gradeable when compaction only drops %s",
    (dropped) => {
      const result = discoverCandidates([{ courseCode: "GEST1006", section: "002" }], {
        planComplete: true,
        compaction: { truncated: true, dropped: [dropped] },
      });
      const course = gradeDiscovery(
        trace("GEST1006 has no clash with your timetable.", [discoveryCall(result)]),
        { discovery: "optional" },
      );
      expect(course.falseFitClaims).toEqual([]);
      expect(course.pass).toBe(true);

      const section = gradeDiscovery(
        trace("GEST1006-002 has no clash with your timetable.", [discoveryCall(result)]),
        { discovery: "optional" },
      );
      expect(section.falseFitClaims).toEqual([]);
      expect(section.pass).toBe(true);
    },
  );

  it("flags codes in a later mutual phrase without flagging an earlier individual fit", () => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(
      trace("GEST1006 fits your timetable, and GESB1013 and CISC1001 fit together.", [
        discoveryCall(result),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["GESB1013", "CISC1001"]);
  });

  it.each([
    "GEST1006 and GESB1013 don't fit together.",
    "GEST1006、GESB1013 不互相兼容。",
  ])("does not treat a direct negation as a mutual fit claim: %s", (reply) => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(trace(reply, [discoveryCall(result)]), { discovery: "optional" });
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("scores a later mutual idiom on its own span when an earlier one is negated", () => {
    const result = discoverCandidates(
      [
        { courseCode: "GEST1006", section: "002" },
        { courseCode: "GESB1013", section: "001" },
        { courseCode: "CISC1001", section: "001" },
        { courseCode: "MATH1001", section: "001" },
      ],
      { planComplete: true, mutualClashes: [] },
    );
    const graded = gradeDiscovery(
      trace("GEST1006 and GESB1013 don't fit together, while CISC1001 and MATH1001 fit together.", [
        discoveryCall(result),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual(["CISC1001", "MATH1001"]);
  });

  it("accepts a course-level no-clash claim when every listed section is verified", () => {
    const result = conflictResult({
      courseCode: "GEST1005",
      sections: [
        { section: "001", fit: "verified_no_clash" },
        { section: "002", fit: "verified_no_clash" },
      ],
    });
    const graded = gradeDiscovery(
      trace("GEST1005 (CHEUNG WAI) is verified no clash. Section 002 meets Tuesday afternoon, and section 001 meets Friday late morning.", [
        conflictCall(result),
      ]),
      { discovery: "optional" },
    );
    expect({ claims: graded.falseFitClaims, references: graded.referenceCodes }).toEqual({
      claims: [],
      references: [],
    });
    expect(graded.pass).toBe(true);
  });

  it("accepts a checked no-clash course claim when both sections are verified", () => {
    const graded = gradeDiscovery(
      trace("GEST1005 (CHEUNG WAI) checked, no clash.", [
        conflictCall(
          conflictResult({
            courseCode: "GEST1005",
            sections: [
              { section: "001", fit: "verified_no_clash" },
              { section: "002", fit: "verified_no_clash" },
            ],
          }),
        ),
      ]),
      { discovery: "optional" },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("records a parenthetical plan code as a reference instead of a fit claim", () => {
    const graded = gradeDiscovery(
      trace(
        "Every recommended section is verified no clash with your saved plan (GEGA1000-007, MON/THU 13:00-14:15).",
        [],
      ),
      { discovery: "optional" },
      { planCodes: ["GEGA1000"] },
    );
    expect({ claims: graded.falseFitClaims, references: graded.referenceCodes }).toEqual({
      claims: [],
      references: ["GEGA1000"],
    });
    expect(graded.pass).toBe(true);
  });

  it("records full-width parenthetical plan codes as references instead of fit claims", () => {
    const graded = gradeDiscovery(
      trace(
        "The latest recheck is verified no clash, though an older note still names the same courses（GEGA1000-007 and ART1001-001）。",
        [],
      ),
      { discovery: "optional" },
      { planCodes: ["GEGA1000", "ART1001"] },
    );
    expect({ claims: graded.falseFitClaims, references: graded.referenceCodes }).toEqual({
      claims: [],
      references: ["GEGA1000", "ART1001"],
    });
    expect(graded.pass).toBe(true);
  });

  it("does not flag a plan code that lands in the next Chinese sentence", () => {
    const graded = gradeDiscovery(
      trace("候選課都已核對為不衝突。課表上目前是 GEGA1000-007。", []),
      { discovery: "optional" },
      { planCodes: ["GEGA1000"] },
    );
    expect(graded.falseFitClaims).toEqual([]);
    expect(graded.pass).toBe(true);
  });

  it("counts tool calls excluding present_response", () => {
    const graded = gradeDiscovery(
      trace("Done.", [
        { name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, args: {} },
        { name: "get_course", args: { code: "GEST1006" } },
        { name: "present_response", args: {} },
      ]),
      { discovery: "required" },
    );
    expect(graded.toolCalls).toBe(2);
  });

  it("accepts a refusal that names the missing shortlist", () => {
    const expectTurn = invalidWindowExpect();
    const replies = [
      "I can't shortlist anything once the window is empty.",
      "The hours contradict, so no shortlist is possible.",
      "That schedule is impossible, and there is no top result.",
    ];
    for (const reply of replies) {
      const graded = gradeDiscovery(trace(reply, []), expectTurn);
      expect({ reply, mention: graded.checks.mention, forbid: graded.checks.forbid, pass: graded.pass }).toEqual({
        reply,
        mention: true,
        forbid: true,
        pass: true,
      });
    }
  });

  it("rejects an affirmative shortlist on an invalid window", () => {
    const expectTurn = invalidWindowExpect();
    const replies = [
      "Here's the shortlist you asked for.",
      "I shortlisted these GEST meetings.",
      "Top 3 courses fit a normal evening.",
      "Here are the courses from the catalog.",
    ];
    for (const reply of replies) {
      const graded = gradeDiscovery(trace(reply, []), expectTurn);
      expect({ reply, forbid: graded.checks.forbid, pass: graded.pass }).toEqual({
        reply,
        forbid: false,
        pass: false,
      });
    }
  });
});


function metricGrade(
  reply: string,
  toolCalls: ToolCallRecord[],
  expectTurn: DiscoveryExpect,
  identity: { caseId?: string; repeat?: number; turn?: number } = {},
): DiscoveryGrade {
  const turnTrace: TurnTrace = {
    ...trace(reply, toolCalls),
    caseId: identity.caseId ?? "test",
    repeat: identity.repeat ?? 0,
    turn: identity.turn ?? 0,
  };
  const graded = gradeDiscovery(turnTrace, expectTurn);
  return {
    caseId: turnTrace.caseId,
    repeat: turnTrace.repeat,
    turn: turnTrace.turn,
    pass: graded.pass,
    checks: graded.checks,
    falseFitClaims: graded.falseFitClaims,
    toolCalls: graded.toolCalls,
    discoveryRequired: expectTurn.discovery === "required",
    toolChoice: graded.toolChoice,
    discoveryBucket: graded.discoveryBucket,
    difficulty: graded.difficulty,
  };
}

function successfulDiscovery(courseCode = "GEST1006"): ToolCallRecord {
  return discoveryCall(discoverCandidates([{ courseCode }]));
}

describe("summarizeDiscovery", () => {
  it("computes median tool calls on discovery turns", () => {
    const grade = (toolCalls: number): DiscoveryGrade => ({
      caseId: "easy_gest",
      repeat: 0,
      turn: 0,
      pass: true,
      checks: { discovery: true, mention: true, forbid: true, maxToolCalls: true },
      falseFitClaims: [],
      toolCalls,
      discoveryRequired: true,
      toolChoice: "discover_course_candidates",
      discoveryBucket: "succeededWithArgs",
      difficulty: "omitted",
    });

    const summary = summarizeDiscovery([grade(1), grade(1), grade(3)], []);
    expect(summary.medianToolCalls).toBe(1);
  });

  it("counts no-midterm certainty violations on graded no_midterm turns", () => {
    const grade = (forbid: boolean): DiscoveryGrade => ({
      caseId: "no_midterm",
      repeat: 0,
      turn: 1,
      pass: forbid,
      checks: { discovery: true, mention: true, forbid, maxToolCalls: true },
      falseFitClaims: [],
      toolCalls: 2,
      discoveryRequired: true,
      toolChoice: "discover_course_candidates",
      discoveryBucket: "succeededWithArgs",
      difficulty: "omitted",
    });

    expect(summarizeDiscovery([grade(false)], []).noMidtermCertainty.violations).toBe(1);
    expect(summarizeDiscovery([grade(true)], []).noMidtermCertainty.violations).toBe(0);
  });

  it("counts a successful discover parse toward discovery use when arguments do not match", () => {
    const graded = metricGrade(
      "GEST1006 is one option.",
      [successfulDiscovery()],
      { discovery: "required", args: () => false },
      { caseId: "easy_gest" },
    );

    expect(graded.checks.discovery).toBe(false);
    expect(graded.pass).toBe(false);
    expect(summarizeDiscovery([graded], []).discoveryUse).toEqual({ cases: 1, hits: 1, rate: 1 });
    expect(summarizeDiscovery([graded], []).discoverySelection).toEqual({
      succeededWithArgs: 0,
      succeededArgsMismatch: 1,
      rejected: 0,
      notCalled: 0,
    });
    expect(summarizeDiscovery([graded], []).discoveryArgs).toEqual({ rate: 0 });
  });

  function discoverCallWith(args: Record<string, unknown>, result: string): ToolCallRecord {
    return { name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, args, result };
  }

  it("accepts a required turn when the first parsed discover call matches args", () => {
    const graded = metricGrade(
      "Later call matches.",
      [
        discoverCallWith({ scope: { codePrefix: "CISC" } }, "not-json"),
        discoverCallWith({ scope: { codePrefix: "GEST" } }, discoverCandidates([{ courseCode: "GEST1006" }])),
      ],
      {
        discovery: "required",
        args: (args) => (args.scope as { codePrefix?: string } | undefined)?.codePrefix === "GEST",
      },
    );

    expect(graded.checks.discovery).toBe(true);
    expect(graded.discoveryBucket).toBe("succeededWithArgs");
  });

  it("rejects args on the first parsed discover call and still counts discovery use", () => {
    const graded = metricGrade(
      "Later call mismatches.",
      [
        discoverCallWith({ scope: { codePrefix: "GEST" } }, "not-json"),
        discoverCallWith({ scope: { codePrefix: "CISC" } }, discoverCandidates([{ courseCode: "GEST1006" }])),
      ],
      {
        discovery: "required",
        args: (args) => (args.scope as { codePrefix?: string } | undefined)?.codePrefix === "GEST",
      },
    );

    expect(graded.checks.discovery).toBe(false);
    expect(graded.discoveryBucket).toBe("succeededArgsMismatch");
    expect(summarizeDiscovery([graded], []).discoveryUse).toEqual({ cases: 1, hits: 1, rate: 1 });
  });

  it("partitions required turns into discovery selection and keeps optional turns out", () => {
    const matched = metricGrade("Matched.", [successfulDiscovery("GEST1005")], {
      discovery: "required",
      args: (args) => args.scope !== undefined,
    });
    const unmatchedArgs = metricGrade("Unmatched.", [successfulDiscovery("GEST1006")], {
      discovery: "required",
      args: () => false,
    });
    const noArgsExpect = metricGrade("No args expect.", [successfulDiscovery("GEST1007")], {
      discovery: "required",
    });
    const rejected = metricGrade(
      "Rejected.",
      [
        {
          name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
          args: { scope: { courseType: "GE" } },
          result: "Error: Model tried to call unavailable tool",
        },
      ],
      { discovery: "required" },
    );
    const notCalled = metricGrade("Not called.", [], { discovery: "required" });
    const optional = metricGrade("Optional.", [successfulDiscovery("GEST1008")], {
      discovery: "optional",
      args: () => false,
    });
    const forbidden = metricGrade("Forbidden.", [successfulDiscovery("GEST1009")], {
      discovery: "forbidden",
    });

    const summary = summarizeDiscovery(
      [matched, unmatchedArgs, noArgsExpect, rejected, notCalled, optional, forbidden],
      [],
    );

    expect(summary.discoverySelection).toEqual({
      succeededWithArgs: 2,
      succeededArgsMismatch: 1,
      rejected: 1,
      notCalled: 1,
    });
    expect(
      summary.discoverySelection.succeededWithArgs +
        summary.discoverySelection.succeededArgsMismatch +
        summary.discoverySelection.rejected +
        summary.discoverySelection.notCalled,
    ).toBe(5);
    expect(summary.discoveryUse).toEqual({ cases: 5, hits: 3, rate: 0.6 });
    expect(summary.discoveryArgs).toEqual({ rate: 2 / 3 });
    expect(matched.checks.discovery).toBe(true);
    expect(noArgsExpect.checks.discovery).toBe(true);
    expect(unmatchedArgs.checks.discovery).toBe(false);
    expect(optional.discoveryBucket).toBeNull();
    expect(forbidden.discoveryBucket).toBeNull();
  });

  it("reports discoveryArgs.rate of 1 when no required turn parsed", () => {
    const summary = summarizeDiscovery(
      [
        metricGrade("Missing.", [], { discovery: "required" }),
        metricGrade(
          "Bad.",
          [{ name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, args: {}, result: "not-json" }],
          { discovery: "required" },
        ),
      ],
      [],
    );

    expect(summary.discoveryUse).toEqual({ cases: 2, hits: 0, rate: 0 });
    expect(summary.discoveryArgs).toEqual({ rate: 1 });
    expect(summary.discoverySelection).toEqual({
      succeededWithArgs: 0,
      succeededArgsMismatch: 0,
      rejected: 1,
      notCalled: 1,
    });
  });

  it("records the family of the first tool call that is not present_response", () => {
    const present = { name: "present_response", args: {} };
    const search = { name: "search_catalog", args: {} };
    const discover = successfulDiscovery();

    expect(metricGrade("search", [present, search], { discovery: "optional" }).toolChoice).toBe("search_catalog");
    expect(metricGrade("discover", [discover], { discovery: "optional" }).toolChoice).toBe(
      "discover_course_candidates",
    );
    expect(metricGrade("search first", [search, discover], { discovery: "optional" }).toolChoice).toBe(
      "search_catalog",
    );
    for (const name of [
      "get_course",
      "get_course_description",
      "get_course_ilo",
      "get_course_sections",
      "get_course_reviews",
    ]) {
      expect(metricGrade(name, [present, { name, args: {} }], { discovery: "optional" }).toolChoice).toBe("course");
    }
    expect(
      metricGrade("conflict", [{ name: "check_plan_conflicts", args: {} }], { discovery: "optional" }).toolChoice,
    ).toBe("conflict");
    expect(
      metricGrade("preview", [{ name: "preview_timetable", args: {} }], { discovery: "optional" }).toolChoice,
    ).toBe("preview");
    expect(
      metricGrade("other", [{ name: "count_reviews", args: {} }], { discovery: "optional" }).toolChoice,
    ).toBe("other");
    expect(metricGrade("none", [present], { discovery: "optional" }).toolChoice).toBe("none");
    expect(metricGrade("empty", [], { discovery: "optional" }).toolChoice).toBe("none");
  });

  it("classifies difficulty from the reply and scans every graded turn once", () => {
    const grades = [
      metricGrade("1 = very hard", [], { discovery: "optional" }, { caseId: "preference_conflict", repeat: 0, turn: 0 }),
      metricGrade("5 = very easy", [], { discovery: "optional" }, { caseId: "preference_conflict", repeat: 0, turn: 1 }),
      metricGrade("higher is easier", [], { discovery: "optional" }, { caseId: "holdout-easy_ge", repeat: 0, turn: 0 }),
      metricGrade("越高越容易", [], { discovery: "optional" }, { caseId: "holdout-easy_ge_zh", repeat: 0, turn: 0 }),
      metricGrade("I treat 1 hard and 5 easy.", [], { discovery: "optional" }, { caseId: "easy_gest", repeat: 0, turn: 0 }),
      metricGrade("1 = easiest", [], { discovery: "optional" }, { caseId: "preference_conflict", repeat: 1, turn: 2 }),
      metricGrade("5 = hardest", [], { discovery: "optional" }, { caseId: "preference_conflict", repeat: 2, turn: 0 }),
      metricGrade("lower is easier", [], { discovery: "optional" }, { caseId: "holdout-easy_ge", repeat: 1, turn: 0 }),
      metricGrade("越低越容易", [], { discovery: "optional" }, { caseId: "holdout-easy_ge_zh", repeat: 1, turn: 0 }),
      metricGrade("1 = very hard, though 1 = easiest", [], { discovery: "optional" }, {
        caseId: "preference_conflict",
        repeat: 0,
        turn: 3,
      }),
      metricGrade("higher is easier, but 越低越容易", [], { discovery: "optional" }, {
        caseId: "easy_gest",
        repeat: 2,
        turn: 1,
      }),
      metricGrade("GEST1006 looks manageable.", [], { discovery: "optional" }, { caseId: "easy_gest", repeat: 1, turn: 0 }),
      metricGrade("1 hard", [], { discovery: "optional" }, { caseId: "factual_lookup", repeat: 0, turn: 0 }),
      metricGrade("5 easy", [], { discovery: "optional" }, { caseId: "catalog_browse", repeat: 0, turn: 0 }),
    ];

    expect(grades[5]?.pass).toBe(true);
    expect(grades[5]?.difficulty).toBe("inverted");
    expect(grades[12]?.pass).toBe(true);
    expect(grades[12]?.difficulty).toBe("omitted");
    expect(grades[4]?.difficulty).toBe("stated");

    const mentioned = gradeDiscovery(trace("1 = easiest", []), { discovery: "optional", mention: [/GEST/] });
    expect(mentioned.checks.mention).toBe(false);
    expect(mentioned.pass).toBe(false);
    expect(mentioned.difficulty).toBe("inverted");

    const summary = summarizeDiscovery(grades, []);
    expect(summary.difficultyDirection).toEqual({
      inverted: [
        "preference_conflict r1 t2",
        "preference_conflict r2 t0",
        "holdout-easy_ge r1 t0",
        "holdout-easy_ge_zh r1 t0",
        "preference_conflict r0 t3",
        "easy_gest r2 t1",
      ],
      stated: 5,
      omitted: 3,
      cases: 14,
    });
    expect(
      summary.difficultyDirection.inverted.length +
        summary.difficultyDirection.stated +
        summary.difficultyDirection.omitted,
    ).toBe(summary.difficultyDirection.cases);
    expect(summary.difficultyDirection.cases).toBe(grades.length);
  });

  it("does not read a decimal score as a scale legend", () => {
    expect(metricGrade("GESB1012 is the highest difficulty score (4.1 = easiest).", [], { discovery: "optional" }).difficulty).toBe(
      "omitted",
    );
    expect(metricGrade("The hardest option is 4.5 = hardest on this scale.", [], { discovery: "optional" }).difficulty).toBe(
      "omitted",
    );
    expect(metricGrade("The weakest is 4.1 = very hard.", [], { discovery: "optional" }).difficulty).toBe("omitted");
    expect(metricGrade("The strongest is 4.5 = very easy.", [], { discovery: "optional" }).difficulty).toBe("omitted");
    expect(metricGrade("1 = easiest", [], { discovery: "optional" }).difficulty).toBe("inverted");
    expect(metricGrade("5 = hardest", [], { discovery: "optional" }).difficulty).toBe("inverted");
    expect(metricGrade("1 = very hard", [], { discovery: "optional" }).difficulty).toBe("stated");
    expect(metricGrade("5 = very easy", [], { discovery: "optional" }).difficulty).toBe("stated");
  });
});

describe("discovery case registry", () => {
  it("resolves separate v1 and v2 dev sets and a frozen holdout", () => {
    expect(DISCOVERY_CASES_V1.map((evalCase) => evalCase.id)).toEqual([
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_candidates",
      "planner_change",
      "no_midterm",
    ]);
    expect(DISCOVERY_CASES_V2.map((evalCase) => evalCase.id)).toEqual([
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_candidates_invalid_window",
      "no_candidates",
      "planner_change",
      "no_midterm",
      "credit_only_en",
      "credit_only_zh_hans",
      "credit_only_zh_hant",
      "factual_lookup",
      "catalog_browse",
    ]);
    expect(new Set(DISCOVERY_CASES_V2.map((evalCase) => evalCase.id)).size).toBe(DISCOVERY_CASES_V2.length);
    expect(DISCOVERY_CASES).toBe(DISCOVERY_CASES_V2);
    expect(DISCOVERY_CASES_V2).not.toBe(DISCOVERY_CASES_V1);

    expect(Object.keys(DISCOVERY_CASE_SETS)).toEqual(["dev-v1", "dev-v2", "holdout-v1", "shadow-v1", "shadow-v2", "efficiency-v1"]);
    expect(CASE_SET_VERSION).toBe("b2-v2");
    expect(DISCOVERY_CASE_SETS["dev-v1"]).toBe(DISCOVERY_CASES_V1);
    expect(DISCOVERY_CASE_SETS["dev-v2"]).toBe(DISCOVERY_CASES_V2);
    expect(DISCOVERY_CASE_SETS["holdout-v1"]).toBe(DISCOVERY_HOLDOUT_CASES_V1);
    expect(DISCOVERY_CASE_SETS["shadow-v1"]).toBe(SHADOW_CASES_V1);
    expect(DISCOVERY_CASE_SETS["shadow-v2"]).toBe(SHADOW_CASES_V2);
    expect(DISCOVERY_CASE_SETS["efficiency-v1"]).toBe(EFFICIENCY_CASES_V1);
    expect(DISCOVERY_HOLDOUT_CASES_V1).toBe(DISCOVERY_HOLDOUT_CASES);
    expect(
      DISCOVERY_HOLDOUT_CASES_V1.map((evalCase) => ({
        id: evalCase.id,
        messages: evalCase.turns.map((turn) => turn.message),
      })),
    ).toEqual(FROZEN_HOLDOUT_V1);
    expect(
      SHADOW_CASES_V2.map((evalCase) => ({
        id: evalCase.id,
        turns: evalCase.turns.map((turn) => ({ message: turn.message, discovery: turn.expect.discovery })),
      })),
    ).toEqual(FROZEN_SHADOW_V2);
    expect(
      EFFICIENCY_CASES_V1.map((evalCase) => ({
        id: evalCase.id,
        turns: evalCase.turns.map((turn) => ({ message: turn.message, discovery: turn.expect.discovery })),
      })),
    ).toEqual(FROZEN_EFFICIENCY_V1);
    expect(
      SHADOW_CASES_V1.map((evalCase) => ({
        id: evalCase.id,
        turns: evalCase.turns.map((turn) => ({
          message: turn.message,
          discovery: turn.expect.discovery,
        })),
      })),
    ).toEqual(FROZEN_SHADOW_V1);

    const unchangedIds = [
      "easy_gest",
      "history_ge",
      "first_year_cs",
      "fill_credits",
      "explicit_constraints",
      "preference_conflict",
      "no_midterm",
    ];
    for (const id of unchangedIds) {
      const v1Case = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === id);
      const v2Case = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === id);
      expect(v2Case).toEqual(v1Case);
      expect(v2Case).not.toBe(v1Case);
      expect(v2Case?.turns).not.toBe(v1Case?.turns);
      expect(v2Case?.turns[0]).not.toBe(v1Case?.turns[0]);
    }
  });

  it("keeps the contradictory window on v1 and splits it from the valid evening search on v2", () => {
    const v1Empty = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === "no_candidates");
    expect(v1Empty?.turns[0]?.message).toBe(
      "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
    );
    expect(v1Empty?.turns[0]?.expect.discovery).toBe("required");
    expect(
      v1Empty?.turns[0]?.expect.args?.({ required: { startAfter: "18:00", endBefore: "08:00" } }),
    ).toBe(true);

    const invalid = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "no_candidates_invalid_window");
    expect(invalid?.pathname).toBe("/");
    expect(invalid?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(invalid?.why).toBe("spec §13; no_candidates dev r0/r1");
    expect(invalid?.turns).toHaveLength(1);
    expect(invalid?.turns[0]?.message).toBe(
      "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
    );
    expect(invalid?.turns[0]?.expect.discovery).toBe("optional");
    expect(invalid?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(invalid?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      [
        "can(?:'|no)t (?:both )?hold|contradict|impossible|no (class|section|course)|window is empty",
        "i",
      ],
    ]);
    expect(invalid?.turns[0]?.expect.forbid?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      [
        "(?<!\\b(?:no|not|can(?:'|no)?t)\\s+)shortlist|I recommend|here are (the |some )?(courses|options|classes)|top \\d",
        "i",
      ],
    ]);
    expect(invalid?.turns[0]?.expect.args).toBeUndefined();

    const unsatisfiable = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "no_candidates");
    expect(unsatisfiable?.pathname).toBe("/");
    expect(unsatisfiable?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(unsatisfiable?.why).toBe("spec §4 scenario G; dev r2 behaviour");
    expect(unsatisfiable?.turns).toHaveLength(1);
    expect(unsatisfiable?.turns[0]?.message).toBe("Find GEST courses that have to start after 18:00.");
    expect(unsatisfiable?.turns[0]?.expect.discovery).toBe("required");
    expect(unsatisfiable?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(unsatisfiable?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["no [^.!?]{0,30}(course|class|section|option)|nothing (matches|fits)|none", "i"],
    ]);
    expect(unsatisfiable?.turns[0]?.expect.forbid).toBeUndefined();
    const eveningArgs = unsatisfiable?.turns[0]?.expect.args;
    expect(eveningArgs?.({ required: { startAfter: "18:00" } })).toBe(true);
    expect(eveningArgs?.({ scope: { codePrefix: "GEST" }, required: { startAfter: "18:00" } })).toBe(true);
    expect(eveningArgs?.({ required: { startAfter: "18:00", endBefore: "21:00" } })).toBe(true);
    expect(eveningArgs?.({ required: { startAfter: "18:00", endBefore: "08:00" } })).toBe(false);
    expect(eveningArgs?.({ required: { startAfter: "10:00" } })).toBe(false);
    expect(eveningArgs?.({ required: { endBefore: "08:00" } })).toBe(false);
    expect(eveningArgs?.({})).toBe(false);
  });

  it("makes the planner re-check optional and appends the lookup and browse guards", () => {
    const v1Planner = DISCOVERY_CASES_V1.find((evalCase) => evalCase.id === "planner_change");
    const v2Planner = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "planner_change");
    expect(v2Planner?.why).toBe(v1Planner?.why);
    expect(v2Planner?.pathname).toBe(v1Planner?.pathname);
    expect(v2Planner?.timetable).toBe(v1Planner?.timetable);
    expect(v2Planner?.turns.map((turn) => turn.message)).toEqual(v1Planner?.turns.map((turn) => turn.message));
    expect(v2Planner?.turns[0]?.expect).toEqual(v1Planner?.turns[0]?.expect);
    expect(v2Planner?.turns[1]?.expect).toEqual(v1Planner?.turns[1]?.expect);
    expect(v1Planner?.turns[2]?.expect.discovery).toBe("required");
    expect(v2Planner?.turns[2]?.timetable).toBe(v1Planner?.turns[2]?.timetable);
    expect(v2Planner?.turns[2]?.expect.discovery).toBe("optional");
    expect(v2Planner?.turns[2]?.expect.maxToolCalls).toBe(3);
    expect(v2Planner?.turns[2]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["re-?check|again|updated|current plan", "i"],
    ]);

    const factual = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "factual_lookup");
    expect(factual?.pathname).toBe("/");
    expect(factual?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(factual?.why).toBe("mission §3/§8; over-selection risk of the new contract");
    expect(factual?.turns).toEqual([
      {
        message: "How many credits is CISC1001?",
        expect: { discovery: "forbidden", maxToolCalls: 2 },
      },
    ]);

    const browse = DISCOVERY_CASES_V2.find((evalCase) => evalCase.id === "catalog_browse");
    expect(browse?.pathname).toBe("/");
    expect(browse?.timetable).toBe(DEFAULT_DISCOVERY_TIMETABLE);
    expect(browse?.why).toBe("amendment 1: browsing must stay cheap");
    expect(browse?.turns[0]?.message).toBe("List all first-year CIS courses.");
    expect(browse?.turns[0]?.expect.discovery).toBe("optional");
    expect(browse?.turns[0]?.expect.maxToolCalls).toBe(3);
    expect(browse?.turns[0]?.expect.args).toBeUndefined();
    expect(browse?.turns[0]?.expect.forbid).toBeUndefined();
    expect(browse?.turns[0]?.expect.mention?.map((pattern) => [pattern.source, pattern.flags])).toEqual([
      ["CISC100[123]", ""],
    ]);
  });
});

describe("discoveryEvalStamp", () => {
  it("stamps rubricVersion and caseSetId on settings and the payload", () => {
    const stamp = discoveryEvalStamp({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      caseSetId: "dev-v2",
    });

    expect(stamp.rubricVersion).toBe("b2-v2");
    expect(stamp.caseSetId).toBe("dev-v2");
    expect(stamp.settings).toEqual({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
    });
    expect(discoveryEvalStamp({
      model: "test-model",
      thinking: "low",
      maxOutputTokens: 400,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: true,
      mode: "baseline",
      caseSetId: "holdout-v1",
    }).settings.caseSetId).toBe("holdout-v1");
  });

  it("builds the artifact written to disk with rubricVersion and caseSetId", () => {
    const summary = {
      turns: 1,
      passed: 1,
      passRate: 1,
      discoveryUse: { cases: 1, hits: 1, rate: 1 },
      discoveryArgs: { rate: 1 },
      discoverySelection: {
        succeededWithArgs: 1,
        succeededArgsMismatch: 0,
        rejected: 0,
        notCalled: 0,
      },
      falseFitClaims: 0,
      difficultyDirection: { inverted: [], stated: 0, omitted: 1, cases: 1 },
      noMidtermCertainty: { violations: 0 },
      medianToolCalls: 1,
    };
    const payload = buildDiscoveryEvalPayload({
      label: "run",
      suite: "dev",
      caseSetId: "dev-v2",
      settings: {
        model: "test-model",
        thinking: "off",
        maxOutputTokens: 1200,
        maxSteps: 8,
        prompt: "prompt-fp",
        eval: "eval-fp",
        noDiscovery: false,
        mode: "with_discovery",
      },
      repeats: 1,
      stepBudget: 200,
      stepsUsed: 4,
      complete: true,
      expectedTurns: 1,
      stoppedEarly: undefined,
      summary,
      failures: [],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 1,
      discoverySuccesses: 1,
      grades: [],
      traces: [],
    });

    expect(payload).toMatchObject({
      kind: "discovery",
      label: "run",
      suite: "dev",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
      repeats: 1,
      stepBudget: 200,
      stepsUsed: 4,
      complete: true,
      expectedTurns: 1,
      stoppedEarly: undefined,
      failures: [],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 1,
      discoverySuccesses: 1,
      grades: [],
      traces: [],
    });
    expect(payload.summary).toBe(summary);
    expect(payload.settings).toEqual({
      model: "test-model",
      thinking: "off",
      maxOutputTokens: 1200,
      maxSteps: 8,
      prompt: "prompt-fp",
      eval: "eval-fp",
      noDiscovery: false,
      mode: "with_discovery",
      rubricVersion: "b2-v2",
      caseSetId: "dev-v2",
    });

    const holdout = buildDiscoveryEvalPayload({
      label: "holdout-run",
      suite: "holdout",
      caseSetId: "holdout-v1",
      settings: {
        model: "test-model",
        thinking: "low",
        maxOutputTokens: 400,
        maxSteps: 8,
        prompt: "prompt-fp",
        eval: "eval-fp",
        noDiscovery: true,
        mode: "baseline",
      },
      repeats: 1,
      stepBudget: 10,
      stepsUsed: 0,
      complete: false,
      expectedTurns: 2,
      stoppedEarly: "budget",
      summary,
      failures: ["miss"],
      requestMismatches: [],
      toolRegistrationViolations: [],
      discoveryAttempts: 0,
      discoverySuccesses: 0,
      grades: [],
      traces: [],
    });
    expect(holdout.rubricVersion).toBe(CASE_SET_VERSION);
    expect(holdout.caseSetId).toBe("holdout-v1");
    expect(holdout.settings.rubricVersion).toBe("b2-v2");
    expect(holdout.settings.caseSetId).toBe("holdout-v1");
    expect(holdout.settings.noDiscovery).toBe(true);
    expect(holdout.stoppedEarly).toBe("budget");
  });

  it("selects the case set from ASSISTANT_EVAL_CASE_SET, otherwise holdout or dev-v2", () => {
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_CASE_SET: "dev-v1", ASSISTANT_EVAL_SUITE: "holdout" })).toBe(
      "dev-v1",
    );
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "holdout" })).toBe("holdout-v1");
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "shadow" })).toBe("shadow-v1");
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "dev" })).toBe("dev-v2");
    expect(resolveDiscoveryCaseSetId({})).toBe("dev-v2");
    expect(() => resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_SUITE: "nope" })).toThrow(
      'unknown ASSISTANT_EVAL_SUITE "nope"',
    );
    expect(resolveDiscoveryCaseSetId({ ASSISTANT_EVAL_CASE_SET: "dev-v3" })).toBe("dev-v3");
    expect(discoveryPassThreshold("holdout-v1")).toBe(0.75);
    expect(discoveryPassThreshold("dev-v2")).toBe(0.8);
    expect(discoveryPassThreshold("dev-v1")).toBe(0.8);
  });
});

const EVAL_ENV_KEYS = [
  "AI_API_KEY",
  "ASSISTANT_EVAL_REPEATS",
  "ASSISTANT_EVAL_CASES",
  "ASSISTANT_EVAL_DELAY_MS",
  "ASSISTANT_EVAL_LABEL",
  "ASSISTANT_EVAL_SUITE",
  "ASSISTANT_EVAL_CASE_SET",
  "ASSISTANT_EVAL_CASE_TIMEOUT_MS",
  "ASSISTANT_EVAL_MAX_STEPS",
] as const;

type ArtifactCase = {
  caseId: string;
  repeat: number;
  steps: number;
  toolCalls: number;
  discoveryAttempts: number;
  discoverySuccesses: number;
  ms: number;
  elapsedMs: number;
};

type WrittenArtifact = {
  complete: boolean;
  partial?: boolean;
  stoppedEarly?: string;
  timedOutTurns?: Array<{ caseId: string; repeat: number; turn: number }>;
  cases?: ArtifactCase[];
  traces: TurnTrace[];
  discoveryAttempts: number;
  discoverySuccesses: number;
};

function resetProbe(script: "passthrough" | "hang-first" | "immediate") {
  probe.script = script;
  probe.events = [];
  probe.runs = 0;
}

async function withEvalEnv<T>(
  values: Record<(typeof EVAL_ENV_KEYS)[number], string>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of EVAL_ENV_KEYS) {
    previous.set(key, process.env[key]);
    process.env[key] = values[key];
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function untilDeadline(run: () => Promise<void>, deadlineMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("stalled turn was not cancelled")), deadlineMs);
  });
  try {
    await Promise.race([run(), stalled]);
    return undefined;
  } catch (error) {
    return error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("baseline harness reliability", () => {
  it("aborts the fetch signal when the external signal aborts", async () => {
    const controller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });

    const pending = withTimeout(fetchImpl, 60_000, controller.signal)("https://example.invalid/chat");
    expect(fetchSignal?.aborted).toBe(false);
    controller.abort(new DOMException("client went away", "AbortError"));

    expect(fetchSignal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("defaults the case timeout to 120000", () => {
    const readTimeout = (harness as { evalCaseTimeoutMs?: (value?: string) => number }).evalCaseTimeoutMs;
    expect(typeof readTimeout).toBe("function");
    expect(readTimeout!("")).toBe(120_000);
    expect(readTimeout!(undefined)).toBe(120_000);
    expect(readTimeout!("100")).toBe(100);
  });

  it("marks a stalled turn timedOut, runs the next case, and writes a partial artifact", async () => {
    const label = `task5-hang-${randomUUID()}`;
    const artifact = path.join(".eval-results", "assistant", `discovery-${label}.json`);
    const existed = existsSync(artifact);
    const snapshots: WrittenArtifact[] = [];
    const timeoutMs = 100;
    resetProbe("hang-first");
    const started = Date.now();

    try {
      const thrown = await withEvalEnv(
        {
          AI_API_KEY: "sk-test",
          ASSISTANT_EVAL_REPEATS: "1",
          ASSISTANT_EVAL_CASES: "factual_lookup,catalog_browse",
          ASSISTANT_EVAL_DELAY_MS: "0",
          ASSISTANT_EVAL_LABEL: label,
          ASSISTANT_EVAL_SUITE: "dev",
          ASSISTANT_EVAL_CASE_SET: "dev-v2",
          ASSISTANT_EVAL_CASE_TIMEOUT_MS: String(timeoutMs),
          ASSISTANT_EVAL_MAX_STEPS: "200",
        },
        () =>
          untilDeadline(
            () =>
              discoveryEvalLib.runDiscoveryEval({
                getAppConfigMock: { mockResolvedValue: vi.fn() },
                mode: "baseline",
                enforceThresholds: false,
                writeArtifact: (_file, body) => {
                  snapshots.push(JSON.parse(body) as WrittenArtifact);
                },
              }),
            3_000,
          ),
      );

      expect(existsSync(artifact)).toBe(false);
      expect(String(thrown)).toMatch(/incomplete run/);
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(probe.events.indexOf("hang-settled")).toBeGreaterThanOrEqual(0);
      expect(probe.events.indexOf("hang-settled")).toBeLessThan(probe.events.indexOf("next-case"));
      expect(snapshots).toHaveLength(3);

      const finalArtifact = snapshots[2]!;
      expect(finalArtifact.partial).toBe(true);
      expect(finalArtifact.complete).toBe(false);
      expect(finalArtifact.timedOutTurns).toEqual([{ caseId: "factual_lookup", repeat: 0, turn: 0 }]);
      expect(finalArtifact.cases).toEqual([
        expect.objectContaining({
          caseId: "factual_lookup",
          repeat: 0,
          steps: 0,
          toolCalls: 0,
          discoveryAttempts: 0,
          discoverySuccesses: 0,
        }),
        expect.objectContaining({
          caseId: "catalog_browse",
          repeat: 0,
          steps: 0,
          toolCalls: 2,
          discoveryAttempts: 1,
          discoverySuccesses: 0,
        }),
      ]);
      expect(finalArtifact.cases?.[0]?.ms).toBe(finalArtifact.cases?.[0]?.elapsedMs);
      expect(finalArtifact.cases?.[1]?.ms).toBe(finalArtifact.cases?.[1]?.elapsedMs);
      expect(finalArtifact.cases?.[0]?.ms).toBeLessThan(timeoutMs + 1_000);
      expect(snapshots[0]?.cases).toHaveLength(1);
      expect(snapshots[0]?.partial).toBe(true);
      expect(snapshots[1]?.cases).toHaveLength(2);

      const stalled = finalArtifact.traces.find((trace) => trace.caseId === "factual_lookup");
      const next = finalArtifact.traces.find((trace) => trace.caseId === "catalog_browse");
      expect(stalled?.timedOut).toBe(true);
      expect(stalled?.error).toMatch(/TimeoutError/);
      expect(next?.timedOut).not.toBe(true);
      expect(finalArtifact.discoveryAttempts).toBe(1);
    } finally {
      if (!existed && existsSync(artifact)) unlinkSync(artifact);
    }
  });

  it("writes the artifact once per case and once when the run settles", async () => {
    const label = `task5-writes-${randomUUID()}`;
    const artifact = path.join(".eval-results", "assistant", `discovery-${label}.json`);
    const existed = existsSync(artifact);
    const snapshots: WrittenArtifact[] = [];
    resetProbe("immediate");

    try {
      await withEvalEnv(
        {
          AI_API_KEY: "sk-test",
          ASSISTANT_EVAL_REPEATS: "1",
          ASSISTANT_EVAL_CASES: "factual_lookup,catalog_browse",
          ASSISTANT_EVAL_DELAY_MS: "0",
          ASSISTANT_EVAL_LABEL: label,
          ASSISTANT_EVAL_SUITE: "dev",
          ASSISTANT_EVAL_CASE_SET: "dev-v2",
          ASSISTANT_EVAL_CASE_TIMEOUT_MS: "120000",
          ASSISTANT_EVAL_MAX_STEPS: "200",
        },
        () =>
          discoveryEvalLib.runDiscoveryEval({
            getAppConfigMock: { mockResolvedValue: vi.fn() },
            mode: "baseline",
            enforceThresholds: false,
            writeArtifact: (_file, body) => {
              snapshots.push(JSON.parse(body) as WrittenArtifact);
            },
          }),
      );

      expect(existsSync(artifact)).toBe(false);
      expect(snapshots).toHaveLength(3);
      const finalArtifact = snapshots[2]!;
      expect(finalArtifact.complete).toBe(true);
      expect(finalArtifact.partial).toBe(false);
      expect(finalArtifact.timedOutTurns).toEqual([]);
      expect(finalArtifact.cases?.map((entry) => entry.caseId)).toEqual(["factual_lookup", "catalog_browse"]);
      for (const entry of finalArtifact.cases ?? []) {
        expect(entry.ms).toBe(entry.elapsedMs);
        expect(entry.steps).toBe(0);
        expect(entry.toolCalls).toBe(2);
        expect(entry.discoveryAttempts).toBe(1);
        expect(entry.discoverySuccesses).toBe(0);
      }
      expect(finalArtifact.discoveryAttempts).toBe(2);
      expect(finalArtifact.discoverySuccesses).toBe(0);
      expect(snapshots[0]?.cases).toHaveLength(1);
      expect(snapshots[0]?.complete).toBe(false);
      expect(snapshots[0]?.partial).toBe(false);
    } finally {
      if (!existed && existsSync(artifact)) unlinkSync(artifact);
    }
  });

  it("marks a budget stop partial without a timed out turn", async () => {
    const label = `task5-budget-${randomUUID()}`;
    const artifact = path.join(".eval-results", "assistant", `discovery-${label}.json`);
    const existed = existsSync(artifact);
    const snapshots: WrittenArtifact[] = [];
    resetProbe("immediate");

    try {
      const thrown = await withEvalEnv(
        {
          AI_API_KEY: "sk-test",
          ASSISTANT_EVAL_REPEATS: "1",
          ASSISTANT_EVAL_CASES: "factual_lookup,catalog_browse",
          ASSISTANT_EVAL_DELAY_MS: "0",
          ASSISTANT_EVAL_LABEL: label,
          ASSISTANT_EVAL_SUITE: "dev",
          ASSISTANT_EVAL_CASE_SET: "dev-v2",
          ASSISTANT_EVAL_CASE_TIMEOUT_MS: "120000",
          ASSISTANT_EVAL_MAX_STEPS: "1",
        },
        () =>
          untilDeadline(
            () =>
              discoveryEvalLib.runDiscoveryEval({
                getAppConfigMock: { mockResolvedValue: vi.fn() },
                mode: "baseline",
                enforceThresholds: false,
                writeArtifact: (_file, body) => {
                  snapshots.push(JSON.parse(body) as WrittenArtifact);
                },
              }),
            3_000,
          ),
      );

      expect(existsSync(artifact)).toBe(false);
      expect(String(thrown)).toMatch(/incomplete run/);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[1]?.partial).toBe(true);
      expect(snapshots[1]?.complete).toBe(false);
      expect(snapshots[1]?.timedOutTurns).toEqual([]);
      expect(snapshots[1]?.stoppedEarly).toMatch(/factual_lookup|catalog_browse/);
      expect(snapshots[1]?.cases).toHaveLength(1);
    } finally {
      if (!existed && existsSync(artifact)) unlinkSync(artifact);
    }
  });

  it("counts case steps, non-present tool calls, and one wall time for ms and elapsedMs", () => {
    const recordCase = (
      discoveryEvalLib as {
        discoveryCaseRecord?: (
          caseId: string,
          repeat: number,
          traces: readonly TurnTrace[],
          elapsedMs: number,
        ) => ArtifactCase;
      }
    ).discoveryCaseRecord;
    expect(typeof recordCase).toBe("function");
    const turn = trace("CISC1001", [
      { name: "present_response", args: {} },
      { name: "search_catalog", args: { query: "CIS" } },
      { name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, args: { scope: { codePrefix: "CISC" } }, result: "not-json" },
    ]);
    turn.runs = [
      {
        continuation: false,
        ms: 10,
        steps: [
          { ms: 4, finish: "stop", tools: [] },
          { ms: 6, finish: "tool-calls", tools: ["search_catalog"] },
        ],
      },
    ];
    expect(recordCase!("easy_gest", 1, [turn], 42)).toEqual({
      caseId: "easy_gest",
      repeat: 1,
      steps: 2,
      toolCalls: 2,
      discoveryAttempts: 1,
      discoverySuccesses: 0,
      ms: 42,
      elapsedMs: 42,
    });
  });

  it("replaces the artifact via a temp file in the same directory", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "discovery-artifact-"));
    const file = path.join(directory, "discovery-label.json");
    const written: string[] = [];
    const renamed: Array<[string, string]> = [];
    try {
      discoveryEvalLib.writeDiscoveryArtifact(file, "{\"ok\":true}", {
        mkdirSync() {},
        writeFileSync(target) {
          written.push(String(target));
        },
        renameSync(from, to) {
          renamed.push([String(from), String(to)]);
        },
      });
      expect(written).toHaveLength(1);
      expect(path.dirname(written[0]!)).toBe(directory);
      expect(written[0]).not.toBe(file);
      expect(path.basename(written[0]!)).toMatch(/^\.discovery-label\.json\..+\.tmp$/);
      expect(renamed).toEqual([[written[0], file]]);

      discoveryEvalLib.writeDiscoveryArtifact(file, "{\"ok\":true}");
      expect(readFileSync(file, "utf8")).toBe("{\"ok\":true}");
      expect(readdirSync(directory)).toEqual(["discovery-label.json"]);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
