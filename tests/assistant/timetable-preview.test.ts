import { describe, expect, it } from "vitest";

import {
  parseTimetablePreviewResult,
  previewTimetableParameters,
  runPreviewTimetable,
  timetablePreviewResultSchema,
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

const readyState = (planSections = FIXTURE_PLAN.payload.sections, planTerm = { year: 2026, sem: 1 }): TimetableState => ({
  status: "ready",
  plan: {
    name: FIXTURE_PLAN.name,
    year: planTerm.year,
    sem: planTerm.sem,
    sections: planSections,
  },
  currentTerm: { year: 2026, sem: 1 },
  otherPlansThisTerm: 0,
  localOnly: false,
  truncated: false,
  version: timetableVersion(planSections),
});

const deps = (overrides?: Partial<TimetableToolDeps>): TimetableToolDeps => ({
  loadSections: async (input) => {
    const match = fixtureLookup(input.code, input.instructor);
    if (!match) throw new McpToolError("not_found", "missing");
    return match;
  },
  loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
  ...overrides,
});

describe("runPreviewTimetable", () => {
  it("previews the saved timetable focused on the first conflict day", async () => {
    const result = await runPreviewTimetable(readyState(), {}, deps());
    expect(result).toMatchObject({
      status: "ready",
      kind: "saved",
      focusDay: "TUE",
      version: timetableVersion(FIXTURE_PLAN.payload.sections),
    });
    if (result.status !== "ready") return;
    expect(result.sections).toHaveLength(5);
    expect(result.sections.every((section) => section.origin === "saved")).toBe(true);
  });

  it("honours a valid focusDay", async () => {
    const result = await runPreviewTimetable(readyState(), { focusDay: "THU" }, deps());
    expect(result).toMatchObject({ status: "ready", focusDay: "THU" });
  });

  it("adds a section and replaces the same course in the preview only", async () => {
    const planSnapshot = structuredClone(FIXTURE_PLAN);
    const result = await runPreviewTimetable(
      readyState(planSnapshot.payload.sections),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    expect(planSnapshot).toEqual(FIXTURE_PLAN);
    expect(result).toMatchObject({
      status: "ready",
      kind: "hypothetical",
      replaced: ["MATH1010-002"],
    });
    if (result.status !== "ready") return;
    const added = result.sections.find((section) => section.origin === "added");
    expect(added?.section).toBe("001");
    expect(added?.replaces).toBe("MATH1010-002");
    expect(result.facts.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ a: "CISC3014-001", b: "MATH1010-001", overlap: "10:00-10:15" }),
      ]),
    );
  });

  it("asks for a section instead of choosing one", async () => {
    const result = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING" }] },
      deps(),
    );
    expect(result).toMatchObject({
      status: "needs_section",
      courseCode: "MATH1010",
      instructor: "HO SIU MING",
      options: [
        { section: "001", meetings: ["MON 09:00-10:15 E22-3001", "WED 09:00-10:15 E22-3001"] },
        { section: "002", meetings: ["MON 14:00-15:15 E22-3001", "WED 14:00-15:15 E22-3001"] },
        { section: "003", meetings: ["SAT 09:00-12:00 E22-3001"] },
      ],
    });
  });

  it("previews a single-section course without asking", async () => {
    const singleSection: GetCourseSectionsOutput = {
      courseCode: "STAT1001",
      instructor: "LEE KA",
      courseUrl: "https://umeh.top/course/STAT1001",
      sections: [
        {
          section: "001",
          courseUrl: "https://umeh.top/course/STAT1001",
          schedules: [{ weekday: "FRI", startTime: "09:00", endTime: "10:15", location: "E11-1001" }],
        },
      ],
    };
    const result = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "STAT1001", instructor: "LEE KA" }] },
      deps({
        loadSections: async () => singleSection,
      }),
    );
    expect(result).toMatchObject({ status: "ready", kind: "hypothetical" });
    if (result.status !== "ready") return;
    expect(result.sections.some((section) => section.courseCode === "STAT1001" && section.origin === "added")).toBe(
      true,
    );
  });

  it("marks weekend catalog meetings as partial", async () => {
    const result = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "003" }] },
      deps(),
    );
    expect(result).toMatchObject({
      status: "ready",
      partial: ["MATH1010-003"],
      facts: { complete: false },
    });
  });

  it("previews additions alone when there is no saved plan", async () => {
    const state: TimetableState = { status: "no_plan", currentTerm: { year: 2026, sem: 1 } };
    const result = await runPreviewTimetable(
      state,
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    expect(result).toMatchObject({
      status: "ready",
      kind: "hypothetical",
      plan: null,
      version: null,
      term: "2026/2027 AY Sem 1",
    });
  });

  it.each(["loading", "unavailable"] as const)("refuses to preview while the timetable is %s", async (timetable) => {
    const state: TimetableState = { status: timetable };
    const result = await runPreviewTimetable(
      state,
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    expect(result).toEqual({ status: "no_timetable", timetable });
  });

  it("returns no_timetable for a saved preview with no plan", async () => {
    const state: TimetableState = { status: "no_plan", currentTerm: { year: 2026, sem: 1 } };
    const result = await runPreviewTimetable(state, {}, deps());
    expect(result).toEqual({ status: "no_timetable", timetable: "no_plan" });
  });

  it("returns term_mismatch for a plan in another term", async () => {
    const result = await runPreviewTimetable(
      readyState(FIXTURE_PLAN.payload.sections, { year: 2025, sem: 2 }),
      {},
      deps(),
    );
    expect(result).toEqual({
      status: "term_mismatch",
      planTerm: "2025/2026 AY Sem 2",
      catalogTerm: "2026/2027 AY Sem 1",
    });
  });

  it("rejects more than three additions", async () => {
    const result = await runPreviewTimetable(
      readyState(),
      {
        add: [
          { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
          { code: "MATH1010", instructor: "HO SIU MING", section: "002" },
          { code: "MATH1010", instructor: "HO SIU MING", section: "003" },
          { code: "ECON1001", instructor: "CHEUNG WAI", section: "001" },
        ],
      },
      deps(),
    );
    expect(result).toEqual({ status: "invalid_request" });
  });

  it("round-trips every result through timetablePreviewResultSchema", async () => {
    const cases = [
      await runPreviewTimetable(readyState(), {}, deps()),
      await runPreviewTimetable(readyState(), { focusDay: "MON" }, deps()),
      await runPreviewTimetable(
        readyState(),
        { add: [{ code: "MATH1010", instructor: "HO SIU MING" }] },
        deps(),
      ),
      await runPreviewTimetable({ status: "loading" }, {}, deps()),
      await runPreviewTimetable(
        readyState(FIXTURE_PLAN.payload.sections, { year: 2025, sem: 2 }),
        {},
        deps(),
      ),
      await runPreviewTimetable(
        readyState(),
        { add: [{ code: "MATH1010", instructor: "NOBODY", section: "001" }] },
        deps(),
      ),
      { status: "invalid_request" as const },
      { status: "temporarily_unavailable" as const },
    ];
    for (const value of cases) {
      expect(timetablePreviewResultSchema.parse(value)).toEqual(value);
    }
  });
});

describe("parseTimetablePreviewResult", () => {
  it("parses malformed content as malformed", () => {
    expect(parseTimetablePreviewResult("{not json")).toEqual({ kind: "malformed" });
    expect(parseTimetablePreviewResult('{"status":"ready","extra":1}')).toEqual({ kind: "malformed" });
  });
});

describe("previewTimetableParameters", () => {
  it("allows up to three additions", () => {
    expect(
      previewTimetableParameters.safeParse({
        add: [
          { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
          { code: "MATH1010", instructor: "HO SIU MING", section: "002" },
          { code: "MATH1010", instructor: "HO SIU MING", section: "003" },
        ],
      }).success,
    ).toBe(true);
  });
});
