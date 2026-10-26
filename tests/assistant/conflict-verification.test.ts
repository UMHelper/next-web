import { describe, expect, it } from "vitest";

import { summarizeConflictVerifications } from "@/lib/assistant/conflict-verification";
import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";

const checkedResult = (plannerVersion: string) =>
  JSON.stringify({
    status: "checked",
    courseCode: "CISC1001",
    instructor: "LEE KA CHUN",
    plan: { name: "My plan", term: "2026/2027 AY Sem 1" },
    planComplete: true,
    sectionListComplete: true,
    plannerVersion,
    unscheduled: [],
    sections: [
      {
        section: "001",
        meetings: ["MON 14:30-15:45", "THU 14:30-15:45", "WED 08:30-09:45"],
        conflicts: [
          { with: "GEGA1000-007", day: "MON", overlap: "14:30-15:45" },
          { with: "GEGA1000-007", day: "THU", overlap: "14:30-15:45" },
        ],
        complete: true,
        fit: "confirmed_clash",
      },
    ],
  });

const discoverResult = (plannerVersion: string) =>
  JSON.stringify({
    status: "ok",
    term: { year: 2026, sem: 1, label: "2026/2027 AY Sem 1" },
    timetable: { status: "ready", plannerVersion },
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
        instructors: [
          {
            name: "LEE KA CHUN",
            reviews: 4,
            difficulty: 3,
            grade: 3.5,
            result: 4,
            sampleSize: 4,
          },
        ],
        meetings: ["TUE 11:30-12:45"],
        meetingsComplete: true,
        fit: "verified_no_clash",
        matched: [],
        tradeoffs: [],
        signals: {},
        score: 1,
        otherSections: [
          { section: "001", meetings: "MON 09:00-10:15", fit: "confirmed_clash" },
          { section: "003", meetings: "WED 09:00-10:15", fit: "not_checked" },
        ],
      },
    ],
    unverified: [],
    noListedSections: [],
    mutualClashes: [],
    ranking: "test",
    notes: [],
  });

describe("summarizeConflictVerifications", () => {
  it("records a successful check and leaves unchecked sections absent", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "Would CISC1001 fit?" },
      {
        role: "assistant",
        toolCalls: [
          { id: "c1", function: { name: "check_plan_conflicts", arguments: '{"code":"CISC1001"}' } },
        ],
      },
      { role: "tool", toolCallId: "c1", content: checkedResult("v-current") },
      { role: "assistant", content: "CISC1001-001 clashes on Monday and Thursday." },
    ];

    const payload = JSON.parse(summarizeConflictVerifications(messages, "v-current")) as {
      checks: Array<{ course: string; section: string; fit: string; stale: boolean }>;
    };
    expect(payload.checks).toEqual([
      expect.objectContaining({
        course: "CISC1001",
        section: "001",
        fit: "confirmed_clash",
        stale: false,
      }),
    ]);
    expect(payload.checks.some((entry) => entry.course === "GEST1019")).toBe(false);
  });

  it("records discovery candidate and otherSection fits, skipping not_checked", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "Find GE courses after 10" },
      {
        role: "assistant",
        toolCalls: [
          {
            id: "d1",
            function: { name: "discover_course_candidates", arguments: '{"scope":{"courseType":"GE"}}' },
          },
        ],
      },
      { role: "tool", toolCallId: "d1", content: discoverResult("aaa") },
    ];

    const current = JSON.parse(summarizeConflictVerifications(messages, "aaa")) as {
      checks: Array<{ section: string; fit: string; stale: boolean }>;
    };
    expect(current.checks).toHaveLength(2);
    expect(current.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "002", fit: "verified_no_clash", stale: false }),
        expect.objectContaining({ section: "001", fit: "confirmed_clash", stale: false }),
      ]),
    );
    expect(current.checks.some((entry) => entry.section === "003")).toBe(false);

    const stale = JSON.parse(summarizeConflictVerifications(messages, "bbb")) as {
      checks: Array<{ stale: boolean }>;
    };
    expect(stale.checks.every((entry) => entry.stale)).toBe(true);
  });

  it("marks checks stale after the planner version changes", () => {
    const messages: DiscussedMessage[] = [
      { role: "user", content: "Check CISC1001" },
      {
        role: "assistant",
        toolCalls: [{ id: "c1", function: { name: "check_plan_conflicts", arguments: "{}" } }],
      },
      { role: "tool", toolCallId: "c1", content: checkedResult("v-old") },
      { role: "assistant", content: "Looks clear." },
      { role: "user", content: "I edited my timetable—still ok?" },
    ];

    const payload = JSON.parse(summarizeConflictVerifications(messages, "v-new")) as {
      checks: Array<{ stale: boolean; fit: string }>;
    };
    expect(payload.checks[0]).toMatchObject({ stale: true, fit: "confirmed_clash" });
  });
});
