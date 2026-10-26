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
