import { describe, expect, it } from "vitest";

import { discoveryEvidenceFromCalls } from "@/lib/assistant/discovery/evidence";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { hydrateRecommendationSection } from "@/lib/assistant/recommendation-hydrate";
import type { ToolCallLike } from "@/lib/assistant/presentation";
import { absoluteUrl, buildCoursePath } from "@/lib/site";
import { discoverTwoCandidateResult } from "@/tests/fixtures/discover-result";

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function results(entries: Record<string, string>): Map<string, { content?: unknown }> {
  return new Map(Object.entries(entries).map(([id, content]) => [id, { content }]));
}

describe("discoveryEvidenceFromCalls", () => {
  it("builds catalog courses and splits other-section meetings on semicolons", () => {
    const body = JSON.stringify({
      status: "ok",
      term: { year: 2026, sem: 1, label: "2026/2027 AY Sem 1" },
      timetable: { status: "ready", plannerVersion: "v1" },
      examined: { courses: 1, sections: 2, totalMatchingCourses: 1, truncated: false },
      excluded: {
        alreadyInPlan: 0,
        excludedCodes: 0,
        noListedSections: 0,
        required: { startAfter: 0, endBefore: 0, avoidDays: 0, avoidWindows: 0, noClash: 0 },
      },
      notApplied: [],
      candidates: [
        {
          rank: 1,
          courseCode: "GEST1006",
          titleEn: "Sample GE",
          titleZh: null,
          credits: 3,
          courseType: "GE",
          suggestedYear: 1,
          section: "002",
          instructors: [],
          meetings: ["TUE 11:30-12:45"],
          meetingsComplete: true,
          fit: "verified_no_clash",
          matched: [],
          tradeoffs: [],
          signals: {},
          score: 1,
          otherSections: [
            { section: "001", meetings: "MON 09:00-10:15; WED 09:00-10:15", fit: "confirmed_clash" },
          ],
        },
      ],
      unverified: [],
      noListedSections: [],
      mutualClashes: [],
      ranking: "test",
      notes: [],
    });

    const calls = [call("d1", DISCOVER_COURSE_CANDIDATES_TOOL_NAME, { scope: { courseType: "GE" } })];
    const evidence = discoveryEvidenceFromCalls(calls, results({ d1: body }));
    const entry = evidence.get("GEST1006");
    expect(entry?.course).toMatchObject({
      courseCode: "GEST1006",
      isOffered: true,
      aka: [],
      url: absoluteUrl(buildCoursePath("GEST1006")),
    });
    expect(entry?.sections.get("001")?.meetings).toEqual(["MON 09:00-10:15", "WED 09:00-10:15"]);
  });

  it("lets the newest discover call win for the same course", () => {
    const older = discoverTwoCandidateResult("v-old");
    const newer = discoverTwoCandidateResult("v-new");
    const calls = [
      call("d1", DISCOVER_COURSE_CANDIDATES_TOOL_NAME, { scope: { courseType: "GE" } }),
      call("d2", DISCOVER_COURSE_CANDIDATES_TOOL_NAME, { scope: { courseType: "GE" } }),
    ];
    const evidence = discoveryEvidenceFromCalls(calls, results({ d1: older, d2: newer }));
    expect(evidence.get("GEST1006")?.sections.get("002")?.plannerVersion).toBe("v-new");
  });
});

describe("hydrateRecommendationSection", () => {
  it("returns the best section with meetings, fit, and plannerVersion", () => {
    const calls = [call("d1", DISCOVER_COURSE_CANDIDATES_TOOL_NAME, { scope: { courseType: "GE" } })];
    const map = results({ d1: discoverTwoCandidateResult("planner-abc") });
    expect(hydrateRecommendationSection("GEST1006", undefined, calls, map)).toEqual({
      courseCode: "GEST1006",
      section: "002",
      meetings: ["TUE 11:30-12:45 E11"],
      fit: "verified_no_clash",
      plannerVersion: "planner-abc",
      clashWith: [],
    });
  });
});
