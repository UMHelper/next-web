import { describe, expect, it } from "vitest";

import { fitBadge, formatMeetingSummary } from "@/lib/assistant/discovery/fit-badge";
import type { DiscoverySectionEvidence } from "@/lib/assistant/discovery/evidence";

function evidence(
  overrides: Partial<Pick<DiscoverySectionEvidence, "fit" | "plannerVersion" | "clashWith">>,
): Pick<DiscoverySectionEvidence, "fit" | "plannerVersion" | "clashWith"> {
  return {
    fit: "verified_no_clash",
    plannerVersion: "v-live",
    clashWith: [],
    ...overrides,
  };
}

describe("fitBadge", () => {
  it("shows ok when verified and planner versions match", () => {
    expect(fitBadge(evidence({ fit: "verified_no_clash", plannerVersion: "v-live" }), "v-live")).toEqual({
      label: "No clash with saved timetable",
      tone: "ok",
    });
  });

  it("shows re-check when verified but planner version differs", () => {
    expect(fitBadge(evidence({ fit: "verified_no_clash", plannerVersion: "v-old" }), "v-live")).toEqual({
      label: "Timetable changed – ask me to re-check",
      tone: "warn",
    });
  });

  it("shows re-check when verified but live planner version is null", () => {
    expect(fitBadge(evidence({ fit: "verified_no_clash", plannerVersion: "v-old" }), null)).toEqual({
      label: "Timetable changed – ask me to re-check",
      tone: "warn",
    });
  });

  it("shows clash when confirmed and versions match", () => {
    expect(
      fitBadge(
        evidence({
          fit: "confirmed_clash",
          plannerVersion: "v-live",
          clashWith: ["GEGA1000-007"],
        }),
        "v-live",
      ),
    ).toEqual({
      label: "Clashes with GEGA1000-007",
      tone: "warn",
    });
  });

  it("shows re-check when confirmed clash but planner version differs", () => {
    expect(
      fitBadge(
        evidence({
          fit: "confirmed_clash",
          plannerVersion: "v-old",
          clashWith: ["GEGA1000-007"],
        }),
        "v-live",
      ),
    ).toEqual({
      label: "Timetable changed – ask me to re-check",
      tone: "warn",
    });
  });

  it("shows incomplete regardless of planner version", () => {
    expect(fitBadge(evidence({ fit: "incomplete" }), "v-live")).toEqual({
      label: "Class times incomplete",
      tone: "muted",
    });
    expect(fitBadge(evidence({ fit: "incomplete", plannerVersion: "v-old" }), null)).toEqual({
      label: "Class times incomplete",
      tone: "muted",
    });
  });

  it("returns null for not_checked", () => {
    expect(fitBadge(evidence({ fit: "not_checked" }), "v-live")).toBeNull();
    expect(fitBadge(evidence({ fit: "not_checked" }), null)).toBeNull();
  });
});

describe("formatMeetingSummary", () => {
  it("groups identical time ranges across days", () => {
    expect(formatMeetingSummary(["TUE 11:30-12:45", "FRI 11:30-12:45"])).toBe(
      "TUE, FRI 11:30–12:45",
    );
  });

  it("keeps different time ranges separate", () => {
    expect(formatMeetingSummary(["TUE 11:30-12:45", "FRI 09:00-10:15"])).toBe(
      "TUE 11:30–12:45 · FRI 09:00–10:15",
    );
  });
});
