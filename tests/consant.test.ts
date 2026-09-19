import { describe, expect, it } from "vitest";
import { GE_COURSE_SLUG, faculty, faculty_dept, getFacultyLabel, normalizeFacultySlug } from "@/lib/consant";

describe("catalog faculty slugs", () => {
  it("uses a canonical GE course slug", () => {
    expect(GE_COURSE_SLUG).toBe("gecourse");
    expect(faculty).toContain(GE_COURSE_SLUG);
    expect(faculty).not.toContain("GE Course");
    expect(faculty_dept[GE_COURSE_SLUG]).toEqual(["GEGA", "GESB", "GEST", "GELH"]);
  });

  it("normalizes old GE variants", () => {
    expect(normalizeFacultySlug("GE Course")).toBe("gecourse");
    expect(normalizeFacultySlug("GECourse")).toBe("gecourse");
    expect(normalizeFacultySlug("gecourse")).toBe("gecourse");
    expect(normalizeFacultySlug("fba")).toBe("FBA");
  });

  it("renders a display label", () => {
    expect(getFacultyLabel("gecourse")).toBe("GE Course");
    expect(getFacultyLabel("FBA")).toBe("FBA");
  });
});
