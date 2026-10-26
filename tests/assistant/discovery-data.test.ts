import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ default: { from: vi.fn() } }));

import type { DiscoveryScope } from "@/lib/assistant/discovery/schema";
import { McpToolError } from "@/lib/mcp/errors";
import {
  IN_CHUNK,
  loadDiscoveryPool,
  loadReviewTexts,
  MAX_POOL_COURSES,
} from "@/lib/assistant/data/discovery";

type QueryResponse = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

type RecordedCall = { method: string; args: unknown[] };

function createRecordingClient(handlers: Partial<Record<string, QueryResponse | QueryResponse[]>>) {
  const fromTables: string[] = [];
  const sessions: Array<{ table: string; calls: RecordedCall[] }> = [];
  const callIndex: Record<string, number> = {};

  function nextResponse(table: string): QueryResponse {
    const handler = handlers[table];
    if (!handler) return { data: [], error: null, count: 0 };
    if (Array.isArray(handler)) {
      const index = callIndex[table] ?? 0;
      callIndex[table] = index + 1;
      return handler[index] ?? { data: [], error: null, count: 0 };
    }
    return handler;
  }

  const chainMethods = [
    "select",
    "eq",
    "or",
    "order",
    "range",
    "abortSignal",
    "is",
    "neq",
    "in",
    "not",
    "ilike",
    "lte",
    "limit",
  ] as const;

  function from(table: string) {
    fromTables.push(table);
    const calls: RecordedCall[] = [];
    const builder: Record<string, unknown> = {};

    for (const method of chainMethods) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }

    builder.then = (
      resolve: (value: QueryResponse) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      sessions.push({ table, calls: [...calls] });
      return Promise.resolve(nextResponse(table)).then(resolve, reject);
    };

    return builder;
  }

  return {
    from,
    fromTables,
    sessions,
    callsFor(table: string): RecordedCall[] {
      return sessions.filter((entry) => entry.table === table).flatMap((entry) => entry.calls);
    },
    sessionCount(table: string): number {
      return sessions.filter((entry) => entry.table === table).length;
    },
  };
}

const signal = new AbortController().signal;
const term = { year: 2026, sem: 1 };

const baseScope: DiscoveryScope = {
  faculty: "FST",
};

const catalogRow = {
  New_code: "CISC2001",
  courseTitleEng: "Programming Science",
  courseTitleChi: "程式設計科學",
  Offering_Unit: "FST",
  Offering_Department: "CIS",
  Credits: "3",
  courseType: "Non-GE",
  suggestedYearOfStudy: 2,
  equivalent_codes: ["CISC2000"],
};

