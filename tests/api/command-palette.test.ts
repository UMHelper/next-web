import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fuzzySearchMock } = vi.hoisted(() => ({ fuzzySearchMock: vi.fn() }));

vi.mock("@/lib/database/get-fuzzy-search", () => ({
  fuzzySearch: fuzzySearchMock,
}));

import { GET } from "@/app/api/command-palette/route";

const request = (query: string) =>
  new NextRequest(`http://localhost/api/command-palette?q=${encodeURIComponent(query)}`);

describe("GET /api/command-palette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the projected course and instructor fields", async () => {
    fuzzySearchMock.mockImplementation(async (_query: string, type: string) =>
      type === "course"
        ? [
            {
              New_code: "ACCT1000",
              courseTitleEng: "Principles of Financial Accounting",
              courseTitleChi: "財務會計原理",
              Offering_Unit: "FBA",
              Offering_Department: "ACCT",
              Credits: "3",
              equivalent_codes: ["ACCT100"],
              ilo: "must not leak",
            },
          ]
        : [
            {
              prof_name: "CHAN TAI MAN",
              course_list: [{ courseCode: "ACCT1000" }, { courseCode: "ACCT2000" }],
            },
          ],
    );

    const response = await GET(request("ACCT"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.courses).toEqual([
      {
        code: "ACCT1000",
        titleEn: "Principles of Financial Accounting",
        titleZh: "財務會計原理",
        faculty: "FBA",
        department: "ACCT",
        credits: "3",
        equivalentCodes: ["ACCT100"],
      },
    ]);
    expect(body.courses[0]).not.toHaveProperty("ilo");
    expect(body.instructors).toEqual([
      { name: "CHAN TAI MAN", courseCount: 2, sampleCourse: "ACCT1000" },
    ]);
  });

  it("caps each group at six and skips malformed rows", async () => {
    fuzzySearchMock.mockImplementation(async (_query: string, type: string) =>
      type === "course"
        ? Array.from({ length: 8 }, (_, index) => ({
            New_code: `ACCT${1000 + index}`,
            courseTitleEng: `Course ${index}`,
          }))
        : [{ course_list: [] }, { prof_name: "CHAN TAI MAN", course_list: [] }],
    );

    const body = await (await GET(request("ACCT"))).json();
    expect(body.courses).toHaveLength(6);
    expect(body.instructors).toEqual([{ name: "CHAN TAI MAN", courseCount: 0, sampleCourse: null }]);
  });

  it("returns an empty result for an empty query", async () => {
    const body = await (await GET(request(""))).json();
    expect(body).toEqual({ courses: [], instructors: [] });
    expect(fuzzySearchMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty result when the RPC fails", async () => {
    fuzzySearchMock.mockRejectedValue(new Error("supabase down"));
    const response = await GET(request("ACCT"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ courses: [], instructors: [] });
  });
});
