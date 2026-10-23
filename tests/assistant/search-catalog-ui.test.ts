import { describe, expect, it } from "vitest";

import {
  SEARCH_CATALOG_TOOL_NAME,
  parseSearchCatalogResult,
  type SearchCatalogView,
} from "@/lib/assistant/search-catalog-ui";
import { SITE_URL } from "@/lib/site";

const courseUrl = `${SITE_URL}/course/ACCT1000`;
const instructorUrl = `${SITE_URL}/professor/CHAN%20TAI%20MAN`;

function coursePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "course",
    page: 1,
    hasMore: false,
    totalCount: 1,
    results: [
      {
        courseCode: "ACCT1000",
        titleEn: "Principles of Accounting I",
        titleZh: "會計學原理 I",
        faculty: "FBA",
        department: "AIM",
        credits: "3",
        isOffered: true,
        url: courseUrl,
        ...overrides,
      },
    ],
  };
}

function instructorPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "instructor",
    page: 1,
    hasMore: true,
    totalCount: 58,
    results: [
      {
        name: "CHAN TAI MAN",
        courseCount: 4,
        url: instructorUrl,
        ...overrides,
      },
    ],
  };
}

describe("SEARCH_CATALOG_TOOL_NAME", () => {
  it("matches the server tool name", () => {
    expect(SEARCH_CATALOG_TOOL_NAME).toBe("search_catalog");
  });
});

describe("parseSearchCatalogResult", () => {
  it("parses a valid course result and keeps bilingual titles", () => {
    const view = parseSearchCatalogResult(JSON.stringify(coursePayload()));
    expect(view).toEqual({
      kind: "courses",
      totalCount: 1,
      hasMore: false,
      courses: [
        {
          courseCode: "ACCT1000",
          titleEn: "Principles of Accounting I",
          titleZh: "會計學原理 I",
          faculty: "FBA",
          department: "AIM",
          credits: "3",
          isOffered: true,
          url: courseUrl,
        },
      ],
    } satisfies SearchCatalogView);
  });

  it("parses a valid instructor result", () => {
    const view = parseSearchCatalogResult(JSON.stringify(instructorPayload()));
    expect(view).toEqual({
      kind: "instructors",
      totalCount: 58,
      hasMore: true,
      instructors: [
        {
          name: "CHAN TAI MAN",
          courseCount: 4,
          url: instructorUrl,
        },
      ],
    } satisfies SearchCatalogView);
  });

  it("returns empty with searchType for course when results is empty", () => {
    const payload = { ...coursePayload(), totalCount: 0, results: [] };
    expect(parseSearchCatalogResult(JSON.stringify(payload))).toEqual({
      kind: "empty",
      searchType: "course",
    });
  });

  it("returns empty with searchType for instructor when results is empty", () => {
    const payload = { ...instructorPayload(), totalCount: 0, hasMore: false, results: [] };
    expect(parseSearchCatalogResult(JSON.stringify(payload))).toEqual({
      kind: "empty",
      searchType: "instructor",
    });
  });

  it.each([
    ["invalid_request", "invalid_request"],
    ["not_found", "not_found"],
    ["temporarily_unavailable", "temporarily_unavailable"],
  ] as const)("maps tool failure %s", (code, reason) => {
    expect(parseSearchCatalogResult(JSON.stringify({ error: code }))).toEqual({
      kind: "failure",
      reason,
    });
  });

  it("treats non-JSON Error text as malformed", () => {
    expect(parseSearchCatalogResult("Error: boom")).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it("treats empty string as malformed", () => {
    expect(parseSearchCatalogResult("")).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it("treats unknown error codes as malformed", () => {
    expect(parseSearchCatalogResult(JSON.stringify({ error: "other" }))).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it("rejects off-site course url as malformed", () => {
    const payload = coursePayload({ url: "https://evil.example/course/ACCT1000" });
    expect(parseSearchCatalogResult(JSON.stringify(payload))).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it("accepts null titleZh, faculty, department, and credits on courses", () => {
    const payload = coursePayload({
      titleZh: null,
      faculty: null,
      department: null,
      credits: null,
    });
    const view = parseSearchCatalogResult(JSON.stringify(payload));
    expect(view.kind).toBe("courses");
    if (view.kind !== "courses") return;
    expect(view.courses[0]).toMatchObject({
      titleZh: null,
      faculty: null,
      department: null,
      credits: null,
    });
  });

  it("treats missing courseCode as malformed", () => {
    const { courseCode: _removed, ...row } = coursePayload().results[0] as Record<string, unknown>;
    const payload = { ...coursePayload(), results: [row] };
    expect(parseSearchCatalogResult(JSON.stringify(payload))).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });

  it('treats type "professor" as malformed', () => {
    const payload = { ...instructorPayload(), type: "professor" };
    expect(parseSearchCatalogResult(JSON.stringify(payload))).toEqual({
      kind: "failure",
      reason: "malformed",
    });
  });
});
