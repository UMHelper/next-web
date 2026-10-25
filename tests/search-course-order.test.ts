import { describe, expect, it } from "vitest";

import { sortCourseSearchResults } from "@/lib/search-course-order";

const rows = [
  { New_code: "CISC1003", equivalent_codes: [] as string[] },
  { New_code: "CSCI1001", equivalent_codes: ["CISC1001"] },
  { New_code: "CSCI1002", equivalent_codes: ["CISC1002"] },
  { New_code: "CSCI1000", equivalent_codes: ["CISC1000"] },
];

describe("sortCourseSearchResults", () => {
  it("orders renamed courses by the historical code the user typed", () => {
    const sorted = sortCourseSearchResults(rows, "CISC");
    expect(sorted.map((row) => row.New_code)).toEqual([
      "CSCI1000",
      "CSCI1001",
      "CSCI1002",
      "CISC1003",
    ]);
  });

  it("puts an exact historical-code match first", () => {
    const sorted = sortCourseSearchResults(rows, "CISC1002");
    expect(sorted[0].New_code).toBe("CSCI1002");
  });

  it("keeps primary-code search order when the query matches CSCI", () => {
    const sorted = sortCourseSearchResults(rows, "CSCI");
    expect(sorted.map((row) => row.New_code)).toEqual([
      "CSCI1000",
      "CSCI1001",
      "CSCI1002",
      "CISC1003",
    ]);
  });

  it("leaves title-only searches in primary-code order", () => {
    const sorted = sortCourseSearchResults(rows, "Programming");
    expect(sorted.map((row) => row.New_code)).toEqual([
      "CISC1003",
      "CSCI1000",
      "CSCI1001",
      "CSCI1002",
    ]);
  });
});
