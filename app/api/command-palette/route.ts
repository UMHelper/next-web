import { NextResponse, type NextRequest } from "next/server";

import { fuzzySearch } from "@/lib/database/get-fuzzy-search";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function text(row: Row, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function courseFromRow(row: Row) {
  const code = text(row, ["New_code", "course_code", "courseCode"]);
  if (!code) return null;
  return {
    code: code.toUpperCase(),
    titleEn: text(row, ["courseTitleEng", "course_title_eng", "titleEn"]),
    titleZh: text(row, ["courseTitleChi", "course_title_chi", "titleZh"]),
    faculty: text(row, ["Offering_Unit", "offering_unit", "faculty"]),
    department: text(row, ["Offering_Department", "offering_department", "department"]),
    credits: text(row, ["Credits", "credits"]),
  };
}

function instructorFromRow(row: Row) {
  const name = text(row, ["prof_name", "prof_id", "name"]);
  if (!name) return null;
  const list = Array.isArray(row.course_list) ? (row.course_list as Row[]) : [];
  return {
    name,
    courseCount: list.length,
    sampleCourse: list.length ? text(list[0], ["courseCode", "New_code", "course_code"]) : null,
  };
}

/**
 * Lightweight public search used by the command palette. It intentionally
 * mirrors the site's existing fuzzy search RPC and returns only the fields the
 * palette renders; full course/professor data stays on the normal pages.
 */
export async function GET(request: NextRequest) {
  const raw = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const query = raw.slice(0, 80);

  if (!query) {
    return NextResponse.json({ courses: [], instructors: [] });
  }

  try {
    const [courseRows, instructorRows] = await Promise.all([
      fuzzySearch(query, "course"),
      fuzzySearch(query, "instructor"),
    ]);

    const courses = (Array.isArray(courseRows) ? courseRows : [])
      .map(courseFromRow)
      .filter((course): course is NonNullable<typeof course> => course !== null)
      .slice(0, 6);

    const instructors = (Array.isArray(instructorRows) ? instructorRows : [])
      .map(instructorFromRow)
      .filter((instructor): instructor is NonNullable<typeof instructor> => instructor !== null)
      .slice(0, 6);

    return NextResponse.json(
      { courses, instructors },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (error) {
    console.error("[api/command-palette] failed:", error);
    return NextResponse.json({ courses: [], instructors: [] }, { status: 200 });
  }
}
