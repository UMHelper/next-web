import type { ProfWithCourseRow } from "@/lib/database/types";

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOffered(value: unknown): number {
  return value === true ? 1 : count(value) > 0 ? 1 : 0;
}

/**
 * A course group can contain several `prof_with_course` rows for one professor
 * (the historical code row holds comments, the new code row holds the current
 * timetable). The review UI can only key off one row id, so prefer the row with
 * the most comments, then the offered row, then the primary row. `is_offered`
 * is still combined across the whole group.
 */
export function pickBestProfRow(rows: ProfWithCourseRow[], primary: string): ProfWithCourseRow {
  const best = [...rows].sort((a, b) => {
    const byComments = count(b.comments) - count(a.comments);
    if (byComments !== 0) return byComments;

    const byOffered = isOffered(b.is_offered) - isOffered(a.is_offered);
    if (byOffered !== 0) return byOffered;

    const aPrimary = String(a.course_id) === primary ? 1 : 0;
    const bPrimary = String(b.course_id) === primary ? 1 : 0;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;

    return String(a.course_id).localeCompare(String(b.course_id));
  })[0];

  const offered = rows.reduce((max, row) => Math.max(max, isOffered(row.is_offered)), 0);

  return {
    ...best,
    course_id: primary,
    is_offered: offered,
  };
}

export function mergeProfRows(rows: ProfWithCourseRow[], primary: string): ProfWithCourseRow[] {
  const byProfessor = new Map<string, ProfWithCourseRow[]>();

  for (const row of rows) {
    const name = String(row.prof_id ?? "").trim();
    if (!name) continue;
    const bucket = byProfessor.get(name) ?? [];
    bucket.push(row);
    byProfessor.set(name, bucket);
  }

  return [...byProfessor.values()]
    .map((bucket) => pickBestProfRow(bucket, primary))
    .sort((a, b) => {
      const byOffered = isOffered(b.is_offered) - isOffered(a.is_offered);
      if (byOffered !== 0) return byOffered;
      return String(a.prof_id).localeCompare(String(b.prof_id));
    });
}
