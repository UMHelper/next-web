import { readFileSync } from "node:fs";
import path from "node:path";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeMock, fetchCourseInfoMock, fromMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  fetchCourseInfoMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

// `unstable_cache` is a Next request-scoped API; an identity wrapper keeps the
// real `lib/database` helpers callable inside the node test environment.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

vi.mock("@/lib/supabase/server", () => ({ default: { from: fromMock } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: vi.fn() }));
vi.mock("@/lib/mcp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/rate-limit")>();
  return { ...actual, consumeMcpRateLimits: consumeMock };
});
// Keep the real `normalizeLocalCourseInfo` so fixtures carry the exact shape
// `fetchCourseInfo` returns in production; only the query itself is stubbed.
vi.mock("@/lib/database/get-course-info", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/get-course-info")>();
  return { ...actual, fetchCourseInfo: fetchCourseInfoMock };
});

import { normalizeLocalCourseInfo } from "@/lib/database/get-course-info";
import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";
import type { McpToolContext, McpToolResult } from "@/lib/mcp/execute";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type GetCourseOutput,
  type GetInstructorOutput,
  courseInstructorSummarySchema,
  getCourseInputSchema,
  getCourseOutputSchema,
  getInstructorInputSchema,
  getInstructorOutputSchema,
  instructorCourseSummarySchema,
  mcpGetCourseInputSchema,
  mcpGetCourseOutputSchema,
  mcpGetInstructorInputSchema,
  mcpGetInstructorOutputSchema,
  mcpReadOnlyAnnotations,
} from "@/lib/mcp/schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import {
  GET_COURSE_ANNOTATIONS,
  GET_COURSE_DESCRIPTION,
  GET_COURSE_TOOL_CONFIG,
  GET_COURSE_TOOL_NAME,
  handleGetCourse,
  registerGetCourseTool,
} from "@/lib/mcp/tools/get-course";
import {
  GET_INSTRUCTOR_ANNOTATIONS,
  GET_INSTRUCTOR_DESCRIPTION,
  GET_INSTRUCTOR_TOOL_CONFIG,
  GET_INSTRUCTOR_TOOL_NAME,
  handleGetInstructor,
  registerGetInstructorTool,
} from "@/lib/mcp/tools/get-instructor";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type SupabaseResult = { data: unknown; error: unknown };
type QueryCall = { method: string; args: unknown[] };

