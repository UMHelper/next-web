import { describe, expect, it } from "vitest";
// @ts-ignore -- the sync script is plain ESM, not part of the TS project graph
import { buildInsertPatch, compactPatch, hasCompleteCourseInfo, mapRemoteCourseInfoToLocalPatch } from "../scripts/sync-um.mjs";

const remote = {
  courseTitle: "PRINCIPLES OF FINANCIAL ACCOUNTING",
  offeringProgLevel: "UG",
  suggestedYearOfStudy: 1,
  credits: 3,
  offeringDept: "AIM",
  offeringUnit: "FBA",
  mediumOfInstruction: "English",
  gradingSystem: "GPA",
  courseType: "Non-GE",
  duration: "Semester",
  courseDescription: "Description",
  ilo: "ILO",
};

describe("sync-um mapping", () => {
  it("maps remote fields to local course columns", () => {
    const patch = mapRemoteCourseInfoToLocalPatch(remote, {}, "acct1000");
    expect(patch).toMatchObject({
      New_code: "ACCT1000",
      courseTitleEng: "PRINCIPLES OF FINANCIAL ACCOUNTING",
      Credits: "3",
      Offering_Unit: "FBA",
      Offering_Department: "AIM",
      suggestedYearOfStudy: 1,
    });
  });

  it("detects incomplete local course rows", () => {
    expect(hasCompleteCourseInfo({})).toBe(false);
    expect(hasCompleteCourseInfo({
      courseTitleEng: "X",
      offeringProgLevel: "UG",
      Credits: "3",
      Offering_Department: "AIM",
      Offering_Unit: "FBA",
      Medium_of_Instruction: "English",
      gradingSystem: "GPA",
      courseType: "Non-GE",
      Course_Duration: "Semester",
      courseDescription: "D",
      ilo: "I",
    })).toBe(true);
  });
});

describe("sync-um required columns", () => {
  it("removes null fields before update", () => {
    expect(compactPatch({ New_code: "X", offeringProgLevel: null, Credits: "3" })).toEqual({
      New_code: "X",
      Credits: "3",
    });
  });

  it("fills NOT NULL columns for inserts", () => {
    const patch = buildInsertPatch({ courseTitleEng: "Title" }, "acct1000");
    expect(patch).toMatchObject({
      New_code: "ACCT1000",
      Old_code: "",
      Offering_Department: "",
      Offering_Unit: "",
      courseTitleChi: "",
      Credits: "",
      Course_Duration: "",
      Medium_of_Instruction: "",
      Is_Offered: 0,
      courseTitleEng: "Title",
    });
  });
});
