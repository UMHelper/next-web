import { readFileSync } from "node:fs";
import path from "node:path";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeMock, fromMock, getReviewInfoMock, getScheduleListMock, rpcMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  fromMock: vi.fn(),
  getReviewInfoMock: vi.fn(),
  getScheduleListMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ default: { from: fromMock, rpc: rpcMock } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: vi.fn() }));
vi.mock("@/lib/database/get-prof-info", () => ({ getReviewInfo: getReviewInfoMock }));
vi.mock("@/lib/database/get-schedule-list", () => ({ default: getScheduleListMock }));
vi.mock("@/lib/mcp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/rate-limit")>();
  return { ...actual, consumeMcpRateLimits: consumeMock };
});

import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";
import type { McpToolContext, McpToolResult } from "@/lib/mcp/execute";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type GetCourseReviewsOutput,
  type GetCourseSectionsOutput,
  courseReviewSchema,
  getCourseReviewsInputSchema,
  getCourseReviewsOutputSchema,
  getCourseSectionsInputSchema,
  getCourseSectionsOutputSchema,
  mcpGetCourseReviewsInputSchema,
  mcpGetCourseReviewsOutputSchema,
  mcpGetCourseSectionsInputSchema,
  mcpGetCourseSectionsOutputSchema,
  mcpReadOnlyAnnotations,
  sectionScheduleSchema,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import { parseSectionTimeRange } from "@/lib/mcp/data/get-course-sections";
import {
  GET_COURSE_REVIEWS_ANNOTATIONS,
  GET_COURSE_REVIEWS_DESCRIPTION,
  GET_COURSE_REVIEWS_TOOL_CONFIG,
  GET_COURSE_REVIEWS_TOOL_NAME,
  handleGetCourseReviews,
  registerGetCourseReviewsTool,
} from "@/lib/mcp/tools/get-course-reviews";
import {
  GET_COURSE_SECTIONS_ANNOTATIONS,
  GET_COURSE_SECTIONS_DESCRIPTION,
  GET_COURSE_SECTIONS_TOOL_CONFIG,
  GET_COURSE_SECTIONS_TOOL_NAME,
  handleGetCourseSections,
  registerGetCourseSectionsTool,
} from "@/lib/mcp/tools/get-course-sections";

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

const authInfo = {
  token: "tok",
  clientId: "client_1",
  scopes: ["openid", MCP_REQUIRED_SCOPE],
  extra: { userId: "user_1" },
};

const ctx: McpToolContext = { http: { authInfo } };

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("expected the tool to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(McpToolError);
    expect((error as McpToolError).code).toBe(code);
  }
}

function readReviewsOutput(result: McpToolResult): GetCourseReviewsOutput {
  return getCourseReviewsOutputSchema.parse(result.structuredContent);
}

function readSectionsOutput(result: McpToolResult): GetCourseSectionsOutput {
  return getCourseSectionsOutputSchema.parse(result.structuredContent);
}

