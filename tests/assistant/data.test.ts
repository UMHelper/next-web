import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const response: { data: unknown; error: unknown; count: number | null } = {
    data: [],
    error: null,
    count: 0,
  };
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "or", "order", "range", "abortSignal", "is", "neq", "gte", "lte"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve);
  return { response, builder, from: vi.fn(() => builder) };
});

vi.mock("@/lib/supabase/server", () => ({ default: { from: db.from } }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/lib/database/get-course-info", () => ({ getCourseInfo: vi.fn() }));
vi.mock("@/lib/database/get-prof-info", () => ({ getReviewInfo: vi.fn() }));

import { getCourseInfo } from "@/lib/database/get-course-info";
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { searchCatalog as searchCatalogBase } from "@/lib/mcp/data/search-catalog";
import { McpToolError } from "@/lib/mcp/errors";
import { getCourseText } from "@/lib/assistant/data/course-text";
import { getInstructorForAssistant } from "@/lib/assistant/data/instructor";
import { countCourseReviews } from "@/lib/assistant/data/reviews";
import {
  countCoursesForAssistant,
  sanitizeSearchTerm,
  searchCatalogForAssistant,
} from "@/lib/assistant/data/search-catalog";

const signal = new AbortController().signal;

const courseRow = {
  New_code: "ACCT1000",
  courseTitleEng: "Principles of Accounting",
  courseTitleChi: "會計學原理",
  Offering_Unit: "FBA",
  Offering_Department: "ACCT",
  Credits: "3",
  Is_Offered: 1,
};

describe("assistant catalog data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.response.data = [];
    db.response.error = null;
    db.response.count = 0;
  });

  it("sanitizes PostgREST or= delimiters out of a model search term", () => {
    expect(sanitizeSearchTerm(" database, (SQL) %_ ")).toBe("database SQL");
    expect(sanitizeSearchTerm("資料庫系統")).toBe("資料庫系統");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });

  it("delegates a plain code/title search to the controlled RPC", async () => {
    vi.mocked(searchCatalogBase).mockResolvedValue({
      type: "course",
      page: 1,
      totalCount: 1,
      hasMore: false,
      results: [
        {
          courseCode: "ACCT1000",
          titleEn: "Principles of Accounting",
          titleZh: null,
          faculty: "FBA",
          department: "ACCT",
          credits: "3",
          isOffered: true,
          url: "https://umeh.top/course/ACCT1000",
        },
      ],
    });

    const result = await searchCatalogForAssistant(
      {
        type: "course",
        query: "ACCT",
        searchIn: "code_title",
        sortBy: "code",
        sortOrder: "asc",
        limit: 20,
        page: 1,
      },
      signal,
    );

    expect(searchCatalogBase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "course", query: "ACCT", limit: 20 }),
      signal,
    );
    expect(result.totalCount).toBe(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("applies content search, exact filters, sorting and pagination directly", async () => {
    db.response.data = [courseRow];
    db.response.count = 1;

    const result = await searchCatalogForAssistant(
      {
        type: "course",
        query: "accounting",
        searchIn: "content",
        faculty: "FBA",
        credits: "3",
        offeredOnly: true,
        sortBy: "credits",
        sortOrder: "desc",
        limit: 20,
        page: 1,
      },
      signal,
    );

    expect(db.from).toHaveBeenCalledWith("course_catalog");
    expect(db.builder.eq).toHaveBeenCalledWith("Offering_Unit", "FBA");
    expect(db.builder.eq).toHaveBeenCalledWith("Credits", "3");
    expect(db.builder.eq).toHaveBeenCalledWith("Is_Offered", 1);
    expect(db.builder.or).toHaveBeenCalledWith(expect.stringContaining("courseDescription.ilike.%accounting%"));
    expect(db.builder.order).toHaveBeenCalledWith("Credits", { ascending: false });
    expect(db.builder.range).toHaveBeenCalledWith(0, 19);
    expect(result).toMatchObject({ type: "course", totalCount: 1 });
    expect(result.type === "course" ? result.results[0]?.courseCode : null).toBe("ACCT1000");
  });

  it("counts advanced-filtered courses with a head-only exact count", async () => {
    db.response.count = 7;
    db.response.data = null;

    const result = await countCoursesForAssistant(
      { query: "database", searchIn: "content", faculty: "FST" },
      signal,
    );

    expect(result).toEqual({ totalCount: 7 });
    expect(db.builder.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
    expect(db.builder.or).toHaveBeenCalledWith(expect.stringContaining("courseDescription.ilike.%database%"));
  });
});

describe("assistant course text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the description and ILO separately without the instructor list", async () => {
    vi.mocked(getCourseInfo).mockResolvedValue({
      New_code: "ACCT1000",
      courseTitleEng: "Principles of Accounting",
      courseTitleChi: "會計學原理",
      courseDescription: "Learn accounting.",
      ilo: "Explain financial statements.",
    } as never);

    await expect(getCourseText("acct1000", "description", signal)).resolves.toMatchObject({
      courseCode: "ACCT1000",
      text: "Learn accounting.",
      truncated: false,
      url: "https://umeh.top/course/ACCT1000",
    });
    await expect(getCourseText("ACCT1000", "ilo", signal)).resolves.toMatchObject({
      text: "Explain financial statements.",
    });
  });

  it("reports a missing course and truncates very long text", async () => {
    vi.mocked(getCourseInfo).mockResolvedValueOnce({} as never);
    await expect(getCourseText("NOPE", "description", signal)).rejects.toMatchObject({ code: "not_found" });

    vi.mocked(getCourseInfo).mockResolvedValueOnce({
      New_code: "ACCT1000",
      courseTitleEng: "Principles of Accounting",
      courseTitleChi: null,
      courseDescription: "a".repeat(6_001),
      ilo: null,
    } as never);

    const result = await getCourseText("ACCT1000", "description", signal);
    expect(result.text).toHaveLength(6_000);
    expect(result.truncated).toBe(true);
  });
});

