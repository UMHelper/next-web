import { splitProfNames } from "@/lib/update/prof-name";
import type { ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";

export function uniqueCourseCodes(rows: ScheduleRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.code.trim().toUpperCase()).filter(Boolean)));
}

function firstRowByCode(rows: ScheduleRow[]): Map<string, ScheduleRow> {
  const map = new Map<string, ScheduleRow>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (code && !map.has(code)) map.set(code, row);
  }
  return map;
}

export function buildOfferedCourseInserts(
  rows: ScheduleRow[],
  missingCodes: string[],
  umCache: Map<string, UmCourse | null>,
): Record<string, unknown>[] {
  const byCode = firstRowByCode(rows);

  return missingCodes.map((rawCode) => {
    const code = rawCode.trim().toUpperCase();
    const row = byCode.get(code);
    const um = umCache.get(code) ?? null;
    const yearDigit = Number(code[4]);
    const suggested = um?.suggestedYearOfStudy ?? (Number.isFinite(yearDigit) ? yearDigit : null);

    return {
      New_code: code,
      Offering_Unit: um?.offeringUnit || row?.offeringUnit || "",
      Offering_Department: um?.offeringDept || row?.offeringDept || "",
      Old_code: "",
      courseTitleEng: um?.courseTitle || row?.title || "",
      courseTitleChi: "",
      Credits: um?.credits || "3",
      Course_Duration: um?.duration || "Semester Course",
      Medium_of_Instruction: um?.mediumOfInstruction || row?.mediumInstruction || "",
      offeringProgLevel: um?.offeringProgLevel || (yearDigit >= 7 ? "PG" : "UG"),
      courseType: um?.courseType || (code.startsWith("GE") ? "GE" : "Non-GE"),
      suggestedYearOfStudy: suggested,
      gradingSystem: um?.gradingSystem || "Letter Grade",
      courseDescription: um?.courseDescription || "",
      ilo: um?.ilo || "",
    };
  });
}

export type ApplyRow = {
  code: string;
  prof: string;
  section: string;
  day: string;
  times: string;
  location: string;
};

export function buildApplySchedulePayload(rows: ScheduleRow[], year: number, sem: number) {
  const seen = new Set<string>();
  const out: ApplyRow[] = [];

  for (const row of rows) {
    if (!row.day || !row.times || !row.location) continue;

    for (const prof of splitProfNames(row.teacherRaw)) {
      const entry: ApplyRow = {
        code: row.code.trim().toUpperCase(),
        prof,
        section: row.section,
        day: row.day,
        times: row.times,
        location: row.location,
      };
      const key = [entry.code, entry.prof, entry.section, entry.day, entry.times, entry.location].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }

  return { year, sem, rows: out };
}