type ListedTool = {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

type JsonRpcResponse = { id?: number; result?: { tools?: ListedTool[] }; error?: unknown };

/** Register a tool on a real MCP server and read its `tools/list` entry. */
async function listRegisteredTools(register: (server: McpServer) => void): Promise<ListedTool[]> {
  const server = new McpServer(
    { name: "reviews-sections-test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  register(server);

  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (response: JsonRpcResponse) => void>();
  client.onmessage = (message) => {
    const response = message as unknown as JsonRpcResponse;
    if (typeof response.id === "number") pending.get(response.id)?.(response);
  };

  await server.connect(serverSide);
  await client.start();

  let nextId = 1;
  const call = (payload: Record<string, unknown>) => {
    const id = nextId++;
    return new Promise<JsonRpcResponse>((resolve) => {
      pending.set(id, resolve);
      void client.send({ jsonrpc: "2.0", id, ...payload } as never);
    });
  };

  try {
    await call({
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });
    await client.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
    const response = await call({ method: "tools/list", params: {} });
    return response.result?.tools ?? [];
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ROW = {
  id: 42,
  course_id: "ACCT1000",
  prof_id: "CHAN TAI MAN",
  comments: 12,
  // Forbidden mapping/relation fields that must never reach the output.
  admin_note: "FORBIDDEN ADMIN NOTE",
  admin_note_en: "FORBIDDEN ADMIN NOTE EN",
  verify_account: "FORBIDDEN VERIFY ACCOUNT",
};

/**
 * Raw `get_comment_page_v2` row, including every sensitive or internal column
 * the site's own pages rely on but the MCP contract forbids.
 */
function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    content: "Great course, learned a lot.",
    content_en: "Great course, learned a lot (EN).",
    pub_time: "2025-09-01 12:00:00",
    result: 4.5,
    upvote: 99,
    downvote: 88,
    upvote_count: 7,
    downvote_count: 1,
    course_id: 42,
    verify: 1,
    verify_account: "FORBIDDEN VERIFY ACCOUNT",
    avatar_seed: "FORBIDDEN AVATAR SEED",
    img: "https://imgur.com/FORBIDDEN-IMAGE.png",
    replyto: null,
    hidden: 0,
    emoji_counts: [{ emoji: "👍", count: 3 }],
    vote_history: [{ comment_id: 501, offset: 1, created_at: "2025-09-02", emoji: "👍" }],
    author_email: "forbidden@example.com",
    ...overrides,
  };
}

const PUBLIC_ROWS = [
  reviewRow(),
  reviewRow({
    id: 502,
    content: "FORBIDDEN HIDDEN REVIEW",
    content_en: "FORBIDDEN HIDDEN REVIEW EN",
    hidden: 1,
  }),
  reviewRow({ id: 503, replyto: 501, content: "FORBIDDEN REPLY", content_en: null }),
  reviewRow({
    id: 504,
    content: "Second public review.",
    content_en: null,
    pub_time: "2025-08-15 08:30:00",
    result: 3,
    upvote_count: 0,
    downvote_count: 2,
    verify: 0,
  }),
];

type SectionFixture = { section: unknown; schedules: unknown[] };

function scheduleFixture(overrides: Record<string, unknown> = {}) {
  return {
    date: "MON",
    time: "08:00-09:30",
    location: "E11-1023",
    // Extra/internal columns must never be forwarded.
    id: 9001,
    course_id: 42,
    prof_id: "CHAN TAI MAN",
    secret: "FORBIDDEN SECRET",
    ...overrides,
  };
}

function sectionFixture(overrides: Partial<SectionFixture> = {}): SectionFixture {
  return {
    section: "001",
    schedules: [
      scheduleFixture(),
      scheduleFixture({ date: "WED", time: "10:30 - 12:00", location: "E11-1024" }),
    ],
    ...overrides,
  };
}

const REVIEW_KEYS = [
  "content",
  "contentEn",
  "downvotes",
  "publishedAt",
  "result",
  "upvotes",
  "url",
  "verified",
];

const SECTION_SCHEDULE_KEYS = ["endTime", "location", "startTime", "weekday"];

function expectNoForbiddenFields(serialized: string) {
  for (const fragment of [
    '"id"',
    '"hidden"',
    '"replyto"',
    '"verify_account"',
    '"avatar_seed"',
    '"img"',
    '"vote_history"',
    '"emoji_counts"',
    '"course_id"',
    '"prof_id"',
    '"upvote_count"',
    '"downvote_count"',
    '"admin_note"',
    '"author_email"',
    '"secret"',
  ]) {
    expect(serialized, `serialized output must not contain ${fragment}`).not.toContain(fragment);
  }
  for (const value of [
    "FORBIDDEN",
    "forbidden@example.com",
    "imgur.com",
    "admin note",
  ]) {
    expect(serialized).not.toContain(value);
  }
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

describe("get_course_reviews input schema", () => {
  it("trims and upper-cases the code and normalizes the instructor name", () => {
    const parsed = getCourseReviewsInputSchema.safeParse({
      code: "  acct1000 ",
      instructor: "  Chan   Tai\tMan  ",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      code: "ACCT1000",
      instructor: "CHAN TAI MAN",
      page: 1,
      limit: 5,
    });
  });

  it("bounds code, instructor, page and limit", () => {
    const ok = {
      code: "ACCT1000",
      instructor: "CHAN TAI MAN",
      page: 1,
      limit: 10,
    };
    expect(getCourseReviewsInputSchema.safeParse(ok).success).toBe(true);
    expect(
      getCourseReviewsInputSchema.safeParse({ ...ok, code: "A".repeat(21) }).success,
    ).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, instructor: "A".repeat(81) }).success).toBe(
      false,
    );
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, page: 0 }).success).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, page: 51 }).success).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, page: 2.5 }).success).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, limit: 0 }).success).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ ...ok, limit: 11 }).success).toBe(false);
    expect(getCourseReviewsInputSchema.safeParse({ code: "ACCT1000" }).success).toBe(false);
    expect(
      getCourseReviewsInputSchema.safeParse({ code: "  ", instructor: "CHAN" }).success,
    ).toBe(false);
  });

  it("advertises the documented bounds through the MCP bridge", () => {
    const json = mcpGetCourseReviewsInputSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(json.required).toEqual(["code", "instructor"]);
    const properties = json.properties as Record<string, Record<string, unknown>>;
    expect(properties.code).toMatchObject({ type: "string", maxLength: 20 });
    expect(properties.instructor).toMatchObject({ type: "string", maxLength: 80 });
    expect(properties.page).toMatchObject({ type: "integer", minimum: 1, maximum: 50, default: 1 });
    expect(properties.limit).toMatchObject({ type: "integer", minimum: 1, maximum: 10, default: 5 });
  });
});