type QueryBuilder = {
  calls: QueryCall[];
  then: (
    onFulfilled: (value: SupabaseResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
  [method: string]: unknown;
};

/** Minimal thenable Postgrest builder that records the chained calls. */
function createQueryBuilder(result: SupabaseResult): QueryBuilder {
  const calls: QueryCall[] = [];
  const builder: QueryBuilder = {
    calls,
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of ["select", "eq", "order", "limit", "maybeSingle", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder;
}

function queueProfCourses(rows: unknown[], error: unknown = null): QueryBuilder {
  const builder = createQueryBuilder({ data: rows, error });
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe("prof_with_course");
    return builder;
  });
  return builder;
}

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

function readCourseOutput(result: McpToolResult): GetCourseOutput {
  return getCourseOutputSchema.parse(result.structuredContent);
}

function readInstructorOutput(result: McpToolResult): GetInstructorOutput {
  return getInstructorOutputSchema.parse(result.structuredContent);
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
    { name: "course-instructor-test", version: "0.0.0" },
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

function courseFixture(overrides: Record<string, unknown> = {}) {
  return normalizeLocalCourseInfo(
    {
      New_code: "ACCT1000",
      courseTitleEng: "Financial Accounting",
      courseTitleChi: "財務會計",
      offeringProgLevel: "UG",
      suggestedYearOfStudy: 1,
      Credits: "3",
      Offering_Department: "ACCT",
      Offering_Unit: "FBA",
      Medium_of_Instruction: "English",
      gradingSystem: "Graded",
      courseType: "Compulsory",
      Course_Duration: "One semester",
      courseDescription: "Learn accounting.",
      // Forbidden fields and unknown future columns that must never be projected.
      ilo: "FORBIDDEN ILO",
      future_column: "FORBIDDEN FUTURE",
      ...overrides,
    },
    "ACCT1000",
  );
}

const profRow = {
  id: 7,
  course_id: "ACCT1000",
  prof_id: "CHAN TAI MAN",
  result: 4.2,
  grade: 4,
  hard: 3.1,
  reward: 4.5,
  attendance: 3.8,
  comments: 5,
  is_offered: 1,
  // Forbidden fields and unknown future columns.
  admin_note: "FORBIDDEN ADMIN NOTE",
  admin_note_en: "FORBIDDEN ADMIN NOTE EN",
  verify_account: 1,
  hidden: 0,
  secret: "FORBIDDEN SECRET",
  future_column: "FORBIDDEN FUTURE",
};

const instructorRows = [
  {
    id: 7,
    course_id: "acct1000",
    prof_id: "CHAN TAI MAN",
    result: 4.2,
    grade: 4,
    hard: 3.1,
    reward: 4.5,
    attendance: 3.8,
    comments: 5,
    is_offered: 1,
    admin_note: "FORBIDDEN ADMIN NOTE",
    admin_note_en: "FORBIDDEN ADMIN NOTE EN",
    verify_account: 1,
    hidden: 0,
    secret: "FORBIDDEN SECRET",
    future_column: "FORBIDDEN FUTURE",
  },
  {
    id: 8,
    course_id: "FINA2001",
    prof_id: "CHAN TAI MAN",
    result: 3.5,
    grade: 3,
    hard: 2.5,
    reward: 4,
    attendance: 4,
    comments: 2,
    is_offered: 0,
    admin_note: null,
    admin_note_en: null,
    secret: "FORBIDDEN SECRET",
  },
];

const COURSE_KEYS = [
  "courseCode",
  "courseType",
  "credits",
  "department",
  "description",
  "duration",
  "faculty",
  "gradingSystem",
  "isOffered",
  "medium",
  "programLevel",
  "suggestedYear",
  "titleEn",
  "titleZh",
  "url",
];

const INSTRUCTOR_SUMMARY_KEYS = [
  "attendance",
  "commentCount",
  "difficulty",
  "grade",
  "isOffered",
  "name",
  "result",
  "reviewUrl",
  "reward",
];

const INSTRUCTOR_COURSE_KEYS = [
  "attendance",
  "commentCount",
  "courseCode",
  "courseUrl",
  "difficulty",
  "grade",
  "isOffered",
  "result",
  "reviewUrl",
  "reward",
];

const FORBIDDEN_KEY_FRAGMENTS = [
  '"ilo"',
  '"id"',
  '"admin_note"',
  '"admin_note_en"',
  '"verify_account"',
  '"hidden"',
  '"secret"',
  '"total_count"',
  '"future_column"',
];

function expectNoForbiddenFields(serialized: string) {
  for (const fragment of FORBIDDEN_KEY_FRAGMENTS) {
    expect(serialized).not.toContain(fragment);
  }
  for (const value of [
    "FORBIDDEN ILO",
    "FORBIDDEN ADMIN NOTE",
    "FORBIDDEN ADMIN NOTE EN",
    "FORBIDDEN SECRET",
    "FORBIDDEN FUTURE",
  ]) {
    expect(serialized).not.toContain(value);
  }
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

describe("get_course input schema", () => {
  it("trims and upper-cases the course code", () => {
    const parsed = getCourseInputSchema.safeParse({ code: "  acct1000 " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.code).toBe("ACCT1000");
  });

  it("requires a non-blank code of at most 20 characters", () => {
    expect(getCourseInputSchema.safeParse({}).success).toBe(false);
    expect(getCourseInputSchema.safeParse({ code: "" }).success).toBe(false);
    expect(getCourseInputSchema.safeParse({ code: "   " }).success).toBe(false);
    expect(getCourseInputSchema.safeParse({ code: 123 }).success).toBe(false);
    expect(getCourseInputSchema.safeParse({ code: "A".repeat(20) }).success).toBe(true);
    expect(getCourseInputSchema.safeParse({ code: "A".repeat(21) }).success).toBe(false);
  });

  it("strips unknown input fields", () => {
    const parsed = getCourseInputSchema.safeParse({ code: "ACCT1000", admin_note: "x" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("admin_note");
  });
});

describe("get_instructor input schema", () => {
  it("trims, collapses whitespace and upper-cases the instructor name", () => {
    const parsed = getInstructorInputSchema.safeParse({ name: "  Chan   Tai\tMan  " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // `prof_with_course.prof_id` is matched with an exact (case-sensitive) `eq`
    // and stores UM's upper-case names, so normalising here avoids a spurious
    // not_found for the lower/title-case input a model typically produces.
    expect(parsed.data.name).toBe("CHAN TAI MAN");
  });

  it("requires a non-blank name of at most 80 characters", () => {
    expect(getInstructorInputSchema.safeParse({}).success).toBe(false);
    expect(getInstructorInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(getInstructorInputSchema.safeParse({ name: "A".repeat(80) }).success).toBe(true);
    expect(getInstructorInputSchema.safeParse({ name: "A".repeat(81) }).success).toBe(false);
  });

  it("defaults limit to 20 and enforces the 1..20 range", () => {
    const parsed = getInstructorInputSchema.safeParse({ name: "CHAN TAI MAN" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(20);

    expect(getInstructorInputSchema.safeParse({ name: "A", limit: 1 }).success).toBe(true);
    expect(getInstructorInputSchema.safeParse({ name: "A", limit: 20 }).success).toBe(true);
    expect(getInstructorInputSchema.safeParse({ name: "A", limit: 0 }).success).toBe(false);
    expect(getInstructorInputSchema.safeParse({ name: "A", limit: 21 }).success).toBe(false);
    expect(getInstructorInputSchema.safeParse({ name: "A", limit: 2.5 }).success).toBe(false);
  });
});

describe("course/instructor MCP-facing schemas", () => {
  it("advertises strict input schemas with the documented bounds", () => {
    const courseJson = mcpGetCourseInputSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(courseJson.type).toBe("object");
    expect(courseJson.required).toEqual(["code"]);
    expect((courseJson.properties as Record<string, Record<string, unknown>>).code).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 20,
    });

    const instructorJson = mcpGetInstructorInputSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(instructorJson.type).toBe("object");
    expect(instructorJson.required).toEqual(["name"]);
    const properties = instructorJson.properties as Record<string, Record<string, unknown>>;
    expect(properties.name).toMatchObject({ type: "string", minLength: 1, maxLength: 80 });
    expect(properties.limit).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 20,
      default: 20,
    });
  });

  it("validates and normalizes through the standard-schema bridge", () => {
    const course = mcpGetCourseInputSchema["~standard"].validate({ code: "  acct1000 " });
    expect("value" in course).toBe(true);
    if (!("value" in course)) return;
    expect(course.value).toEqual({ code: "ACCT1000" });

    const instructor = mcpGetInstructorInputSchema["~standard"].validate({
      name: "  Chan   Tai Man ",
    });
    expect("value" in instructor).toBe(true);
    if (!("value" in instructor)) return;
    expect(instructor.value).toMatchObject({ name: "CHAN TAI MAN", limit: 20 });
  });

  it("converts the output schemas for tools/list", () => {
    const courseJson = mcpGetCourseOutputSchema["~standard"].jsonSchema.output({
      target: "draft-2020-12",
    });
    const courseKeys = Object.keys(
      (courseJson.properties as Record<string, Record<string, unknown>>).course
        .properties as Record<string, unknown>,
    ).sort();
    expect(courseKeys).toEqual(COURSE_KEYS);

    const instructorJson = mcpGetInstructorOutputSchema["~standard"].jsonSchema.output({
      target: "draft-2020-12",
    });
    expect(instructorJson.required).toEqual(["name", "courses"]);
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
// get_course data adapter
// ---------------------------------------------------------------------------

describe("get_course data adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  function queueCourse(options: {
    course?: ReturnType<typeof courseFixture>;
    profList?: unknown[];
    isOffer?: boolean;
  }) {
    fetchCourseInfoMock.mockResolvedValue({
      course: options.course ?? courseFixture(),
      profList: options.profList ?? [profRow],
      isOffer: options.isOffer ?? true,
    });
  }

  it("normalizes the code before querying the data layer", async () => {
    queueCourse({});

    await handleGetCourse({ code: "  acct1000 " }, ctx);

    expect(fetchCourseInfoMock).toHaveBeenCalledTimes(1);
    expect(fetchCourseInfoMock).toHaveBeenCalledWith("ACCT1000");
  });

  it("projects course and instructor summaries onto the contract whitelist only", async () => {
    queueCourse({});

    const result = await handleGetCourse({ code: "ACCT1000" }, ctx);
    const output = readCourseOutput(result);

    expect(output.course).toEqual({
      courseCode: "ACCT1000",
      titleEn: "Financial Accounting",
      titleZh: "財務會計",
      credits: "3",
      faculty: "FBA",
      department: "ACCT",
      programLevel: "UG",
      suggestedYear: "1",
      medium: "English",
      gradingSystem: "Graded",
      courseType: "Compulsory",
      duration: "One semester",
      description: "Learn accounting.",
      isOffered: true,
      url: "https://umeh.top/course/ACCT1000",
    });

    expect(output.instructors).toEqual([
      {
        name: "CHAN TAI MAN",
        commentCount: 5,
        result: 4.2,
        attendance: 3.8,
        grade: 4,
        difficulty: 3.1,
        reward: 4.5,
        isOffered: true,
        reviewUrl: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
      },
    ]);

    expect(Object.keys(output.course).sort()).toEqual(COURSE_KEYS);
    expect(Object.keys(output.instructors[0]).sort()).toEqual(INSTRUCTOR_SUMMARY_KEYS);
  });

  it("truncates the description at 1,200 Unicode code points without splitting surrogate pairs", async () => {
    queueCourse({ course: courseFixture({ courseDescription: "😀".repeat(1300) }) });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(output.course.description).toBe("😀".repeat(1200));
    expect(Array.from(output.course.description ?? "").length).toBe(1200);
    expect(Array.from(output.course.description ?? "").at(-1)).toBe("😀");
  });

  it("truncates mixed text by code points, not UTF-16 units", async () => {
    const long = "a😀café🙂".repeat(200); // 8 code points per repeat, 1600 total
    queueCourse({ course: courseFixture({ courseDescription: long }) });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(Array.from(output.course.description ?? "")).toHaveLength(1200);
    expect(output.course.description).toBe(Array.from(long).slice(0, 1200).join(""));
  });

  it("keeps short descriptions and null untouched", async () => {
    queueCourse({ course: courseFixture({ courseDescription: "Short description." }) });
    const short = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));
    expect(short.course.description).toBe("Short description.");

    queueCourse({ course: courseFixture({ courseDescription: null }) });
    const missing = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));
    expect(missing.course.description).toBeNull();
  });

  it("caps the instructor summary list at 20 entries", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...profRow,
      prof_id: `PROF ${index}`,
    }));
    queueCourse({ profList: many });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(output.instructors).toHaveLength(20);
    expect(output.instructors[0].name).toBe("PROF 0");
    expect(output.instructors.at(-1)?.name).toBe("PROF 19");
  });

  it("drops instructor rows that cannot produce a name or URL", async () => {
    queueCourse({
      profList: [profRow, { ...profRow, prof_id: null }, { ...profRow, prof_id: "   " }],
    });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(output.instructors).toHaveLength(1);
  });

  it("maps a missing offering flag to false", async () => {
    queueCourse({ profList: [{ ...profRow, is_offered: 0 }], isOffer: false });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(output.course.isOffered).toBe(false);
    expect(output.instructors[0].isOffered).toBe(false);
  });

  it("returns not_found for an unknown course code", async () => {
    fetchCourseInfoMock.mockResolvedValue({
      course: normalizeLocalCourseInfo({}, "ZZZZ9999"),
      profList: [],
      isOffer: false,
    });

    await expectCode(handleGetCourse({ code: "ZZZZ9999" }, ctx), "not_found");
  });

  it("maps a thrown database failure to a non-leaking internal_error", async () => {
    fetchCourseInfoMock.mockRejectedValue(new Error("permission denied for table course_noporf"));

    try {
      await handleGetCourse({ code: "ACCT1000" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("internal_error");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("never leaks forbidden fields even when the data fixture contains them", async () => {
    queueCourse({});

    const result = await handleGetCourse({ code: "ACCT1000" }, ctx);

    expectNoForbiddenFields(JSON.stringify(result.structuredContent));
    expectNoForbiddenFields(result.content[0].text);
  });

  it("builds every reference URL through lib/site.ts", async () => {
    queueCourse({ profList: [{ ...profRow, prof_id: "CHAN, TAI MAN" }] });

    const output = readCourseOutput(await handleGetCourse({ code: "ACCT1000" }, ctx));

    expect(output.course.url).toBe(absoluteUrl(buildCoursePath("ACCT1000")));
    expect(output.instructors[0].reviewUrl).toBe(
      absoluteUrl(buildReviewPath("ACCT1000", "CHAN, TAI MAN")),
    );
    expect(output.instructors[0].reviewUrl).toBe(
      "https://umeh.top/reviews/ACCT1000/CHAN%2C%20TAI%20MAN",
    );
  });

  it("requires authentication and never reaches the data layer without it", async () => {
    await expectCode(handleGetCourse({ code: "ACCT1000" }, {}), "unauthorized");
    expect(fetchCourseInfoMock).not.toHaveBeenCalled();
  });

  it("maps invalid arguments to invalid_request without querying the data layer", async () => {
    await expectCode(handleGetCourse({ code: "" }, ctx), "invalid_request");
    expect(fetchCourseInfoMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_instructor data adapter
// ---------------------------------------------------------------------------

describe("get_instructor data adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  it("applies limit at the database layer, defaulting to 20", async () => {
    const builder = queueProfCourses(instructorRows);

    await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx);

    const limitCall = builder.calls.find((call) => call.method === "limit");
    expect(limitCall?.args).toEqual([20]);
  });

  it("passes the caller limit down to the database query instead of slicing in memory", async () => {
    const builder = queueProfCourses(instructorRows.slice(0, 2));

    await handleGetInstructor({ name: "CHAN TAI MAN", limit: 2 }, ctx);

    const limitCall = builder.calls.find((call) => call.method === "limit");
    expect(limitCall?.args).toEqual([2]);
  });

  it("queries the controlled table with explicit columns, the normalized name and the abort signal", async () => {
    const builder = queueProfCourses(instructorRows);

    await handleGetInstructor({ name: "  Chan   Tai Man  " }, ctx);

    const selectCall = builder.calls.find((call) => call.method === "select");
    expect(selectCall?.args).toHaveLength(1);
    expect(String(selectCall?.args[0])).not.toContain("*");
    expect(String(selectCall?.args[0])).toContain("course_id");

    const eqCall = builder.calls.find((call) => call.method === "eq");
    expect(eqCall?.args).toEqual(["prof_id", "CHAN TAI MAN"]);

    const abortCall = builder.calls.find((call) => call.method === "abortSignal");
    expect(abortCall?.args[0]).toBeInstanceOf(AbortSignal);
  });

  it("projects instructor courses onto the contract whitelist only", async () => {
    queueProfCourses(instructorRows);

    const result = await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx);
    const output = readInstructorOutput(result);

    expect(output).toEqual({
      name: "CHAN TAI MAN",
      courses: [
        {
          courseCode: "ACCT1000",
          commentCount: 5,
          result: 4.2,
          attendance: 3.8,
          grade: 4,
          difficulty: 3.1,
          reward: 4.5,
          isOffered: true,
          courseUrl: "https://umeh.top/course/ACCT1000",
          reviewUrl: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
        },
        {
          courseCode: "FINA2001",
          commentCount: 2,
          result: 3.5,
          attendance: 4,
          grade: 3,
          difficulty: 2.5,
          reward: 4,
          isOffered: false,
          courseUrl: "https://umeh.top/course/FINA2001",
          reviewUrl: "https://umeh.top/reviews/FINA2001/CHAN%20TAI%20MAN",
        },
      ],
    });

    expect(Object.keys(output).sort()).toEqual(["courses", "name"]);
    expect(Object.keys(output.courses[0]).sort()).toEqual(INSTRUCTOR_COURSE_KEYS);
  });

  it("never leaks forbidden fields even when the data fixture contains them", async () => {
    queueProfCourses(instructorRows);

    const result = await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx);

    expectNoForbiddenFields(JSON.stringify(result.structuredContent));
    expectNoForbiddenFields(result.content[0].text);
  });

  it("returns not_found when the instructor has no catalog entry", async () => {
    queueProfCourses([]);

    await expectCode(handleGetInstructor({ name: "NOBODY" }, ctx), "not_found");
  });

  it("maps a Supabase error response to a non-leaking temporarily_unavailable", async () => {
    queueProfCourses([], { message: "permission denied for table prof_with_course", code: "42501" });

    try {
      await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("temporarily_unavailable");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("maps a thrown database failure to a non-leaking internal_error", async () => {
    fromMock.mockImplementation(() => {
      throw new Error("network down for prof_with_course");
    });

    try {
      await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("internal_error");
      expect(JSON.stringify(toolError.message)).not.toContain("network down");
    }
  });

  it("drops rows without a course code", async () => {
    queueProfCourses([instructorRows[0], { ...instructorRows[1], course_id: null }]);

    const output = readInstructorOutput(await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx));

    expect(output.courses).toHaveLength(1);
    expect(output.courses[0].courseCode).toBe("ACCT1000");
  });

  it("builds every reference URL through lib/site.ts", async () => {
    queueProfCourses([instructorRows[0]]);

    const output = readInstructorOutput(await handleGetInstructor({ name: "CHAN TAI MAN" }, ctx));

    expect(output.courses[0].courseUrl).toBe(absoluteUrl(buildCoursePath("ACCT1000")));
    expect(output.courses[0].reviewUrl).toBe(
      absoluteUrl(buildReviewPath("ACCT1000", "CHAN TAI MAN")),
    );
  });

  it("caps the projected course list at the schema maximum", () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => ({
      courseCode: `C${index}`,
      commentCount: 0,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: false,
      courseUrl: `https://umeh.top/course/C${index}`,
      reviewUrl: "https://umeh.top/reviews/C0/PROF",
    }));

    expect(getInstructorOutputSchema.safeParse({ name: "P", courses: tooMany }).success).toBe(false);
  });

  it("requires authentication and never reaches the database without it", async () => {
    await expectCode(handleGetInstructor({ name: "CHAN TAI MAN" }, {}), "unauthorized");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps invalid arguments to invalid_request without querying the database", async () => {
    await expectCode(handleGetInstructor({ name: "" }, ctx), "invalid_request");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tool metadata and registration
// ---------------------------------------------------------------------------

describe("get_course / get_instructor tool metadata", () => {
  it("declares the approved read-only annotations and review-facing descriptions", () => {
    expect(GET_COURSE_TOOL_NAME).toBe("get_course");
    expect(GET_INSTRUCTOR_TOOL_NAME).toBe("get_instructor");

    for (const config of [GET_COURSE_TOOL_CONFIG, GET_INSTRUCTOR_TOOL_CONFIG]) {
      expect(config.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(String((config.annotations as { title: string }).title).length).toBeGreaterThan(0);
    }

    expect(GET_COURSE_TOOL_CONFIG.annotations).toEqual(GET_COURSE_ANNOTATIONS);
    expect(GET_INSTRUCTOR_TOOL_CONFIG.annotations).toEqual(GET_INSTRUCTOR_ANNOTATIONS);
  });

  for (const description of [GET_COURSE_DESCRIPTION, GET_INSTRUCTOR_DESCRIPTION]) {
    it(`describes provenance and reference retention: ${description.slice(0, 24)}...`, () => {
      expect(description).toContain("UMHelper");
      expect(description).toContain("https://umeh.top");
      expect(description.toLowerCase()).toContain("read-only");
      expect(description.toLowerCase()).toMatch(/keep|retain|cite/);
    });
  }
});

describe("get_course / get_instructor MCP registration", () => {
  it("advertises get_course with read-only annotations and both schemas", async () => {
    const tools = await listRegisteredTools(registerGetCourseTool);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_course");
    expect(tools[0].description).toBe(GET_COURSE_DESCRIPTION);
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      title: GET_COURSE_ANNOTATIONS.title,
    });
    expect(tools[0].inputSchema?.type).toBe("object");
    expect(JSON.stringify(tools[0].outputSchema)).toContain("courseCode");
  });

  it("advertises get_instructor with read-only annotations and both schemas", async () => {
    const tools = await listRegisteredTools(registerGetInstructorTool);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_instructor");
    expect(tools[0].description).toBe(GET_INSTRUCTOR_DESCRIPTION);
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      title: GET_INSTRUCTOR_ANNOTATIONS.title,
    });
    const properties = tools[0].inputSchema?.properties as Record<string, Record<string, unknown>>;
    expect(properties.name).toMatchObject({ type: "string", maxLength: 80 });
    expect(properties.limit).toMatchObject({ type: "integer", maximum: 20, default: 20 });
    expect(JSON.stringify(tools[0].outputSchema)).toContain("courses");
  });
});

describe("course/instructor source boundaries", () => {
  it("keeps the new modules free of REST self-calls, raw selects and raw logging", () => {
    const root = process.cwd();
    const files = [
      "lib/mcp/schemas.ts",
      "lib/mcp/data/get-course.ts",
      "lib/mcp/data/get-instructor.ts",
      "lib/mcp/tools/get-course.ts",
      "lib/mcp/tools/get-instructor.ts",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not call the site REST API`).not.toContain("/api/");
      expect(source, `${file} must not use select("*")`).not.toMatch(/select\s*\(\s*["'`]\*["'`]\s*\)/);
      expect(source, `${file} must not log raw payloads`).not.toContain("console.log");
    }
  });

  it("exposes the projected schemas with bounded array sizes", () => {
    expect(courseInstructorSummarySchema.safeParse({}).success).toBe(false);
    expect(instructorCourseSummarySchema.safeParse({}).success).toBe(false);
    expect(
      getCourseOutputSchema.safeParse({
        course: {},
        instructors: [],
      }).success,
    ).toBe(false);
  });
});
