import { describe, expect, it } from "vitest";

import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import {
  MAX_PREVIEWS_CONTEXT_CHARS,
  TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION,
  summarizeTimetablePreviews,
} from "@/lib/assistant/timetable-previews";
import {
  PREVIEW_TIMETABLE_TOOL_NAME,
  runPreviewTimetable,
  type TimetablePreviewResult,
} from "@/lib/assistant/timetable-preview";
import type { TimetableToolDeps } from "@/lib/assistant/timetable-tools";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { McpToolError } from "@/lib/mcp/errors";
import type { GetCourseSectionsOutput } from "@/lib/mcp/schemas";
import { FIXTURE_CATALOG_SECTIONS, FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

const fixtureLookup = (code: string, instructor: string): GetCourseSectionsOutput | undefined =>
  FIXTURE_CATALOG_SECTIONS.find(
    (entry) => entry.courseCode === code.toUpperCase() && entry.instructor === instructor,
  );

const readyState = (planSections = FIXTURE_PLAN.payload.sections): TimetableState => ({
  status: "ready",
  plan: {
    name: FIXTURE_PLAN.name,
    year: 2026,
    sem: 1,
    sections: planSections,
  },
  currentTerm: { year: 2026, sem: 1 },
  otherPlansThisTerm: 0,
  localOnly: false,
  truncated: false,
  version: timetableVersion(planSections),
});

const deps = (): TimetableToolDeps => ({
  loadSections: async (input) => {
    const match = fixtureLookup(input.code, input.instructor);
    if (!match) throw new McpToolError("not_found");
    return { ...match, sectionDataComplete: true };
  },
  loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
});

function previewMessages(
  results: Array<{ id: string; result: TimetablePreviewResult }>,
): DiscussedMessage[] {
  const messages: DiscussedMessage[] = [{ role: "user", content: "Show my timetable" }];
  for (const { id, result } of results) {
    messages.push({
      role: "assistant",
      toolCalls: [{ id, function: { name: PREVIEW_TIMETABLE_TOOL_NAME, arguments: "{}" } }],
    });
    messages.push({ role: "tool", toolCallId: id, content: JSON.stringify(result) });
  }
  return messages;
}

describe("summarizeTimetablePreviews", () => {
  it("exports context metadata", () => {
    expect(TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION.length).toBeGreaterThan(0);
    expect(MAX_PREVIEWS_CONTEXT_CHARS).toBe(1200);
  });

  it("summarizes the newest ready previews first", async () => {
    const saved = await runPreviewTimetable(readyState(), {}, deps());
    const hypothetical = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    const messages = previewMessages([
      { id: "call-1", result: saved },
      { id: "call-2", result: hypothetical },
      { id: "call-3", result: saved },
    ]);
    const parsed = JSON.parse(
      summarizeTimetablePreviews(messages, timetableVersion(FIXTURE_PLAN.payload.sections)),
    );
    expect(parsed.previews).toHaveLength(2);
    expect(parsed.previews[0].id).toBe("preview-call-3");
    expect(parsed.previews[1].id).toBe("preview-call-2");
  });

  it("marks a hypothetical preview and its replacement", async () => {
    const result = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    const parsed = JSON.parse(
      summarizeTimetablePreviews(
        previewMessages([{ id: "call-hyp", result }]),
        timetableVersion(FIXTURE_PLAN.payload.sections),
      ),
    );
    expect(parsed.previews[0]).toMatchObject({
      id: "preview-call-hyp",
      kind: "hypothetical",
      added: ["MATH1010-001"],
      replaced: ["MATH1010-002"],
      stale: false,
    });
    expect(parsed.previews[0].conflictCount).toBeGreaterThanOrEqual(1);
    expect(parsed.previews[0].conflicts.length).toBe(parsed.previews[0].conflictCount);
    expect(parsed.previews[0].conflicts).toEqual(
      expect.arrayContaining(["MON CISC3014-001 / MATH1010-001 10:00-10:15"]),
    );
    expect(parsed.previews[0].changeConflictCount).toBe(1);
    expect(parsed.previews[0].changeConflicts).toEqual(
      expect.arrayContaining(["MON CISC3014-001 / MATH1010-001 10:00-10:15"]),
    );
    expect(parsed.previews[0].morningConflicts.join(" ")).toMatch(/CISC3014/);
    expect(parsed.previews[0].morningConflicts.join(" ")).toMatch(/10:00/);
    expect(parsed.previews[0].plannerVersionAtPreview).toBeTruthy();
  });

  it("marks a preview stale after the plan changes", async () => {
    const result = await runPreviewTimetable(readyState(), {}, deps());
    if (result.status !== "ready") return;
    const oldVersion = result.version!;
    const parsed = JSON.parse(
      summarizeTimetablePreviews(previewMessages([{ id: "call-old", result }]), "different-version"),
    );
    expect(parsed.previews[0].stale).toBe(true);
    expect(oldVersion).not.toBe("different-version");

    const fresh = JSON.parse(
      summarizeTimetablePreviews(previewMessages([{ id: "call-old", result }]), oldVersion),
    );
    expect(fresh.previews[0].stale).toBe(false);
  });

  it("ignores failed and needs_section results", async () => {
    const ready = await runPreviewTimetable(readyState(), {}, deps());
    const needsSection = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING" }] },
      deps(),
    );
    const messages = previewMessages([
      { id: "call-fail", result: { status: "not_found", courseCode: "X", instructor: "Y" } },
      { id: "call-needs", result: needsSection },
      { id: "call-ready", result: ready },
    ]);
    const parsed = JSON.parse(
      summarizeTimetablePreviews(messages, timetableVersion(FIXTURE_PLAN.payload.sections)),
    );
    expect(parsed.previews).toHaveLength(1);
    expect(parsed.previews[0].id).toBe("preview-call-ready");
  });

  it("stays within MAX_PREVIEWS_CONTEXT_CHARS", () => {
    const longConflict = "MON CISC3014-001 / MATH1010-001 10:00-10:15".repeat(40);
    const ready: TimetablePreviewResult = {
      status: "ready",
      kind: "saved",
      plan: { name: "Plan", year: 2026, sem: 1 },
      term: "2026/2027 AY Sem 1",
      version: "v1",
      focusDay: "MON",
      sections: [],
      replaced: [],
      partial: [],
      facts: {
        conflicts: [
          {
            day: "MON",
            a: longConflict,
            b: "MATH1010-001",
            aTime: "09:00-10:15",
            bTime: "10:00-11:15",
            overlap: "10:00-10:15",
          },
        ],
        unscheduled: Array.from({ length: 30 }, (_, index) => `COURSE${index}-001`),
        complete: false,
      },
    };
    const messages = previewMessages([
      { id: "call-heavy-1", result: ready },
      { id: "call-heavy-2", result: { ...ready, version: "v2" } },
    ]);
    const serialized = summarizeTimetablePreviews(messages, "v3");
    expect(serialized.length).toBeLessThanOrEqual(MAX_PREVIEWS_CONTEXT_CHARS);
    const parsed = JSON.parse(serialized);
    expect(parsed.previews.length).toBeLessThan(2);
  });

  it("is empty after a new chat", () => {
    expect(JSON.parse(summarizeTimetablePreviews([], null))).toEqual({ previews: [] });
  });
});
