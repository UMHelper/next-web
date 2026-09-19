import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc, from },
}));

import {
  aggregatePopularCourses,
  fetchPopularCourses,
} from "@/lib/database/get-popular-courses";

beforeEach(() => {
  vi.clearAllMocks();
});

const courseRows = [
  {
    New_code: "COMP1001",
    courseTitleEng: "Intro",
    courseTitleChi: null,
    Offering_Unit: "FST",
  },
  {
    New_code: "COMP2002",
    courseTitleEng: "Data",
    courseTitleChi: null,
    Offering_Unit: "FST",
  },
];

const linkRows = [
  { id: 1, course_id: "COMP1001" },
  { id: 2, course_id: "COMP2002" },
];

describe("aggregatePopularCourses", () => {
  it("sorts by comment count and applies the limit", () => {
    const result = aggregatePopularCourses(
      [
        { course_id: 1, result: 4, pub_time: "2026-09-01 10:00:00" },
        { course_id: 2, result: 3, pub_time: "2026-09-02 10:00:00" },
        { course_id: 2, result: 5, pub_time: "2026-09-03 10:00:00" },
      ],
      linkRows,
      courseRows,
      2,
    );

    expect(result.map((row) => row.courseCode)).toEqual(["COMP2002", "COMP1001"]);
    expect(result[0].commentCount).toBe(2);
    expect(result[0].avgResult).toBe(4);
  });

  it("excludes TEST courses from the fallback aggregation", () => {
    const result = aggregatePopularCourses(
      [
        { course_id: 3, result: 5, pub_time: "2026-09-03 10:00:00" },
        { course_id: 3, result: 5, pub_time: "2026-09-04 10:00:00" },
        { course_id: 1, result: 4, pub_time: "2026-09-01 10:00:00" },
      ],
      [...linkRows, { id: 3, course_id: "TEST1001" }],
      [
        ...courseRows,
        {
          New_code: "TEST1001",
          courseTitleEng: "Testing I",
          courseTitleChi: null,
          Offering_Unit: "Test",
        },
      ],
      5,
    );

    expect(result.map((row) => row.courseCode)).toEqual(["COMP1001"]);
  });
});

describe("fetchPopularCourses", () => {
  it("calls the RPC and maps rows", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          course_code: "COMP1001",
          course_title_eng: "Intro",
          course_title_chi: null,
          offering_unit: "FST",
          comment_count: 2,
          avg_result: 4.5,
          latest_comment_at: "2026-09-01 10:00:00",
        },
      ],
      error: null,
    });

    const result = await fetchPopularCourses();

    expect(rpc).toHaveBeenCalledWith("get_popular_courses", {
      target_days: 30,
      result_limit: 5,
    });
    expect(result).toEqual([
      {
        courseCode: "COMP1001",
        courseTitleEng: "Intro",
        courseTitleChi: null,
        offeringUnit: "FST",
        commentCount: 2,
        avgResult: 4.5,
        latestCommentAt: "2026-09-01 10:00:00",
      },
    ]);
  });

  it("falls back to local aggregation when the RPC is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    from.mockImplementation((table: string) => {
      if (table === "comment") {
        return {
          select: () => ({
            is: () => ({
              neq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            course_id: 1,
                            result: 4,
                            pub_time: "2026-09-01 10:00:00",
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "prof_with_course") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: 1, course_id: "COMP1001" }],
                error: null,
              }),
          }),
        };
      }

      if (table === "course_noporf") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [courseRows[0]],
                error: null,
              }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchPopularCourses();

    expect(result[0]).toMatchObject({
      courseCode: "COMP1001",
      commentCount: 1,
      avgResult: 4,
    });
  });
});