describe("get_course_sections input schema", () => {
  it("normalizes the code and instructor and strips unknown fields", () => {
    const parsed = getCourseSectionsInputSchema.safeParse({
      code: " acct1000 ",
      instructor: "  Chan  Tai Man ",
      page: 9,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ code: "ACCT1000", instructor: "CHAN TAI MAN" });
  });

  it("requires both bounded inputs", () => {
    expect(getCourseSectionsInputSchema.safeParse({ code: "ACCT1000" }).success).toBe(false);
    expect(
      getCourseSectionsInputSchema.safeParse({ code: "", instructor: "CHAN" }).success,
    ).toBe(false);
    expect(
      getCourseSectionsInputSchema.safeParse({ code: "ACCT1000", instructor: "A".repeat(81) })
        .success,
    ).toBe(false);
  });

  it("advertises both bounded inputs through the MCP bridge", () => {
    const json = mcpGetCourseSectionsInputSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(json.required).toEqual(["code", "instructor"]);
    const properties = json.properties as Record<string, Record<string, unknown>>;
    expect(properties.code).toMatchObject({ type: "string", maxLength: 20 });
    expect(properties.instructor).toMatchObject({ type: "string", maxLength: 80 });
  });
});

// ---------------------------------------------------------------------------
// get_course_reviews data adapter
// ---------------------------------------------------------------------------

