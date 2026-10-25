import { describe, expect, it } from "vitest";

import { mergeProfRows, pickBestProfRow } from "@/lib/database/prof-merge";
import type { ProfWithCourseRow } from "@/lib/database/types";

function row(overrides: Partial<ProfWithCourseRow>): ProfWithCourseRow {
  return {
    id: 1,
    course_id: "CSCI1001",
    prof_id: "CHAN TAI MAN",
    result: 0,
    grade: 0,
    hard: 0,
    reward: 0,
    attendance: 0,
    comments: 0,
    is_offered: 0,
    admin_note: null,
    admin_note_en: null,
    ...overrides,
  };
}

describe("pickBestProfRow", () => {
  it("prefers the historical row with comments while merging offered state", () => {
    const oldRow = row({ id: 10, course_id: "CISC1001", comments: 7, is_offered: 0 });
    const newRow = row({ id: 20, course_id: "CSCI1001", comments: 0, is_offered: 1 });

    const picked = pickBestProfRow([newRow, oldRow], "CSCI1001");

    expect(picked.id).toBe(10);
    expect(picked.course_id).toBe("CSCI1001");
    expect(picked.comments).toBe(7);
    expect(picked.is_offered).toBe(1);
  });

  it("uses the primary row when neither side has comments", () => {
    const oldRow = row({ id: 10, course_id: "CISC1001" });
    const newRow = row({ id: 20, course_id: "CSCI1001" });

    expect(pickBestProfRow([oldRow, newRow], "CSCI1001").id).toBe(20);
  });
});

describe("mergeProfRows", () => {
  it("dedupes by professor and sorts offered rows first", () => {
    const merged = mergeProfRows(
      [
        row({ id: 1, prof_id: "OLD PROF", course_id: "CISC1001", comments: 3, is_offered: 0 }),
        row({ id: 2, prof_id: "OLD PROF", course_id: "CSCI1001", comments: 0, is_offered: 1 }),
        row({ id: 3, prof_id: "NEW PROF", course_id: "CSCI1001", comments: 0, is_offered: 0 }),
      ],
      "CSCI1001",
    );

    expect(merged.map((entry) => entry.prof_id)).toEqual(["OLD PROF", "NEW PROF"]);
    expect(merged[0]).toMatchObject({ id: 1, course_id: "CSCI1001", comments: 3, is_offered: 1 });
  });
});
