import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { normalizeDay, parseScheduleWorkbook, toHHMM } from "@/lib/update/excel";

function workbookFromRows(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const NEW_HEADER = [
  "Offering Unit", "Offering Department", "Course Code", "Course Title", "Section",
  "Course Type", "Medium of Instruction", "Notes for Course Enrolment",
  "Teacher Information", "Lecture / Lab", "Lab Information",
  "Day", "Time From", "Time To", "Classroom", "Extra",
];

const OLD_HEADER = [
  "Offering Unit", "Offering Department", "Course Code", "Course Title", "Section",
  "Course Type", "Medium of Instruction", "Notes for Course Enrolment",
  "Teacher Information", "Lecture / Lab",
  "Day", "Time From", "Time To", "Classroom", "Extra",
];

function padded(header: string[], dataRow: unknown[]): unknown[][] {
  return [[null], [null], [null], [null], [null], header, dataRow];
}

describe("toHHMM / normalizeDay", () => {
  it("normalizes strings and numbers", () => {
    expect(toHHMM("13:00")).toBe("13:00");
    expect(toHHMM("13:00:00")).toBe("13:00");
    expect(toHHMM(0.5)).toBe("12:00");
    expect(toHHMM(null)).toBeNull();
    expect(normalizeDay("Mon")).toBe("MON");
    expect(normalizeDay("TUE")).toBe("TUE");
    expect(normalizeDay("")).toBeNull();
  });
});

describe("parseScheduleWorkbook", () => {
  it("reads the new 16-column layout by header name", () => {
    const dataRow = [
      "FAH", "DAD", "GELH1012", "Art Appreciation", "1", "GE Course", "English", null,
      "NG SAU WAH", "Lecture", null, "TUE", "13:00", "14:15", "E4-G053", null,
    ];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(NEW_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows).toEqual([
      {
        offeringUnit: "FAH",
        offeringDept: "DAD",
        code: "GELH1012",
        title: "Art Appreciation",
        section: "1",
        mediumInstruction: "English",
        teacherRaw: "NG SAU WAH",
        day: "TUE",
        times: "13:00-14:15",
        location: "E4-G053",
      },
    ]);
  });

  it("reads the old 15-column layout by header name", () => {
    const dataRow = [
      "FAH", "DAD", "GELH1012", "Art Appreciation", "1", "GE Course", "English", null,
      "NG SAU WAH", "Lecture", "FRI", "09:00", "10:15", "E11-101", null,
    ];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(OLD_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows[0]).toMatchObject({ day: "FRI", times: "09:00-10:15", location: "E11-101" });
  });

  it("reads pre-enrollment files with day/time null", () => {
    const header = ["Offering Unit", "Offering Department", "Course Code", "Course Type", "Course Title", "Credit Units"];
    const dataRow = ["FBA", "AIM", "ACCT1000", "Non-GE", "PRINCIPLES OF ACCOUNTING", 3];
    const rows = parseScheduleWorkbook(workbookFromRows([[null], header, dataRow]), { mode: "pre-enrollment" });
    expect(rows).toEqual([
      {
        offeringUnit: "FBA",
        offeringDept: "AIM",
        code: "ACCT1000",
        title: "PRINCIPLES OF ACCOUNTING",
        section: "",
        mediumInstruction: "",
        teacherRaw: "",
        day: null,
        times: null,
        location: null,
      },
    ]);
  });

  it("skips rows without a course code", () => {
    const dataRow = [null, null, null, null, null, null, null, null, null, null, "MON", "09:00", "10:00", "E1", null];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(NEW_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows).toEqual([]);
  });
});