describe("loadDiscoveryPool catalog query", () => {
  it("loads catalog, instructor rows, and offers without topic columns when topics are omitted", async () => {
    const client = createRecordingClient({
      course_catalog: { data: [catalogRow], error: null, count: 1 },
      prof_with_course: {
        data: [
          {
            id: 10,
            course_id: "CISC2001",
            prof_id: "WONG KA KI",
            comments: 12,
            result: 3.9,
            grade: 3.4,
            hard: 3.6,
            reward: 3.8,
          },
        ],
        error: null,
      },
      offer: {
        data: [
          {
            course_id: 10,
            section: "001",
            schedule: [{ time_location: [{ date: "MON", times: "10:00-11:15", location: "E12" }] }],
          },
        ],
        error: null,
      },
    });

    const pool = await loadDiscoveryPool(baseScope, term, signal, client);

    expect(client.fromTables).toEqual(["course_catalog", "prof_with_course", "offer"]);
    const catalogSelect = client.callsFor("course_catalog").find((call) => call.method === "select");
    expect(catalogSelect?.args[0]).not.toContain("courseDescription");
    expect(client.callsFor("offer").some((call) => call.method === "eq" && call.args[0] === "year" && call.args[1] === 2026)).toBe(true);
    expect(client.callsFor("offer").some((call) => call.method === "eq" && call.args[0] === "sem" && call.args[1] === 1)).toBe(true);
    expect(pool.courses[0]?.courseCode).toBe("CISC2001");
    expect(pool.instructorRows[0]?.courseCode).toBe("CISC2001");
    expect(pool.offers[0]?.section).toBe("001");
  });

  it("maps instructor rows on equivalent course codes back to the primary code", async () => {
    const client = createRecordingClient({
      course_catalog: { data: [catalogRow], error: null, count: 1 },
      prof_with_course: {
        data: [
          {
            id: 99,
            course_id: "CISC2000",
            prof_id: "LI MEI",
            comments: 8,
            result: 4.3,
            grade: 3.8,
            hard: 2.5,
            reward: 4.0,
          },
        ],
        error: null,
      },
      offer: { data: [], error: null },
    });

    const pool = await loadDiscoveryPool(baseScope, term, signal, client);
    expect(pool.instructorRows[0]?.courseCode).toBe("CISC2001");
  });

  it("marks the pool truncated when the exact count exceeds the page size", async () => {
    const rows = Array.from({ length: MAX_POOL_COURSES }, (_, index) => ({
      ...catalogRow,
      New_code: `CISC${1000 + index}`,
      equivalent_codes: [],
    }));

    const client = createRecordingClient({
      course_catalog: { data: rows, error: null, count: 400 },
      prof_with_course: { data: [], error: null },
      offer: { data: [], error: null },
    });

    const pool = await loadDiscoveryPool(baseScope, term, signal, client);
    expect(pool.truncated).toBe(true);
    expect(pool.totalMatchingCourses).toBe(400);
    expect(pool.courses).toHaveLength(MAX_POOL_COURSES);
  });

  it("rejects with temporarily_unavailable when the catalog read fails", async () => {
    const client = createRecordingClient({
      course_catalog: { data: null, error: { message: "boom" }, count: null },
    });

    await expect(loadDiscoveryPool(baseScope, term, signal, client)).rejects.toMatchObject({
      code: "temporarily_unavailable",
    });
    expect(client.fromTables).toEqual(["course_catalog"]);
  });

  it("sanitizes topic terms before building the PostgREST or filter", async () => {
    const client = createRecordingClient({
      course_catalog: { data: [], error: null, count: 0 },
    });

    await loadDiscoveryPool({ topics: ["Macao", "a,b(c)"] }, term, signal, client);

    const orCall = client.callsFor("course_catalog").find((call) => call.method === "or");
    expect(orCall?.args[0]).toContain("Macao");
    expect(orCall?.args[0]).toContain("a b c");
    expect(orCall?.args[0]).not.toMatch(/a,b\(c\)/);
    const catalogSelect = client.callsFor("course_catalog").find((call) => call.method === "select");
    expect(catalogSelect?.args[0]).toContain("courseDescription");
  });

  it("filters credits with three string variants", async () => {
    const client = createRecordingClient({
      course_catalog: { data: [], error: null, count: 0 },
    });

    await loadDiscoveryPool({ ...baseScope, credits: 3 }, term, signal, client);

    const inCall = client.callsFor("course_catalog").find((call) => call.method === "in");
    expect(inCall).toEqual({ method: "in", args: ["Credits", ["3", "3.0", "3.00"]] });
  });

  it("returns an empty pool after only the catalog read when no courses match", async () => {
    const client = createRecordingClient({
      course_catalog: { data: [], error: null, count: 0 },
    });

    const pool = await loadDiscoveryPool(baseScope, term, signal, client);
    expect(client.fromTables).toEqual(["course_catalog"]);
    expect(pool).toMatchObject({
      truncated: false,
      totalMatchingCourses: 0,
      courses: [],
      instructorRows: [],
      offers: [],
      term,
    });
  });
});

describe("loadDiscoveryPool offer chunking", () => {
  it(`chunks offer reads at ${IN_CHUNK} pwc ids`, async () => {
    const instructorRows = Array.from({ length: 450 }, (_, index) => ({
      id: index + 1,
      course_id: "CISC2001",
      prof_id: `PROF ${index}`,
      comments: 1,
      result: 3,
      grade: 3,
      hard: 3,
      reward: 3,
    }));

    const client = createRecordingClient({
      course_catalog: { data: [catalogRow], error: null, count: 1 },
      prof_with_course: { data: instructorRows, error: null },
      offer: [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }],
    });

    await loadDiscoveryPool(baseScope, term, signal, client);
    expect(client.sessionCount("offer")).toBe(3);
  });
});

describe("loadReviewTexts", () => {
  it("loads public top-level review text for each pwc id", async () => {
    const client = createRecordingClient({
      comment: [
        {
          data: [
            { content: "好課", content_en: "Great course" },
            { content: "輕鬆", content_en: null },
          ],
          error: null,
        },
        {
          data: [{ content: "難", content_en: "Hard" }],
          error: null,
        },
      ],
    });

    const rows = await loadReviewTexts([1, 2], signal, client);

    expect(client.sessionCount("comment")).toBe(2);
    for (const session of client.sessions.filter((entry) => entry.table === "comment")) {
      expect(session.calls.some((call) => call.method === "is" && call.args[0] === "replyto" && call.args[1] === null)).toBe(true);
      expect(session.calls.some((call) => call.method === "neq" && call.args[0] === "hidden" && call.args[1] === 1)).toBe(true);
    }

    expect(rows).toEqual([
      { pwcId: 1, texts: ["好課", "Great course", "輕鬆"] },
      { pwcId: 2, texts: ["難", "Hard"] },
    ]);
  });

  it("rejects with temporarily_unavailable when a review read fails", async () => {
    const client = createRecordingClient({
      comment: { data: null, error: { message: "down" } },
    });

    await expect(loadReviewTexts([1], signal, client)).rejects.toBeInstanceOf(McpToolError);
    await expect(loadReviewTexts([1], signal, client)).rejects.toMatchObject({
      code: "temporarily_unavailable",
    });
  });
});
