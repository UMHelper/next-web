import { describe, expect, it } from "vitest";

import { buildSectionCandidates } from "@/lib/assistant/discovery/sections";
import { makeSectionKey } from "@/lib/timetable/schema";

import { offer, pool, pwcRow } from "../fixtures/discovery-pool";

describe("buildSectionCandidates co-taught sections", () => {
  it("merges identical section offers into one candidate with unioned instructors", () => {
    const discoveryPool = pool({
      instructorRows: [
        pwcRow({ pwcId: 1, courseCode: "GEST1000", instructor: "ALICE WONG" }),
        pwcRow({ pwcId: 2, courseCode: "GEST1000", instructor: "BOB CHAN" }),
      ],
      offers: [
        offer(1, "001", ["MON 10:00-11:15", "WED 10:00-11:15"]),
        offer(2, "001", ["MON 10:00-11:15", "WED 10:00-11:15"]),
      ],
    });

    const candidates = buildSectionCandidates(discoveryPool);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.instructors).toHaveLength(2);
    expect(candidates[0]?.meetingLines).toEqual([
      "MON 10:00-11:15",
      "WED 10:00-11:15",
    ]);
    expect(candidates[0]?.meetingsComplete).toBe(true);
  });
});

describe("buildSectionCandidates multiple sections", () => {
  it("returns one candidate per section of the same course", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 10, courseCode: "CISC2001", instructor: "LEE" })],
      offers: [
        offer(10, "001", ["MON 10:00-11:15"]),
        offer(10, "002", ["TUE 11:30-12:45"]),
      ],
    });

    const candidates = buildSectionCandidates(discoveryPool);
    expect(candidates.map((entry) => entry.section)).toEqual(["001", "002"]);
  });
});

describe("buildSectionCandidates meeting parsing", () => {
  it("skips unparseable times and marks meetings incomplete", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "ECON1001" })],
      offers: [
        offer(1, "001", [
          "MON 10:00-11:15",
          "WED TBA",
          "FRI 14:00-15:15",
        ]),
      ],
    });

    const [candidate] = buildSectionCandidates(discoveryPool);
    expect(candidate?.meetingsComplete).toBe(false);
    expect(candidate?.meetingLines).toEqual(["MON 10:00-11:15", "FRI 14:00-15:15"]);
  });

  it("returns empty meetings when an offer lists none", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "MATH1010" })],
      offers: [offer(1, "001", [])],
    });

    const [candidate] = buildSectionCandidates(discoveryPool);
    expect(candidate?.meetings).toEqual([]);
    expect(candidate?.meetingsComplete).toBe(false);
  });

  it("keeps Saturday meetings but marks the section incomplete for the planner", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "GEST1000" })],
      offers: [offer(1, "001", ["SAT 10:00-11:15"])],
    });

    const [candidate] = buildSectionCandidates(discoveryPool);
    expect(candidate?.meetings).toEqual([{ day: "SAT", start: "10:00", end: "11:15" }]);
    expect(candidate?.meetingsComplete).toBe(false);
  });

  it("zero-pads single-digit hour times", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "GEST1000" })],
      offers: [offer(1, "001", ["MON 8:30-9:45"])],
    });

    const [candidate] = buildSectionCandidates(discoveryPool);
    expect(candidate?.meetings[0]).toMatchObject({ start: "08:30", end: "09:45" });
    expect(candidate?.meetingLines[0]).toBe("MON 08:30-09:45");
  });
});

describe("buildSectionCandidates offer filtering", () => {
  it("ignores offers with no matching instructor row", () => {
    const discoveryPool = pool({
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "GEST1000" })],
      offers: [offer(99, "001", ["MON 10:00-11:15"])],
    });

    expect(buildSectionCandidates(discoveryPool)).toEqual([]);
  });
});

describe("buildSectionCandidates normalization", () => {
  it("normalizes section labels and plan keys from the first instructor", () => {
    const discoveryPool = pool({
      instructorRows: [
        pwcRow({ pwcId: 1, courseCode: "GEST1000", instructor: "WONG KA KI" }),
        pwcRow({ pwcId: 2, courseCode: "GEST1000", instructor: "CHAN TAI MAN" }),
      ],
      offers: [offer(1, " 001 ", ["MON 10:00-11:15"])],
    });

    const [candidate] = buildSectionCandidates(discoveryPool);
    expect(candidate?.section).toBe("001");
    expect(candidate?.label).toBe("GEST1000-001");
    expect(candidate?.planSection.key).toBe(makeSectionKey("GEST1000", "WONG KA KI", "001"));
  });
});

describe("buildSectionCandidates ordering", () => {
  it("sorts by course code then section", () => {
    const discoveryPool = pool({
      instructorRows: [
        pwcRow({ pwcId: 1, courseCode: "GEST1000" }),
        pwcRow({ pwcId: 2, courseCode: "CISC2001" }),
      ],
      offers: [
        offer(2, "002", ["MON 10:00-11:15"]),
        offer(1, "002", ["TUE 10:00-11:15"]),
        offer(2, "001", ["WED 10:00-11:15"]),
      ],
    });

    const labels = buildSectionCandidates(discoveryPool).map((entry) => entry.label);
    expect(labels).toEqual(["CISC2001-001", "CISC2001-002", "GEST1000-002"]);
  });
});
