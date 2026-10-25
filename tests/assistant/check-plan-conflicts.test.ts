import { describe, expect, it, vi } from "vitest";

import { bindCourseToolArgs } from "@/lib/assistant/course-referent";
import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
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
    if (!match) throw new McpToolError("not_found");
    return match;
  },
  loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
  ...overrides,
});

describe("runCheckPlanConflicts", () => {
  it("reports sectionListComplete false when the section list was incomplete", async () => {
    const sections = fixtureLookup("MATH1010", "HO SIU MING")!;
    await expect(
      runCheckPlanConflicts(
        readyState(),
        { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
        deps({
          loadSections: async () => ({ ...sections, sectionDataComplete: false }),
        }),
      ),
    ).resolves.toMatchObject({ status: "checked", sectionListComplete: false });
  });

  it("checks a named section and reports the overlap", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps(),
    );
    expect(result).toMatchObject({
      status: "checked",
      courseCode: "MATH1010",
      instructor: "HO SIU MING",
      planComplete: false,
      sections: [
        {
          section: "001",
          replaces: "MATH1010-002",
          complete: true,
          conflicts: [{ with: "CISC3014-001", day: "MON", overlap: "10:00-10:15" }],
        },
      ],
    });
  });

  it("does not count end-to-start as a conflict", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "ECON1001", instructor: "CHEUNG WAI", section: "002" },
      deps(),
    );
    expect(result).toMatchObject({
      status: "checked",
      sections: [{ section: "002", conflicts: [], complete: true }],
    });
  });

  it("checks every section when section is omitted", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING" },
      deps(),
    );
    expect(result).toMatchObject({ status: "checked" });
    if (result.status !== "checked") return;
    expect(result.sections.map((entry) => entry.section)).toEqual(["001", "002", "003"]);
  });

  it("never calls a weekend-only section conflict-free", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "003" },
      deps(),
    );
    expect(result).toMatchObject({
      status: "checked",
      sections: [
        {
          section: "003",
          complete: false,
          meetings: ["SAT 09:00-12:00 E22-3001"],
          conflicts: [],
        },
      ],
    });
  });

  it("marks a section with no catalog times incomplete", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps({
        loadSections: async () => ({
          courseCode: "MATH1010",
          instructor: "HO SIU MING",
          courseUrl: "https://umeh.top/course/MATH1010",
          sections: [{ section: "001", courseUrl: "https://umeh.top/course/MATH1010", schedules: [] }],
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "checked",
      sections: [{ section: "001", complete: false, meetings: [], conflicts: [] }],
    });
  });

  it("reports planComplete false and the unscheduled saved sections", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps(),
    );
    expect(result).toMatchObject({
      status: "checked",
      planComplete: false,
      unscheduled: ["GEND1001-001"],
    });
  });

  it.each(["no_plan", "loading", "unavailable"] as const)("returns no_timetable for %s", async (timetable) => {
    const state: TimetableState =
      timetable === "no_plan"
        ? { status: "no_plan", currentTerm: { year: 2026, sem: 1 } }
        : { status: timetable };
    const result = await runCheckPlanConflicts(
      state,
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps(),
    );
    expect(result).toEqual({ status: "no_timetable", timetable });
  });

  it("returns term_mismatch for a plan from another term", async () => {
    const result = await runCheckPlanConflicts(
      readyState(FIXTURE_PLAN.payload.sections, { year: 2025, sem: 2 }),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps(),
    );
    expect(result).toEqual({
      status: "term_mismatch",
      planTerm: "2025/2026 AY Sem 2",
      catalogTerm: "2026/2027 AY Sem 1",
    });
  });

  it("returns not_found for an unknown section or offering", async () => {
    await expect(
      runCheckPlanConflicts(
        readyState(),
        { code: "MATH1010", instructor: "HO SIU MING", section: "099" },
        deps(),
      ),
    ).resolves.toEqual({ status: "not_found" });

    await expect(
      runCheckPlanConflicts(
        readyState(),
        { code: "MATH1010", instructor: "NOBODY", section: "001" },
        deps(),
      ),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns temporarily_unavailable when loading throws", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps({
        loadSections: async () => {
          throw new Error("HTTP 500");
        },
      }),
    );
    expect(result).toEqual({ status: "temporarily_unavailable" });
  });

  it("returns temporarily_unavailable when catalog term loading throws", async () => {
    const result = await runCheckPlanConflicts(
      readyState(),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps({
        loadCatalogTerm: async () => {
          throw new Error("catalog down");
        },
      }),
    );
    expect(result).toEqual({ status: "temporarily_unavailable" });
  });

  it("returns invalid_request for bad arguments", async () => {
    const result = await runCheckPlanConflicts(readyState(), { code: "" }, deps());
    expect(result).toEqual({ status: "invalid_request" });
  });

  it("binds the page course like the other course tools", async () => {
    const loadSections = vi.fn(async () => fixtureLookup("MATH1010", "HO SIU MING")!);
    const bound = bindCourseToolArgs(
      { kind: "page", courseCode: "MATH1010" },
      "check_plan_conflicts",
      { code: "CISC2001", instructor: "HO SIU MING", section: "001" },
    );
    expect(bound.action).toBe("rewrite");
    if (bound.action !== "rewrite") return;
    await runCheckPlanConflicts(readyState(), bound.args, deps({ loadSections }));
    expect(loadSections).toHaveBeenCalledWith({ code: "MATH1010", instructor: "HO SIU MING" });
  });

  it("checks an empty saved plan without claiming completeness it lacks", async () => {
    const result = await runCheckPlanConflicts(
      readyState([]),
      { code: "MATH1010", instructor: "HO SIU MING", section: "001" },
      deps(),
    );
    expect(result).toMatchObject({
      status: "checked",
      planComplete: true,
      sections: [{ section: "001", conflicts: [] }],
    });
  });
});

describe("checkPlanConflictsParameters", () => {
  it("requires code and instructor; section is optional", () => {
    expect(checkPlanConflictsParameters.safeParse({ code: "MATH1010", instructor: "HO" }).success).toBe(true);
    expect(checkPlanConflictsParameters.safeParse({ code: "MATH1010", instructor: "HO", section: "001" }).success).toBe(
      true,
    );
    expect(checkPlanConflictsParameters.safeParse({ code: "MATH1010" }).success).toBe(false);
  });
});
