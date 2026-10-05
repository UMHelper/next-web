import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  verifyClerkTokenMock,
  consumeMock,
  searchCatalogMock,
  getCourseMock,
  getInstructorMock,
  getCourseReviewsMock,
  getCourseSectionsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  verifyClerkTokenMock: vi.fn(),
  consumeMock: vi.fn(),
  searchCatalogMock: vi.fn(),
  getCourseMock: vi.fn(),
  getInstructorMock: vi.fn(),
  getCourseReviewsMock: vi.fn(),
  getCourseSectionsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc: vi.fn() } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: verifyClerkTokenMock }));
vi.mock("@/lib/mcp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/rate-limit")>();
  return { ...actual, consumeMcpRateLimits: consumeMock };
});

// The data adapters are replaced here on purpose: this suite proves the HTTP +
// MCP protocol contract (list, call, stable error mapping), while the explicit
// field projections have their own behavioural suites. Every call still runs
// through the real `executeMcpTool` boundary, output schemas and rate limiting.
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: searchCatalogMock }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: getCourseMock }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: getInstructorMock }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: getCourseReviewsMock }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({
  getCourseSections: getCourseSectionsMock,
}));

// Shorten the production 10s execution budget so the timeout semantics are
// exercised through the real boundary instead of a ten-second wait. Every other
// constant (body/result limits, scope, resource URL) stays at its real value.
vi.mock("@/lib/mcp/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/constants")>();
  return { ...actual, MCP_TOOL_TIMEOUT_MS: 250 };
});

