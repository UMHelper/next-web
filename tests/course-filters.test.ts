import { describe, expect, it } from "vitest";

import {
  COURSE_FILTER_KEYS,
  applyCourseFilters,
  createInitialFilterState,
  nextFilterState,
} from "@/lib/course-filters";

const COURSES = [
  { New_code: "COMP1001", Offering_Department: "CIS", Offering_Unit: "FST", Credits: "3", Is_Offered: 1 },
  { New_code: "COMP2001", Offering_Department: "CIS", Offering_Unit: "FST", Credits: "3", Is_Offered: 0 },
  { New_code: "ACCT1000", Offering_Department: "ACC", Offering_Unit: "FBA", Credits: "3", Is_Offered: 1 },
];

describe("course filters", () => {
  it("keeps the nine filter state dimensions in their existing order", () => {
    expect(COURSE_FILTER_KEYS).toEqual([
      "Medium_of_Instruction",
      "Offering_Department",
      "Course_Duration",
      "Credits",
      "Is_Offered",
      "Offering_Unit",
      "courseType",
      "offeringProgLevel",
      "suggestedYearOfStudy",
    ]);
  });

  it("starts with every dimension set to All", () => {
    const state = createInitialFilterState();
    expect(Object.keys(state)).toEqual([...COURSE_FILTER_KEYS]);
    expect(Object.values(state).every((value) => value === "All")).toBe(true);
  });

  it("treats All as no filtering", () => {
    expect(applyCourseFilters(COURSES, createInitialFilterState())).toHaveLength(3);
  });

  it("filters by a plain string dimension", () => {
    const state = nextFilterState(createInitialFilterState(), "Offering_Department", "CIS");
    expect(applyCourseFilters(COURSES, state).map((course) => course.New_code)).toEqual([
      "COMP1001",
      "COMP2001",
    ]);
  });

  it("maps Offered and Not Offered onto 1 and 0 for Is_Offered", () => {
    const offered = nextFilterState(createInitialFilterState(), "Is_Offered", "Offered");
    expect(offered.Is_Offered).toBe(1);
    expect(applyCourseFilters(COURSES, offered).map((course) => course.New_code)).toEqual([
      "COMP1001",
      "ACCT1000",
    ]);

    const notOffered = nextFilterState(createInitialFilterState(), "Is_Offered", "Not Offered");
    expect(notOffered.Is_Offered).toBe(0);
    expect(applyCourseFilters(COURSES, notOffered).map((course) => course.New_code)).toEqual(["COMP2001"]);
  });

  it("falls back to All when an unrecognised Is_Offered value arrives", () => {
    const offered = nextFilterState(createInitialFilterState(), "Is_Offered", "Offered");
    const bogus = nextFilterState(offered, "Is_Offered", "bogus");
    expect(bogus.Is_Offered).toBe("All");
    expect(applyCourseFilters(COURSES, bogus)).toHaveLength(3);
  });

  it("clears a dimension when All is chosen again", () => {
    const filtered = nextFilterState(createInitialFilterState(), "Offering_Department", "CIS");
    const cleared = nextFilterState(filtered, "Offering_Department", "All");
    expect(cleared.Offering_Department).toBe("All");
    expect(applyCourseFilters(COURSES, cleared)).toHaveLength(3);
  });

  it("combines dimensions with AND", () => {
    const first = nextFilterState(createInitialFilterState(), "Offering_Unit", "FST");
    const both = nextFilterState(first, "Is_Offered", "Offered");
    expect(applyCourseFilters(COURSES, both).map((course) => course.New_code)).toEqual(["COMP1001"]);
  });

  it("does not mutate the input array or the previous state", () => {
    const state = createInitialFilterState();
    const next = nextFilterState(state, "Credits", "3");
    const snapshot = [...COURSES];
    applyCourseFilters(COURSES, next);
    expect(state.Credits).toBe("All");
    expect(COURSES).toEqual(snapshot);
  });

  it("returns an empty list when nothing matches", () => {
    const state = nextFilterState(createInitialFilterState(), "Offering_Department", "NOPE");
    expect(applyCourseFilters(COURSES, state)).toEqual([]);
  });
});
