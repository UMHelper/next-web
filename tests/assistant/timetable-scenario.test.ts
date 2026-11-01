import { describe, expect, it } from "vitest";

import { TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION } from "@/lib/assistant/timetable-previews";
import {
  PREVIEW_TIMETABLE_TOOL_NAME,
  runPreviewTimetable,
  type TimetablePreviewResult,
} from "@/lib/assistant/timetable-preview";
import {
  timetableScenarioFromRun,
  type TimetableScenarioRunInput,
} from "@/lib/assistant/timetable-scenario";
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
  extraUserMessages: string[] = [],
): TimetableScenarioRunInput["messages"] {
  const messages: TimetableScenarioRunInput["messages"] = [{ role: "user", content: "Start" }];
  for (const { id, result } of results) {
    messages.push({
      role: "assistant",
      toolCalls: [{ id, function: { name: PREVIEW_TIMETABLE_TOOL_NAME } }],
    });
    messages.push({ role: "tool", toolCallId: id, content: JSON.stringify(result) });
    messages.push({ role: "assistant", content: "Here is the preview." });
  }
  for (const text of extraUserMessages.slice(0, -1)) {
    messages.push({ role: "user", content: text });
    messages.push({ role: "assistant", content: "OK." });
  }
  const last = extraUserMessages.at(-1);
  if (last) messages.push({ role: "user", content: last });
  return messages;
}

function previewsContext(
  summaries: Array<{ id: string; kind: "saved" | "hypothetical"; stale?: boolean }>,
): TimetableScenarioRunInput["context"] {
  return [
    {
      description: TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION,
      value: JSON.stringify({
        previews: summaries.map((summary) => ({
          id: summary.id,
          kind: summary.kind,
          added: [],
          replaced: [],
          conflicts: [],
          unscheduled: [],
          stale: summary.stale ?? false,
        })),
      }),
    },
  ];
}

const plannerVersion = () => timetableVersion(FIXTURE_PLAN.payload.sections);

describe("timetableScenarioFromRun", () => {
  it("defaults to saved with no previews and empty history", () => {
    const referent = timetableScenarioFromRun({ messages: [] }, plannerVersion());
    expect(referent).toEqual({ kind: "saved", plannerVersion: plannerVersion() });
  });

  it("followup_hypo: morning conflicts after hypothetical preview → preview id", async () => {
    const hypo = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    const id = "call-hypo";
    const messages = previewMessages([{ id, result: hypo }], ["What about the morning conflicts?"]);
    const referent = timetableScenarioFromRun(
      { messages, context: previewsContext([{ id: `preview-${id}`, kind: "hypothetical" }]) },
      plannerVersion(),
    );
    expect(referent).toMatchObject({
      kind: "preview",
      previewId: "preview-call-hypo",
      previewKind: "hypothetical",
      stale: false,
    });
  });

  it("two hypothetical previews + compare question → ambiguous", async () => {
    const hypoA = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    const hypoB = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "003" }] },
      deps(),
    );
    const messages = previewMessages(
      [
        { id: "a", result: hypoA },
        { id: "b", result: hypoB },
      ],
      ["Which of those two previews has fewer morning clashes?"],
    );
    const referent = timetableScenarioFromRun(
      {
        messages,
        context: previewsContext([
          { id: "preview-b", kind: "hypothetical" },
          { id: "preview-a", kind: "hypothetical" },
        ]),
      },
      plannerVersion(),
    );
    expect(referent).toEqual({
      kind: "ambiguous",
      ask: "Which preview do you mean—the first or the second scenario?",
    });
  });

  it("explicit saved request → saved", async () => {
    const hypo = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    const messages = previewMessages([{ id: "h", result: hypo }], [
      "Show my actual saved timetable again, not the preview.",
    ]);
    const referent = timetableScenarioFromRun(
      { messages, context: previewsContext([{ id: "preview-h", kind: "hypothetical" }]) },
      plannerVersion(),
    );
    expect(referent.kind).toBe("saved");
  });

  it("manual_change: still have conflicts → saved with current planner version", () => {
    const changedVersion = "v-changed";
    const messages: TimetableScenarioRunInput["messages"] = [
      { role: "user", content: "Do I have any clashes?" },
      { role: "assistant", content: "Yes, Tuesday 10:00." },
      { role: "user", content: "Do I still have conflicts?" },
    ];
    const referent = timetableScenarioFromRun({ messages, context: [] }, changedVersion);
    expect(referent).toMatchObject({
      kind: "saved",
      plannerVersion: changedVersion,
      wording: expect.stringContaining("conflicts list"),
    });
  });

  it("stale hypothetical + explicit preview reference → preview stale", () => {
    const messages: TimetableScenarioRunInput["messages"] = [
      { role: "user", content: "What about that preview?" },
    ];
    const referent = timetableScenarioFromRun(
      {
        messages,
        context: previewsContext([{ id: "preview-old", kind: "hypothetical", stale: true }]),
      },
      plannerVersion(),
    );
    expect(referent).toMatchObject({
      kind: "preview",
      previewId: "preview-old",
      stale: true,
    });
  });

  it("new chat has no preview ids from prior session", () => {
    const referent = timetableScenarioFromRun(
      { messages: [{ role: "user", content: "Any clashes?" }], context: [] },
      plannerVersion(),
    );
    expect(referent.kind).toBe("saved");
  });

  it("ambiguous this schedule with two previews", () => {
    const referent = timetableScenarioFromRun(
      {
        messages: [{ role: "user", content: "Does this schedule work on Wednesday?" }],
        context: previewsContext([
          { id: "preview-2", kind: "hypothetical" },
          { id: "preview-1", kind: "saved" },
        ]),
      },
      plannerVersion(),
    );
    expect(referent.kind).toBe("ambiguous");
  });

  it("saved preview follow-up about a weekday → saved digest", async () => {
    const saved = await runPreviewTimetable(readyState(), {}, deps());
    const messages = previewMessages([{ id: "saved", result: saved }], ["What about Wednesday?"]);
    const referent = timetableScenarioFromRun(
      { messages, context: previewsContext([{ id: "preview-saved", kind: "saved" }]) },
      plannerVersion(),
    );
    expect(referent.kind).toBe("saved");
  });
});
