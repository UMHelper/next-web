import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import { getCourseGroupCodes, resolveCourseCode } from "@/lib/database/course-equivalences";
import { mergeProfRows, pickBestProfRow } from "@/lib/database/prof-merge";
import type { ProfWithCourseRow } from "@/lib/database/types";
import supabaseServer from "@/lib/supabase/server";

export class ReviewMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewMappingError";
  }
}

/**
 * Reads span the whole equivalence group. Historical comments live on the old
 * code's `prof_with_course` row while current timetable/offered state may live
 * on the new code's row; `pickBestProfRow` chooses the review row and merges the
 * offered flag.
 */
export const lookupReviewMapping = unstable_cache(
  async (code: string, prof: string): Promise<ProfWithCourseRow | null> => {
    const primary = await resolveCourseCode(code);
    const group = await getCourseGroupCodes(primary);
    const normalizedProf = prof.replaceAll("%20", " ").replaceAll("%24", "/");

    const { data, error } = await supabaseServer
      .from("prof_with_course")
      .select("*")
      .in("course_id", group)
      .eq("prof_id", normalizedProf);

    if (error) {
      throw new ReviewMappingError(error.message);
    }

    const rows = (data ?? []) as ProfWithCourseRow[];
    return rows.length > 0 ? pickBestProfRow(rows, primary) : null;
  },
  ["review-info"],
  { revalidate: 300, tags: [CACHE_TAGS.course, CACHE_TAGS.professor] },
);

export async function getReviewInfo(code: string, prof: string): Promise<ProfWithCourseRow | null> {
  try {
    return await lookupReviewMapping(code, prof);
  } catch (error) {
    if (error instanceof ReviewMappingError) {
      console.error("[getReviewInfo] query failed:", error.message);
      return null;
    }
    throw error;
  }
}

export const getProfListByCourse = unstable_cache(
  async (code: string): Promise<ProfWithCourseRow[]> => {
    const primary = await resolveCourseCode(code);
    const group = await getCourseGroupCodes(primary);

    const { data, error } = await supabaseServer
      .from("prof_with_course")
      .select("*")
      .in("course_id", group);

    if (error) {
      console.error("[getProfListByCourse] query failed:", error.message);
      return [];
    }

    return mergeProfRows((data ?? []) as ProfWithCourseRow[], primary);
  },
  ["course-prof-list"],
  { revalidate: 3600, tags: [CACHE_TAGS.course, CACHE_TAGS.professor] },
);