describe("assistant instructor data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.response.error = null;
  });

  it("applies rating filters, sorting and pagination", async () => {
    db.response.data = [
      {
        course_id: "ACCT1000",
        prof_id: "CHAN TAI MAN",
        result: 4.2,
        grade: 4,
        hard: 3.1,
        reward: 4.5,
        attendance: 3.8,
        comments: 5,
        is_offered: 1,
      },
    ];
    db.response.count = 1;

    const result = await getInstructorForAssistant(
      {
        name: "CHAN TAI MAN",
        minResult: 4,
        maxDifficulty: 3.5,
        minCommentCount: 2,
        offeredOnly: true,
        sortBy: "result",
        sortOrder: "desc",
        limit: 10,
        page: 1,
      },
      signal,
    );

    expect(db.builder.eq).toHaveBeenCalledWith("prof_id", "CHAN TAI MAN");
    expect(db.builder.gte).toHaveBeenCalledWith("result", 4);
    expect(db.builder.lte).toHaveBeenCalledWith("hard", 3.5);
    expect(db.builder.gte).toHaveBeenCalledWith("comments", 2);
    expect(db.builder.order).toHaveBeenCalledWith("is_offered", { ascending: false });
    expect(db.builder.order).toHaveBeenCalledWith("result", { ascending: false });
    expect(db.builder.range).toHaveBeenCalledWith(0, 9);
    expect(result).toMatchObject({ name: "CHAN TAI MAN", totalCount: 1 });
    expect(result.courses[0]?.reviewUrl).toBe("https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN");
  });

  it("reports an instructor with no matching courses as not_found", async () => {
    db.response.data = [];
    db.response.count = 0;

    await expect(
      getInstructorForAssistant(
        { name: "NOBODY", sortBy: "code", sortOrder: "asc", limit: 20, page: 1 },
        signal,
      ),
    ).rejects.toBeInstanceOf(McpToolError);
  });
});

describe("assistant review counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.response.error = null;
  });

  it("counts only visible top-level reviews for the mapped course offering", async () => {
    vi.mocked(getReviewInfo).mockResolvedValue({ id: 7 } as never);
    db.response.count = 12;

    await expect(countCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, signal)).resolves.toEqual({
      totalCount: 12,
    });
    expect(db.builder.eq).toHaveBeenCalledWith("course_id", 7);
    expect(db.builder.is).toHaveBeenCalledWith("replyto", null);
    expect(db.builder.neq).toHaveBeenCalledWith("hidden", 1);
  });

  it("reports missing review mappings as not_found", async () => {
    vi.mocked(getReviewInfo).mockResolvedValue(null);
    await expect(
      countCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, signal),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
