type CourseSearchRow = {
  New_code?: unknown;
  equivalent_codes?: unknown;
};

function courseCodes(course: CourseSearchRow): string[] {
  const codes: string[] = [];
  if (typeof course.New_code === "string" && course.New_code.trim()) {
    codes.push(course.New_code.trim().toUpperCase());
  }
  if (Array.isArray(course.equivalent_codes)) {
    for (const code of course.equivalent_codes) {
      if (typeof code === "string" && code.trim()) codes.push(code.trim().toUpperCase());
    }
  }
  return Array.from(new Set(codes));
}

function rank(course: CourseSearchRow, keyword: string) {
  const codes = courseCodes(course);
  const exact = codes.includes(keyword);
  const matching = codes.filter((code) => code.startsWith(keyword)).sort();
  return {
    exact,
    prefix: matching.length > 0,
    matched: matching[0] ?? codes[0] ?? "",
  };
}

/**
 * Sort search results by the code that actually matched the query.
 *
 * A renamed course is returned under its new primary code, but if the user
 * typed the historical code (for example CISC1001) it should appear in the
 * CISC sequence rather than at the end of the CSCI block. This keeps
 * "CISC1001 a.k.a." discoverable without duplicating the course card.
 */
export function sortCourseSearchResults<T extends CourseSearchRow>(courses: T[], keyword: string): T[] {
  const normalized = keyword.trim().toUpperCase();
  if (!normalized) return courses;

  return [...courses].sort((a, b) => {
    const rankA = rank(a, normalized);
    const rankB = rank(b, normalized);

    if (rankA.exact !== rankB.exact) return rankA.exact ? -1 : 1;
    if (rankA.prefix !== rankB.prefix) return rankA.prefix ? -1 : 1;

    const byMatched = rankA.matched.localeCompare(rankB.matched);
    if (byMatched !== 0) return byMatched;

    return String(a.New_code ?? "").localeCompare(String(b.New_code ?? ""));
  });
}