describe("get_course_reviews data adapter", () => {
  function queueRpc(payload: { data?: unknown; error?: unknown }) {
    const abortSignal = vi
      .fn()
      .mockResolvedValue({ data: payload.data ?? [], error: payload.error ?? null });
    rpcMock.mockReturnValue({ abortSignal });
    return { abortSignal };
  }

  function queueReviews(data: unknown) {
    queueRpc({ data });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
    getReviewInfoMock.mockResolvedValue(MAPPING_ROW);
    queueRpc({ data: PUBLIC_ROWS });
  });

  it("resolves the internal mapping with the normalized code and instructor", async () => {
    await handleGetCourseReviews(
      { code: "  acct1000 ", instructor: "  Chan   Tai Man " },
      ctx,
    );

    expect(getReviewInfoMock).toHaveBeenCalledTimes(1);
    expect(getReviewInfoMock).toHaveBeenCalledWith("ACCT1000", "CHAN TAI MAN");
  });

  it("calls the controlled RPC with the zero-based page and the caller page size", async () => {
    const { abortSignal } = queueRpc({ data: PUBLIC_ROWS });

    await handleGetCourseReviews(
      { code: "ACCT1000", instructor: "CHAN TAI MAN", page: 3, limit: 4 },
      ctx,
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_comment_page_v2", {
      target_course_id: 42,
      target_page: 2,
      target_page_size: 4,
      target_viewer_id: null,
    });
    // The caller/timeout signal is forwarded so a cancelled call stops the RPC.
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("defaults to the first page and a page size of 5 instead of the fixed-20 helper", async () => {
    await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx);

    expect(rpcMock).toHaveBeenCalledWith(
      "get_comment_page_v2",
      expect.objectContaining({ target_page: 0, target_page_size: 5 }),
    );
  });

  it("returns only top-level, non-hidden public reviews", async () => {
    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.reviews).toHaveLength(2);
    expect(output.reviews.map((review) => review.content)).toEqual([
      "Great course, learned a lot.",
      "Second public review.",
    ]);
    expect(JSON.stringify(output)).not.toContain("FORBIDDEN HIDDEN REVIEW");
    expect(JSON.stringify(output)).not.toContain("FORBIDDEN REPLY");
  });

  it("projects exactly the contract whitelist and maps the raw columns", async () => {
    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.courseCode).toBe("ACCT1000");
    expect(output.instructor).toBe("CHAN TAI MAN");
    expect(output.page).toBe(1);
    expect(output.reviews[0]).toEqual({
      publishedAt: "2025-09-01 12:00:00",
      content: "Great course, learned a lot.",
      contentEn: "Great course, learned a lot (EN).",
      result: 4.5,
      upvotes: 7,
      downvotes: 1,
      verified: true,
      url: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
    });
    expect(output.reviews[1]).toMatchObject({
      result: 3,
      upvotes: 0,
      downvotes: 2,
      verified: false,
      contentEn: null,
    });
    expect(Object.keys(output.reviews[0]).sort()).toEqual(REVIEW_KEYS);
    expect(Object.keys(output.reviews[1]).sort()).toEqual(REVIEW_KEYS);
  });

  it("truncates each body at 600 Unicode code points without splitting surrogate pairs", async () => {
    const astral = "😀".repeat(700);
    const mixed = "a😀café🙂".repeat(200); // 8 code points per repeat, 1600 total
    queueReviews([reviewRow({ content: astral, content_en: mixed })]);

    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    const [review] = output.reviews;
    expect(review.content).toBe("😀".repeat(600));
    expect(Array.from(review.content ?? "")).toHaveLength(600);
    expect(Array.from(review.content ?? "").at(-1)).toBe("😀");
    expect(Array.from(review.contentEn ?? "")).toHaveLength(600);
    expect(review.contentEn).toBe(Array.from(mixed).slice(0, 600).join(""));
  });

  it("keeps short bodies and null bodies untouched", async () => {
    queueReviews([reviewRow({ content: "short", content_en: null })]);

    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.reviews[0].content).toBe("short");
    expect(output.reviews[0].contentEn).toBeNull();
  });

  it("keeps the page number in the review URL when paging", async () => {
    const output = readReviewsOutput(
      await handleGetCourseReviews(
        { code: "ACCT1000", instructor: "CHAN TAI MAN", page: 3, limit: 2 },
        ctx,
      ),
    );

    expect(output.page).toBe(3);
    expect(output.url).toBe(absoluteUrl(buildReviewPath("ACCT1000", "CHAN TAI MAN", 3)));
    expect(output.url).toBe("https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN/3");
    for (const review of output.reviews) expect(review.url).toBe(output.url);
  });

  it("omits the page segment for the first page", async () => {
    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.url).toBe(absoluteUrl(buildReviewPath("ACCT1000", "CHAN TAI MAN", 1)));
    expect(output.url).toBe("https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN");
  });

  it("never leaks forbidden fields even when the fixture contains them", async () => {
    const result = await handleGetCourseReviews(
      { code: "ACCT1000", instructor: "CHAN TAI MAN" },
      ctx,
    );

    expectNoForbiddenFields(JSON.stringify(result.structuredContent));
    expectNoForbiddenFields(result.content[0].text);
  });

  it("returns an empty list, not not_found, when the page has no public review", async () => {
    queueReviews([
      reviewRow({ id: 601, hidden: 1 }),
      reviewRow({ id: 602, replyto: 501 }),
    ]);

    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.reviews).toEqual([]);
  });

  it("treats a non-array RPC payload as an empty page", async () => {
    queueReviews(null);

    const output = readReviewsOutput(
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.reviews).toEqual([]);
  });

  it("returns not_found for an unknown course/instructor mapping", async () => {
    getReviewInfoMock.mockResolvedValue(null);

    await expectCode(
      handleGetCourseReviews({ code: "ZZZZ9999", instructor: "NOBODY" }, ctx),
      "not_found",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps an RPC failure to a non-leaking temporarily_unavailable", async () => {
    queueRpc({
      data: null,
      error: { message: "permission denied for function get_comment_page_v2", code: "42501" },
    });

    try {
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("temporarily_unavailable");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("maps a mapping lookup failure to a non-leaking internal_error", async () => {
    getReviewInfoMock.mockRejectedValue(new Error("permission denied for table prof_with_course"));

    try {
      await handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("internal_error");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("requires authentication and never reaches the data layer without it", async () => {
    await expectCode(handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN" }, {}), "unauthorized");
    expect(getReviewInfoMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps invalid arguments to invalid_request without querying the data layer", async () => {
    await expectCode(
      handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN", page: 51 }, ctx),
      "invalid_request",
    );
    await expectCode(
      handleGetCourseReviews({ code: "ACCT1000", instructor: "CHAN", limit: 0 }, ctx),
      "invalid_request",
    );
    expect(getReviewInfoMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_course_sections time parser
// ---------------------------------------------------------------------------

describe("parseSectionTimeRange", () => {
  it.each([
    ["08:00-09:30", { startTime: "08:00", endTime: "09:30" }],
    [" 08:00 - 09:30 ", { startTime: "08:00", endTime: "09:30" }],
    ["8:00-9:30", { startTime: "08:00", endTime: "09:30" }],
    ["13:05–14:15", { startTime: "13:05", endTime: "14:15" }],
    ["13:05~14:15", { startTime: "13:05", endTime: "14:15" }],
    ["00:00-23:59", { startTime: "00:00", endTime: "23:59" }],
  ])("parses %s deterministically", (input, expected) => {
    expect(parseSectionTimeRange(input)).toEqual(expected);
  });

  it.each([
    [""],
    ["   "],
    ["TBA"],
    ["08:00"],
    ["08:00-"],
    ["-09:30"],
    ["08:00-09:30,10:00-11:00"],
    ["24:00-25:00"],
    ["08:60-09:00"],
    ["08:0-09:00"],
    ["10:00-10:00"],
    ["11:00-10:00"],
    ["8-9"],
    ["08:00 09:30"],
  ])("returns null for malformed or incomplete %j", (input) => {
    expect(parseSectionTimeRange(input)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseSectionTimeRange(null)).toBeNull();
    expect(parseSectionTimeRange(undefined)).toBeNull();
    expect(parseSectionTimeRange(830)).toBeNull();
    expect(parseSectionTimeRange({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// get_course_sections data adapter
// ---------------------------------------------------------------------------

describe("get_course_sections data adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
    getScheduleListMock.mockResolvedValue([sectionFixture()]);
  });

  function queueSections(sections: SectionFixture[]) {
    getScheduleListMock.mockResolvedValue(sections);
  }

  it("reads the catalog through getScheduleList with the normalized code and instructor", async () => {
    await handleGetCourseSections(
      { code: " acct1000 ", instructor: "  Chan   Tai Man " },
      ctx,
    );

    expect(getScheduleListMock).toHaveBeenCalledTimes(1);
    expect(getScheduleListMock).toHaveBeenCalledWith("ACCT1000", "CHAN TAI MAN");
    // The catalog helper is the only data source: no user/timetable table is read.
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps date to weekday and splits time into startTime/endTime", async () => {
    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.courseCode).toBe("ACCT1000");
    expect(output.instructor).toBe("CHAN TAI MAN");
    expect(output.sections).toHaveLength(1);
    expect(output.sections[0]).toEqual({
      section: "001",
      schedules: [
        { weekday: "MON", startTime: "08:00", endTime: "09:30", location: "E11-1023" },
        { weekday: "WED", startTime: "10:30", endTime: "12:00", location: "E11-1024" },
      ],
      courseUrl: "https://umeh.top/course/ACCT1000",
    });
    expect(Object.keys(output.sections[0]).sort()).toEqual([
      "courseUrl",
      "schedules",
      "section",
    ]);
    expect(Object.keys(output.sections[0].schedules[0]).sort()).toEqual(SECTION_SCHEDULE_KEYS);
  });

  it("normalizes the weekday to its upper-case three-letter form", async () => {
    queueSections([sectionFixture({ schedules: [scheduleFixture({ date: " wed " })] })]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections[0].schedules[0].weekday).toBe("WED");
  });

  it("caps the section list and the schedules per section at 20", async () => {
    queueSections(
      Array.from({ length: 25 }, (_, index) =>
        sectionFixture({
          section: `S${index}`,
          schedules: Array.from({ length: 25 }, (_, slot) =>
            scheduleFixture({
              date: "MON",
              time: `${String(8 + (slot % 10)).padStart(2, "0")}:00-${String(
                9 + (slot % 10),
              ).padStart(2, "0")}:00`,
            }),
          ),
        }),
      ),
    );

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections).toHaveLength(20);
    expect(output.sections[0].schedules).toHaveLength(20);
    expect(output.sections.at(-1)?.section).toBe("S19");
  });

  it("safely skips malformed schedules and keeps the valid ones", async () => {
    queueSections([
      sectionFixture({
        schedules: [
          scheduleFixture(),
          scheduleFixture({ time: "TBA" }),
          scheduleFixture({ time: "" }),
          scheduleFixture({ date: "" }),
          scheduleFixture({ date: "FUNDAY" }),
          scheduleFixture({ time: "11:00-10:00" }),
          null,
          "FORBIDDEN SCHEDULE",
          scheduleFixture({ date: "FRI", time: "14:00-15:30" }),
        ],
      }),
    ]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections).toHaveLength(1);
    expect(output.sections[0].schedules).toEqual([
      { weekday: "MON", startTime: "08:00", endTime: "09:30", location: "E11-1023" },
      { weekday: "FRI", startTime: "14:00", endTime: "15:30", location: "E11-1023" },
    ]);
  });

  it("keeps a section whose schedules are all malformed, with an empty schedule list", async () => {
    queueSections([sectionFixture({ schedules: [scheduleFixture({ time: "TBA" })] })]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections).toHaveLength(1);
    expect(output.sections[0].schedules).toEqual([]);
  });

  it("drops sections without a usable section name", async () => {
    queueSections([
      sectionFixture({ section: null }),
      sectionFixture({ section: "   " }),
      sectionFixture({ section: "002" }),
    ]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections.map((section) => section.section)).toEqual(["002"]);
  });

  it("maps a missing location to null instead of the string 'null'", async () => {
    queueSections([
      sectionFixture({
        schedules: [scheduleFixture({ location: null }), scheduleFixture({ location: "   " })],
      }),
    ]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections[0].schedules.map((schedule) => schedule.location)).toEqual([null, null]);
  });

  it("never leaks forbidden fields even when the fixture contains them", async () => {
    const result = await handleGetCourseSections(
      { code: "ACCT1000", instructor: "CHAN TAI MAN" },
      ctx,
    );

    expectNoForbiddenFields(JSON.stringify(result.structuredContent));
    expectNoForbiddenFields(result.content[0].text);
  });

  it("returns an empty section list when the catalog has no section for the term", async () => {
    queueSections([]);

    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.sections).toEqual([]);
  });

  it("builds the course URL through lib/site.ts", async () => {
    const output = readSectionsOutput(
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx),
    );

    expect(output.courseUrl).toBe(absoluteUrl(buildCoursePath("ACCT1000")));
    expect(output.courseUrl).toBe("https://umeh.top/course/ACCT1000");
  });

  it("maps an unexpected catalog failure to a non-leaking internal_error", async () => {
    getScheduleListMock.mockRejectedValue(new Error("permission denied for function get_schedule_list"));

    try {
      await handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN TAI MAN" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("internal_error");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("requires authentication and never reaches the catalog without it", async () => {
    await expectCode(handleGetCourseSections({ code: "ACCT1000", instructor: "CHAN" }, {}), "unauthorized");
    expect(getScheduleListMock).not.toHaveBeenCalled();
  });

  it("maps invalid arguments to invalid_request without reading the catalog", async () => {
    await expectCode(handleGetCourseSections({ code: "ACCT1000", instructor: "" }, ctx), "invalid_request");
    await expectCode(handleGetCourseSections({ code: "A".repeat(21), instructor: "X" }, ctx), "invalid_request");
    expect(getScheduleListMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

describe("reviews/sections output schemas", () => {
  it("rejects review items outside the whitelist shape", () => {
    expect(courseReviewSchema.safeParse({}).success).toBe(false);
    expect(
      getCourseReviewsOutputSchema.safeParse({
        courseCode: "ACCT1000",
        instructor: "CHAN",
        page: 1,
        url: "https://umeh.top/reviews/ACCT1000/CHAN",
        reviews: Array.from({ length: 11 }, () => ({
          publishedAt: null,
          content: null,
          contentEn: null,
          result: null,
          upvotes: 0,
          downvotes: 0,
          verified: false,
          url: "https://umeh.top/reviews/ACCT1000/CHAN",
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects section schedules with an unknown field and caps the arrays", () => {
    expect(sectionScheduleSchema.safeParse({ weekday: "MON" }).success).toBe(false);
    expect(
      sectionScheduleSchema.safeParse({
        weekday: "MON",
        startTime: "08:00",
        endTime: "09:30",
        location: null,
      }).success,
    ).toBe(true);

    const section = {
      section: "001",
      courseUrl: "https://umeh.top/course/ACCT1000",
      schedules: [],
    };
    expect(
      getCourseSectionsOutputSchema.safeParse({
        courseCode: "ACCT1000",
        instructor: "CHAN",
        courseUrl: "https://umeh.top/course/ACCT1000",
        sections: Array.from({ length: 21 }, () => section),
      }).success,
    ).toBe(false);
  });

  it("advertises the projected output fields for tools/list", () => {
    const reviewsJson = mcpGetCourseReviewsOutputSchema["~standard"].jsonSchema.output({
      target: "draft-2020-12",
    });
    expect(JSON.stringify(reviewsJson)).toContain("publishedAt");
    expect(JSON.stringify(reviewsJson)).toContain("contentEn");
    expect(JSON.stringify(reviewsJson)).not.toContain("verify_account");
    expect(JSON.stringify(reviewsJson)).not.toContain("avatar_seed");

    const sectionsJson = mcpGetCourseSectionsOutputSchema["~standard"].jsonSchema.output({
      target: "draft-2020-12",
    });
    expect(JSON.stringify(sectionsJson)).toContain("startTime");
    expect(JSON.stringify(sectionsJson)).toContain("weekday");
    expect(JSON.stringify(sectionsJson)).not.toContain("replyto");
  });

  it("exposes read-only, non-destructive, closed-world annotations", () => {
    expect(mcpReadOnlyAnnotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Tool metadata and registration
// ---------------------------------------------------------------------------

describe("reviews/sections tool metadata", () => {
  it("declares the approved read-only annotations and review-facing titles", () => {
    expect(GET_COURSE_REVIEWS_TOOL_NAME).toBe("get_course_reviews");
    expect(GET_COURSE_SECTIONS_TOOL_NAME).toBe("get_course_sections");

    for (const config of [GET_COURSE_REVIEWS_TOOL_CONFIG, GET_COURSE_SECTIONS_TOOL_CONFIG]) {
      expect(config.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(String((config.annotations as { title: string }).title).length).toBeGreaterThan(0);
    }

    expect(GET_COURSE_REVIEWS_TOOL_CONFIG.annotations).toEqual(GET_COURSE_REVIEWS_ANNOTATIONS);
    expect(GET_COURSE_SECTIONS_TOOL_CONFIG.annotations).toEqual(GET_COURSE_SECTIONS_ANNOTATIONS);
  });

  for (const description of [GET_COURSE_REVIEWS_DESCRIPTION, GET_COURSE_SECTIONS_DESCRIPTION]) {
    it(`describes provenance and reference retention: ${description.slice(0, 24)}...`, () => {
      expect(description).toContain("UMHelper");
      expect(description).toContain("https://umeh.top");
      expect(description.toLowerCase()).toContain("read-only");
      expect(description.toLowerCase()).toMatch(/keep|retain|cite/);
    });
  }
});

describe("reviews/sections MCP registration", () => {
  it("advertises get_course_reviews with both schemas and read-only annotations", async () => {
    const tools = await listRegisteredTools(registerGetCourseReviewsTool);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_course_reviews");
    expect(tools[0].description).toBe(GET_COURSE_REVIEWS_DESCRIPTION);
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      title: GET_COURSE_REVIEWS_ANNOTATIONS.title,
    });
    const properties = tools[0].inputSchema?.properties as Record<string, Record<string, unknown>>;
    expect(properties.instructor).toMatchObject({ type: "string", maxLength: 80 });
    expect(properties.limit).toMatchObject({ type: "integer", maximum: 10, default: 5 });
    expect(JSON.stringify(tools[0].outputSchema)).toContain("publishedAt");
  });

  it("advertises get_course_sections with both schemas and read-only annotations", async () => {
    const tools = await listRegisteredTools(registerGetCourseSectionsTool);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_course_sections");
    expect(tools[0].description).toBe(GET_COURSE_SECTIONS_DESCRIPTION);
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      title: GET_COURSE_SECTIONS_ANNOTATIONS.title,
    });
    expect(JSON.stringify(tools[0].outputSchema)).toContain("weekday");
  });
});

// ---------------------------------------------------------------------------
// Source boundaries
// ---------------------------------------------------------------------------

describe("reviews/sections source boundaries", () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("keeps the new modules free of REST self-calls, raw selects and raw logging", () => {
    for (const file of [
      "lib/mcp/data/get-course-reviews.ts",
      "lib/mcp/data/get-course-sections.ts",
      "lib/mcp/tools/get-course-reviews.ts",
      "lib/mcp/tools/get-course-sections.ts",
    ]) {
      const source = read(file);
      expect(source, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not call the site REST API`).not.toContain("/api/");
      expect(source, `${file} must not use select("*")`).not.toMatch(/select\s*\(\s*["'`]\*["'`]\s*\)/);
      expect(source, `${file} must not log raw payloads`).not.toContain("console.log");
      expect(source, `${file} must not spread a raw row`).not.toMatch(/\.\.\.\s*row\b/);
    }
  });

  it("does not use the fixed-20 comment helper and keeps the paging arguments", () => {
    const source = read("lib/mcp/data/get-course-reviews.ts");
    expect(source).toContain("get_comment_page_v2");
    expect(source).toContain("target_page_size");
    expect(source).not.toContain("getComentListByCourseIDAndPage");
  });

  it("reads only the catalog and never the saved timetable tables", () => {
    const source = read("lib/mcp/data/get-course-sections.ts");
    expect(source).toContain("@/lib/database/get-schedule-list");
    expect(source).not.toContain("timetable_plan");
    expect(source).not.toContain("supabase");
    expect(source).not.toMatch(/\bfrom\s*\(/);
  });
});
