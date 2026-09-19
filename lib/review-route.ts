export type ReviewRoute = {
  code: string;
  prof: string;
  page: number;
};

function normalizeProf(segments: readonly string[]) {
  return segments.join("/").replaceAll("%2C", ",").toUpperCase();
}

function parsePositiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseReviewRoute(
  code: string,
  profSegments: readonly string[],
  searchPage?: string | string[],
): ReviewRoute {
  const pageValue = Array.isArray(searchPage) ? searchPage[0] : searchPage;
  const queryPage = parsePositiveInteger(pageValue);

  if (queryPage !== null) {
    return { code: code.toUpperCase(), prof: normalizeProf(profSegments), page: queryPage };
  }

  if (profSegments.length > 1) {
    const last = profSegments[profSegments.length - 1];
    const trailingPage = parsePositiveInteger(last);
    if (trailingPage !== null) {
      return {
        code: code.toUpperCase(),
        prof: normalizeProf(profSegments.slice(0, -1)),
        page: trailingPage,
      };
    }
  }

  return { code: code.toUpperCase(), prof: normalizeProf(profSegments), page: 1 };
}