import { DELETE, GET, POST } from "@/app/mcp/route";
import {
  MCP_MAX_BODY_BYTES,
  MCP_REQUIRED_SCOPE,
  MCP_RESOURCE_METADATA_PATH,
} from "@/lib/mcp/constants";
import { McpToolError } from "@/lib/mcp/errors";
import { MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "@/lib/mcp/server";
import {
  getCourseOutputSchema,
  getCourseReviewsOutputSchema,
  getCourseSectionsOutputSchema,
  getInstructorOutputSchema,
  searchCatalogOutputSchema,
} from "@/lib/mcp/schemas";

type ListedTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

type JsonRpcMessage = {
  id?: number;
  result?: {
    serverInfo?: { name?: string; version?: string };
    protocolVersion?: string;
    instructions?: string;
    tools?: ListedTool[];
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
};

const APPROVED_TOOL_NAMES = [
  "get_course",
  "get_course_reviews",
  "get_course_sections",
  "get_instructor",
  "search_catalog",
];

const SEARCH_CATALOG_OUTPUT = {
  type: "course",
  results: [
    {
      courseCode: "ACCT1000",
      titleEn: "Financial Accounting",
      titleZh: null,
      faculty: "FBA",
      department: "ACCT",
      credits: "3",
      isOffered: true,
      url: "https://umeh.top/course/ACCT1000",
    },
  ],
};

const GET_COURSE_OUTPUT = {
  course: {
    courseCode: "ACCT1000",
    titleEn: "Financial Accounting",
    titleZh: null,
    credits: "3",
    faculty: "FBA",
    department: "ACCT",
    programLevel: null,
    suggestedYear: null,
    medium: null,
    gradingSystem: null,
    courseType: null,
    duration: null,
    description: null,
    isOffered: true,
    url: "https://umeh.top/course/ACCT1000",
  },
  instructors: [
    {
      name: "CHAN TAI MAN",
      commentCount: 3,
      result: 4.2,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: true,
      reviewUrl: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
    },
  ],
};

const GET_INSTRUCTOR_OUTPUT = {
  name: "CHAN TAI MAN",
  courses: [
    {
      courseCode: "ACCT1000",
      commentCount: 3,
      result: 4.2,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: true,
      courseUrl: "https://umeh.top/course/ACCT1000",
      reviewUrl: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
    },
  ],
};

const GET_COURSE_REVIEWS_OUTPUT = {
  courseCode: "ACCT1000",
  instructor: "CHAN TAI MAN",
  page: 1,
  url: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
  reviews: [
    {
      publishedAt: "2026-01-01",
      content: "Clear lectures.",
      contentEn: null,
      result: 4,
      upvotes: 2,
      downvotes: 0,
      verified: true,
      url: "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN",
    },
  ],
};

const GET_COURSE_SECTIONS_OUTPUT = {
  courseCode: "ACCT1000",
  instructor: "CHAN TAI MAN",
  courseUrl: "https://umeh.top/course/ACCT1000",
  sections: [
    {
      section: "001",
      schedules: [
        { weekday: "MON", startTime: "09:00", endTime: "10:30", location: "E11-1001" },
      ],
      courseUrl: "https://umeh.top/course/ACCT1000",
    },
  ],
};

type OutputSchema = { parse: (value: unknown) => unknown };

type SuccessCase = {
  name: string;
  args: Record<string, unknown>;
  data: Record<string, unknown>;
  outputSchema: OutputSchema;
};

const SUCCESS_CASES: SuccessCase[] = [
  {
    name: "search_catalog",
    args: { type: "course", query: "ACCT" },
    data: SEARCH_CATALOG_OUTPUT,
    outputSchema: searchCatalogOutputSchema,
  },
  {
    name: "get_course",
    args: { code: "acct1000" },
    data: GET_COURSE_OUTPUT,
    outputSchema: getCourseOutputSchema,
  },
  {
    name: "get_instructor",
    args: { name: "chan tai man" },
    data: GET_INSTRUCTOR_OUTPUT,
    outputSchema: getInstructorOutputSchema,
  },
  {
    name: "get_course_reviews",
    args: { code: "acct1000", instructor: "chan tai man" },
    data: GET_COURSE_REVIEWS_OUTPUT,
    outputSchema: getCourseReviewsOutputSchema,
  },
  {
    name: "get_course_sections",
    args: { code: "acct1000", instructor: "chan tai man" },
    data: GET_COURSE_SECTIONS_OUTPUT,
    outputSchema: getCourseSectionsOutputSchema,
  },
];

function mcpRequest(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("https://umeh.top/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer tok",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

async function readJsonRpc(response: Response): Promise<JsonRpcMessage | null> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const dataLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    return dataLine ? (JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcMessage) : null;
  }
  return text.length > 0 ? (JSON.parse(text) as JsonRpcMessage) : null;
}

let nextRequestId = 1;

async function send(payload: Record<string, unknown>): Promise<JsonRpcMessage | null> {
  const response = await POST(mcpRequest({ jsonrpc: "2.0", id: nextRequestId++, ...payload }));
  expect(response.status).toBe(200);
  return readJsonRpc(response);
}

async function callTool(name: string, args: Record<string, unknown>) {
  return send({ method: "tools/call", params: { name, arguments: args } });
}

/** Flatten the stable error text returned for a failed `tools/call`. */
function toolErrorText(message: JsonRpcMessage | null): string {
  if (message?.error?.message) return String(message.error.message);
  return (message?.result?.content ?? [])
    .map((entry) => entry.text ?? "")
    .join("\n")
    .trim();
}

function authenticate(scopes: string[] = ["openid", MCP_REQUIRED_SCOPE]) {
  authMock.mockResolvedValue({
    isAuthenticated: true,
    tokenType: "oauth_token",
    clientId: "client_1",
    scopes,
    userId: "user_1",
  });
  verifyClerkTokenMock.mockReturnValue({
    token: "tok",
    clientId: "client_1",
    scopes,
    extra: { userId: "user_1" },
  });
}

describe("MCP protocol over the protected transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
    searchCatalogMock.mockResolvedValue(SEARCH_CATALOG_OUTPUT);
    getCourseMock.mockResolvedValue(GET_COURSE_OUTPUT);
    getInstructorMock.mockResolvedValue(GET_INSTRUCTOR_OUTPUT);
    getCourseReviewsMock.mockResolvedValue(GET_COURSE_REVIEWS_OUTPUT);
    getCourseSectionsMock.mockResolvedValue(GET_COURSE_SECTIONS_OUTPUT);
  });

  it("completes the initialize handshake and advertises review-facing instructions", async () => {
    const message = await send({
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });

    expect(message?.result?.serverInfo?.name).toBe(MCP_SERVER_NAME);
    expect(message?.result?.serverInfo?.version).toBe(MCP_SERVER_VERSION);
    expect(message?.result?.protocolVersion).toBeTruthy();
    expect(message?.result?.instructions).toBe(MCP_SERVER_INSTRUCTIONS);
  });

  it("states the reviewed data-source, read-only and citation boundaries in the instructions", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("What2Reg @ UM");
    expect(MCP_SERVER_INSTRUCTIONS.toLowerCase()).toContain("read-only");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("https://umeh.top");
    expect(MCP_SERVER_INSTRUCTIONS.toLowerCase()).toMatch(/paginat|truncat/);
    expect(MCP_SERVER_INSTRUCTIONS.toLowerCase()).toMatch(/not an official|never[^.]*official/);
  });

  it("lists exactly the five approved read-only tools with full metadata", async () => {
    const message = await send({ method: "tools/list", params: {} });
    const tools = message?.result?.tools ?? [];

    expect(tools.map((tool) => tool.name).sort()).toEqual(APPROVED_TOOL_NAMES);
    expect(tools.map((tool) => tool.name)).not.toContain("health");

    for (const tool of tools) {
      expect(typeof tool.title, `${tool.name} title`).toBe("string");
      expect(tool.title?.length ?? 0, `${tool.name} title`).toBeGreaterThan(0);
      expect(tool.annotations?.title?.length ?? 0, `${tool.name} annotation title`).toBeGreaterThan(
        0,
      );

      const description = tool.description ?? "";
      expect(description.length, `${tool.name} description`).toBeGreaterThan(80);
      expect(description, `${tool.name} names the data source`).toContain("UMHelper");
      expect(description.toLowerCase(), `${tool.name} read-only`).toContain("read-only");
      expect(description, `${tool.name} citation URL`).toContain("https://umeh.top");
      expect(description.toLowerCase(), `${tool.name} not official`).toMatch(/not an official/);

      expect(tool.inputSchema?.type, `${tool.name} input schema`).toBe("object");
      expect(tool.outputSchema, `${tool.name} output schema`).toBeTruthy();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });

  it.each(SUCCESS_CASES)(
    "returns short content and schema-matching structuredContent for $name",
    async (testCase) => {
      const message = await callTool(testCase.name, testCase.args);

      expect(message?.result?.isError).toBeFalsy();
      const content = message?.result?.content ?? [];
      expect(content.length).toBeGreaterThan(0);
      expect(content[0].type).toBe("text");
      expect(content[0].text?.length ?? 0).toBeGreaterThan(0);
      // "Short" fallback text: it must stay far below the 64 KiB payload limit.
      expect(content[0].text?.length ?? 0).toBeLessThan(2048);

      expect(message?.result?.structuredContent).toEqual(testCase.data);
      expect(testCase.outputSchema.parse(message?.result?.structuredContent)).toEqual(
        testCase.data,
      );
    },
  );

  it("returns 401 with a challenge and never queries data when auth is missing", async () => {
    authMock.mockResolvedValue({
      isAuthenticated: false,
      tokenType: "oauth_token",
      clientId: null,
      scopes: null,
      userId: null,
    });
    verifyClerkTokenMock.mockReturnValue(undefined);

    const response = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 99,
          method: "tools/call",
          params: { name: "search_catalog", arguments: { type: "course", query: "ACCT" } },
        },
        { authorization: "" },
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate") ?? "").toContain(MCP_RESOURCE_METADATA_PATH);
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("returns 403 and never queries data when umhelper:read is missing", async () => {
    authenticate(["openid", "profile"]);

    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 100,
        method: "tools/call",
        params: { name: "search_catalog", arguments: { type: "course", query: "ACCT" } },
      }),
    );

    expect(response.status).toBe(403);
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("returns 413 before authenticating when the body is oversized", async () => {
    const response = await POST(
      mcpRequest(
        { jsonrpc: "2.0", id: 101, method: "tools/list", params: {} },
        { "content-length": String(MCP_MAX_BODY_BYTES + 1) },
      ),
    );

    expect(response.status).toBe(413);
    expect(authMock).not.toHaveBeenCalled();
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("maps a rate-limit rejection to a stable recoverable tool error", async () => {
    consumeMock.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const message = await callTool("search_catalog", { type: "course", query: "ACCT" });

    expect(message?.result?.isError).toBe(true);
    expect(toolErrorText(message)).toContain("Too many requests");
    expect(searchCatalogMock).not.toHaveBeenCalled();
  });

  it("maps a missing record to the stable not_found tool error", async () => {
    getCourseMock.mockRejectedValue(new McpToolError("not_found"));

    const message = await callTool("get_course", { code: "ZZZZ9999" });

    expect(message?.result?.isError).toBe(true);
    expect(toolErrorText(message)).toBe(new McpToolError("not_found").message);
  });

  it("maps the execution timeout to a stable temporarily_unavailable tool error", async () => {
    searchCatalogMock.mockImplementation(
      (_input: unknown, signal: AbortSignal): Promise<never> =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted.", "AbortError")),
            { once: true },
          );
        }),
    );

    const message = await callTool("search_catalog", { type: "course", query: "ACCT" });
    const stable = toolErrorText(message);

    expect(message?.result?.isError).toBe(true);
    expect(stable).toBe(new McpToolError("temporarily_unavailable").message);
  });

  it("rejects GET and DELETE with 405 without authenticating or touching data", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(authMock).not.toHaveBeenCalled();
    expect(searchCatalogMock).not.toHaveBeenCalled();
    expect(getCourseMock).not.toHaveBeenCalled();
    expect(getInstructorMock).not.toHaveBeenCalled();
    expect(getCourseReviewsMock).not.toHaveBeenCalled();
    expect(getCourseSectionsMock).not.toHaveBeenCalled();
  });
});
