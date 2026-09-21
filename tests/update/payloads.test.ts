import { describe, expect, it } from "vitest";

import type { ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";
import {
  buildApplySchedulePayload,
  buildOfferedCourseInserts,
  uniqueCourseCodes,
} from "@/lib/update/payloads";

const row: ScheduleRow = {
  offeringUnit: "FBA",
  offeringDept: "AIM",
  code: "ACCT1000",
  title: "ACCOUNTING",
  section: "1",
  mediumInstruction: "English",
  teacherRaw: "CHAN Tai Man / Wáng Wei",
  day: "MON",
  times: "09:00-10:15",
  location: "E11-101",
};

describe("uniqueCourseCodes", () => {
  it("uppercases and dedupes", () => {
    expect(uniqueCourseCodes([row, { ...row, section: "2" }])).toEqual(["ACCT1000"]);
  });
});

describe("buildApplySchedulePayload", () => {
  it("emits one entry per professor and dedupes", () => {
    const payload = buildApplySchedulePayload([row, row], 2026, 1);

    expect(payload).toEqual({
      year: 2026,
      sem: 1,
      rows: [
        { code: "ACCT1000", prof: "CHAN Tai Man", section: "1", day: "MON", times: "09:00-10:15", location: "E11-101" },
        { code: "ACCT1000", prof: "Wang Wei", section: "1", day: "MON", times: "09:00-10:15", location: "E11-101" },
      ],
    });
  });

  it("skips rows without day/times/location", () => {
    const payload = buildApplySchedulePayload([{ ...row, day: null }], 2026, 1);
    expect(payload.rows).toEqual([]);
  });
});

describe("buildOfferedCourseInserts", () => {
  it("uses UM data when available and course-code fallbacks otherwise", () => {
    const um: UmCourse = {
      offeringUnit: "FBA",
      offeringDept: "AIM",
      courseTitle: "PRINCIPLES OF ACCOUNTING",
      credits: "3",
      duration: "Semester",
      mediumOfInstruction: "English",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
      suggestedYearOfStudy: 1,
      gradingSystem: "GPA",
      courseDescription: "Desc",
      ilo: "ILO",
    };

    const withUm = buildOfferedCourseInserts([row], ["ACCT1000"], new Map([["ACCT1000", um]]));
    expect(withUm[0]).toMatchObject({
      New_code: "ACCT1000",
      Offering_Unit: "FBA",
      courseTitleEng: "PRINCIPLES OF ACCOUNTING",
      Credits: "3",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
    });

    const noUm = buildOfferedCourseInserts([row], ["ACCT1000"], new Map());
    expect(noUm[0]).toMatchObject({
      New_code: "ACCT1000",
      Offering_Unit: "FBA",
      courseTitleEng: "ACCOUNTING",
      Credits: "3",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
      suggestedYearOfStudy: 1,
    });
  });
});
