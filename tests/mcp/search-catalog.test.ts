import { readFileSync } from "node:fs";
import path from "node:path";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeMock, rpcMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc: rpcMock } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@clerk/mcp-tools/next", () => ({ verifyClerkToken: vi.fn() }));
vi.mock("@/lib/mcp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/rate-limit")>();
  return { ...actual, consumeMcpRateLimits: consumeMock };
});

import { MCP_REQUIRED_SCOPE } from "@/lib/mcp/constants";
import type { McpToolContext, McpToolResult } from "@/lib/mcp/execute";
import { McpToolError } from "@/lib/mcp/errors";
import {
  type SearchCatalogOutput,
  catalogCourseSchema,
  catalogInstructorSchema,
  mcpReadOnlyAnnotations,
  mcpSearchCatalogInputSchema,
  mcpSearchCatalogOutputSchema,
  searchCatalogInputSchema,
  searchCatalogOutputSchema,
} from "@/lib/mcp/schemas";
import {
  SEARCH_CATALOG_ANNOTATIONS,
  SEARCH_CATALOG_DESCRIPTION,
  SEARCH_CATALOG_TOOL_CONFIG,
  SEARCH_CATALOG_TOOL_NAME,
  handleSearchCatalog,
  registerSearchCatalogTool,
} from "@/lib/mcp/tools/search-catalog";

type ListedTool = {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

type JsonRpcResponse = { id?: number; result?: { tools?: ListedTool[] }; error?: unknown };

/** Register the tool on a real MCP server and read its `tools/list` entry. */
async function listRegisteredTools(): Promise<ListedTool[]> {
  const server = new McpServer(
    { name: "search-catalog-test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerSearchCatalogTool(server);

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

const authInfo = {
  token: "tok",
  clientId: "client_1",
  scopes: ["openid", MCP_REQUIRED_SCOPE],
  extra: { userId: "user_1" },
};

const ctx: McpToolContext = { http: { authInfo } };

function queueRpc(payload: { data?: unknown; error?: unknown }) {
  const abortSignal = vi
    .fn()
    .mockResolvedValue({ data: payload.data ?? [], error: payload.error ?? null });
  rpcMock.mockReturnValue({ abortSignal });
  return { abortSignal };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("expected the tool to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(McpToolError);
    expect((error as McpToolError).code).toBe(code);
  }
}

/** Read `structuredContent` back through the output schema (and validate it). */
function readOutput(result: McpToolResult): SearchCatalogOutput {
  return searchCatalogOutputSchema.parse(result.structuredContent);
}

const courseRow = {
  course_code: "acct1000",
  course_title_eng: "Financial Accounting",
  course_title_chi: "財務會計",
  offering_unit: "FBA",
  offering_department: "ACCT",
  credits: "3",
  is_offered: 1,
  // Fields that must never be projected into MCP output.
  total_count: 42,
  id: "internal-course-1",
  admin_note: "do not leak",
  verify_account: 1,
  secret: "do not leak",
};

const instructorRow = {
  prof_id: "Chan Tai Man",
  course_count: "7",
  total_count: 3,
  id: "prof-with-course-1",
  secret: "do not leak",
};

const COURSE_KEYS = [
  "courseCode",
  "credits",
  "department",
  "faculty",
  "isOffered",
  "titleEn",
  "titleZh",
  "url",
];

const INSTRUCTOR_KEYS = ["courseCount", "name", "url"];

describe("search_catalog input schema", () => {
  it("requires at least one of query, faculty or department", () => {
    expect(searchCatalogInputSchema.safeParse({ type: "course" }).success).toBe(false);
    expect(
      searchCatalogInputSchema.safeParse({ type: "instructor", query: "", faculty: "", department: "" })
        .success,
    ).toBe(false);
  });

  it("treats blank filters as absent, so another filter can still satisfy the rule", () => {
    const parsed = searchCatalogInputSchema.safeParse({
      type: "course",
      query: "   ",
      faculty: "FBA",
      department: "\t",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.query).toBeUndefined();
    expect(parsed.data.department).toBeUndefined();
    expect(parsed.data.faculty).toBe("FBA");
  });

  it("trims string filters and applies the documented length bounds", () => {
    const parsed = searchCatalogInputSchema.safeParse({ type: "course", query: "  ACCT  " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.query).toBe("ACCT");

    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "x".repeat(80) }).success).toBe(
      true,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "x".repeat(81) }).success).toBe(
      false,
    );

    expect(searchCatalogInputSchema.safeParse({ type: "course", faculty: "x".repeat(40) }).success).toBe(
      true,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", faculty: "x".repeat(41) }).success).toBe(
      false,
    );

    expect(
      searchCatalogInputSchema.safeParse({ type: "course", department: "x".repeat(80) }).success,
    ).toBe(true);
    expect(
      searchCatalogInputSchema.safeParse({ type: "course", department: "x".repeat(81) }).success,
    ).toBe(false);
  });

  it("defaults limit to 10 and enforces the 1..10 range", () => {
    const parsed = searchCatalogInputSchema.safeParse({ type: "course", query: "ACCT" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(10);

    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "A", limit: 1 }).success).toBe(
      true,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "A", limit: 10 }).success).toBe(
      true,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "A", limit: 0 }).success).toBe(
      false,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "A", limit: 11 }).success).toBe(
      false,
    );
    expect(searchCatalogInputSchema.safeParse({ type: "course", query: "A", limit: 2.5 }).success).toBe(
      false,
    );
  });

  it("rejects unknown types and strips unknown fields", () => {
    expect(searchCatalogInputSchema.safeParse({ type: "admin", query: "A" }).success).toBe(false);

    const parsed = searchCatalogInputSchema.safeParse({
      type: "course",
      query: "A",
      page: 3,
      total_count: 99,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("page");
    expect(parsed.data).not.toHaveProperty("total_count");
  });
});

describe("search_catalog output schema", () => {
  it("accepts only absolute https://umeh.top reference URLs", () => {
    const result = catalogCourseSchema.safeParse({
      courseCode: "ACCT1000",
      titleEn: "Financial Accounting",
      titleZh: null,
      faculty: "FBA",
      department: "ACCT",
      credits: "3",
      isOffered: true,
      url: "https://evil.example/course/ACCT1000",
    });

    expect(result.success).toBe(false);
  });

  it("requires an absolute instructor reference URL too", () => {
    expect(
      catalogInstructorSchema.safeParse({
        name: "CHAN TAI MAN",
        courseCount: 2,
        url: "https://umeh.top/professor/CHAN%20TAI%20MAN",
      }).success,
    ).toBe(true);
    expect(
      catalogInstructorSchema.safeParse({
        name: "CHAN TAI MAN",
        courseCount: 2,
        url: "/professor/CHAN%20TAI%20MAN",
      }).success,
    ).toBe(false);
  });

  it("exposes read-only, non-destructive, closed-world annotations", () => {
    expect(mcpReadOnlyAnnotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});

describe("search_catalog MCP-facing schemas", () => {
  it("advertises a strict object input schema with the documented bounds", () => {
    const jsonSchema = mcpSearchCatalogInputSchema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });

    expect(jsonSchema.type).toBe("object");
    // `limit` is optional for the caller and defaults to 10; `type` is required.
    expect(jsonSchema.required).toEqual(["type"]);

    const properties = jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(properties.limit).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 10,
      default: 10,
    });
    expect(properties.query).toMatchObject({ type: "string", maxLength: 80 });
    expect(properties.faculty).toMatchObject({ type: "string", maxLength: 40 });
    expect(properties.department).toMatchObject({ type: "string", maxLength: 80 });
  });

  it("validates and normalizes through the standard-schema bridge", () => {
    const validate = mcpSearchCatalogInputSchema["~standard"].validate;

    const rejected = validate({ type: "course", query: "   " });
    expect("issues" in rejected && rejected.issues).toBeTruthy();

    const accepted = validate({ type: "course", query: "  ACCT  " });
    expect("value" in accepted).toBe(true);
    if (!("value" in accepted)) return;
    expect(accepted.value).toMatchObject({ type: "course", query: "ACCT", limit: 10 });
  });

  it("converts the output schema for tools/list", () => {
    const jsonSchema = mcpSearchCatalogOutputSchema["~standard"].jsonSchema.output({
      target: "draft-2020-12",
    });

    expect(JSON.stringify(jsonSchema)).toContain("courseCode");
    expect(JSON.stringify(jsonSchema)).toContain("instructor");
  });
});

describe("search_catalog data adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  it("queries search_planner_courses for a course search with page offset 0", async () => {
    const { abortSignal } = queueRpc({ data: [courseRow] });

    const result = await handleSearchCatalog({ type: "course", query: " ACCT " }, ctx);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("search_planner_courses", {
      keyword: "ACCT",
      faculty: null,
      department: null,
      page_limit: 10,
      page_offset: 0,
    });
    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(result.structuredContent).toBeDefined();
  });

  it("queries search_planner_instructors for an instructor search", async () => {
    queueRpc({ data: [instructorRow] });

    await handleSearchCatalog({ type: "instructor", faculty: "FBA", limit: 3 }, ctx);

    expect(rpcMock).toHaveBeenCalledWith("search_planner_instructors", {
      keyword: null,
      faculty: "FBA",
      department: null,
      page_limit: 3,
      page_offset: 0,
    });
  });

  it("projects course rows onto the contract whitelist only", async () => {
    queueRpc({ data: [courseRow] });

    const result = await handleSearchCatalog({ type: "course", query: "ACCT" }, ctx);

    expect(result.structuredContent).toEqual({
      type: "course",
      results: [
        {
          courseCode: "ACCT1000",
          titleEn: "Financial Accounting",
          titleZh: "財務會計",
          faculty: "FBA",
          department: "ACCT",
          credits: "3",
          isOffered: true,
          url: "https://umeh.top/course/ACCT1000",
        },
      ],
    });
    expect(Object.keys(readOutput(result).results[0]).sort()).toEqual(COURSE_KEYS);
  });

  it("projects instructor rows onto the contract whitelist and coerces course_count", async () => {
    queueRpc({ data: [instructorRow] });

    const result = await handleSearchCatalog({ type: "instructor", query: "Chan" }, ctx);

    expect(result.structuredContent).toEqual({
      type: "instructor",
      results: [
        {
          name: "Chan Tai Man",
          courseCount: 7,
          url: "https://umeh.top/professor/CHAN%20TAI%20MAN",
        },
      ],
    });
    expect(Object.keys(readOutput(result).results[0]).sort()).toEqual(INSTRUCTOR_KEYS);
  });

  it("never lets total_count, internal ids or unknown columns propagate", async () => {
    queueRpc({ data: [courseRow] });
    const courseResult = await handleSearchCatalog({ type: "course", query: "ACCT" }, ctx);

    queueRpc({ data: [instructorRow] });
    const instructorResult = await handleSearchCatalog({ type: "instructor", query: "Chan" }, ctx);

    for (const serialized of [
      JSON.stringify(courseResult.structuredContent),
      JSON.stringify(instructorResult.structuredContent),
    ]) {
      expect(serialized).not.toContain("total_count");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("admin_note");
      expect(serialized).not.toContain("verify_account");
      expect(serialized).not.toContain("internal-course-1");
      expect(serialized).not.toContain("prof-with-course-1");
    }
  });

  it("drops rows that cannot produce a reference URL", async () => {
    queueRpc({ data: [courseRow, { ...courseRow, course_code: null }, { ...courseRow, course_code: " " }] });

    const result = await handleSearchCatalog({ type: "course", query: "ACCT" }, ctx);

    expect(readOutput(result).results).toHaveLength(1);
    expect(readOutput(result).results[0]).toMatchObject({ courseCode: "ACCT1000" });
  });

  it("maps a missing is_offered flag to false", async () => {
    queueRpc({ data: [{ ...courseRow, is_offered: null }] });

    const result = await handleSearchCatalog({ type: "course", query: "ACCT" }, ctx);

    expect(readOutput(result).results[0]).toMatchObject({ isOffered: false });
  });

  it("returns a successful empty array with an actionable hint", async () => {
    queueRpc({ data: [] });

    const result = await handleSearchCatalog({ type: "course", query: "ZZZZ" }, ctx);

    expect(result.structuredContent).toEqual({ type: "course", results: [] });
    expect(result.content[0].text.toLowerCase()).toContain("no matching");
    expect(searchCatalogOutputSchema.safeParse(result.structuredContent).success).toBe(true);
  });
});

describe("search_catalog tool boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  it("requires authentication and never queries the database without it", async () => {
    await expectCode(handleSearchCatalog({ type: "course", query: "ACCT" }, {}), "unauthorized");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps invalid arguments to invalid_request without querying the database", async () => {
    await expectCode(handleSearchCatalog({ type: "course" }, ctx), "invalid_request");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps a Supabase failure to a non-leaking temporarily_unavailable", async () => {
    queueRpc({ error: { message: "permission denied for table course_noporf", code: "42501" } });

    try {
      await handleSearchCatalog({ type: "course", query: "ACCT" }, ctx);
      throw new Error("expected the tool to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe("temporarily_unavailable");
      expect(JSON.stringify(toolError.message)).not.toContain("permission denied");
    }
  });

  it("declares the approved read-only tool metadata", () => {
    expect(SEARCH_CATALOG_TOOL_NAME).toBe("search_catalog");
    expect(SEARCH_CATALOG_TOOL_CONFIG.annotations).toEqual(SEARCH_CATALOG_ANNOTATIONS);
    expect(SEARCH_CATALOG_ANNOTATIONS).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(SEARCH_CATALOG_TOOL_CONFIG.title.length).toBeGreaterThan(0);
    expect(SEARCH_CATALOG_DESCRIPTION).toContain("UMHelper");
    expect(SEARCH_CATALOG_DESCRIPTION.toLowerCase()).toMatch(/keep|retain|cite/);
    expect(SEARCH_CATALOG_DESCRIPTION).toContain("https://umeh.top");
    expect(SEARCH_CATALOG_DESCRIPTION.toLowerCase()).toContain("read-only");
    expect(String(SEARCH_CATALOG_ANNOTATIONS.title).length).toBeGreaterThan(0);
  });

  it("keeps the tool and data sources free of REST self-calls and raw selects", () => {
    const root = process.cwd();
    const files = [
      "lib/mcp/schemas.ts",
      "lib/mcp/data/search-catalog.ts",
      "lib/mcp/tools/search-catalog.ts",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not call the site REST API`).not.toContain("/api/");
      expect(source, `${file} must not use select("*")`).not.toMatch(/select\s*\(\s*["'`]\*["'`]\s*\)/);
      expect(source, `${file} must not log raw payloads`).not.toContain("console.log");
    }
  });
});

describe("search_catalog MCP registration", () => {
  it("advertises the tool with read-only annotations and both schemas", async () => {
    const tools = await listRegisteredTools();

    expect(tools).toHaveLength(1);
    const tool = tools[0];
    expect(tool.name).toBe("search_catalog");
    expect(tool.description).toBe(SEARCH_CATALOG_DESCRIPTION);
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      title: SEARCH_CATALOG_ANNOTATIONS.title,
    });

    const properties = tool.inputSchema?.properties as Record<string, Record<string, unknown>>;
    expect(tool.inputSchema?.type).toBe("object");
    expect(properties.limit).toMatchObject({ type: "integer", minimum: 1, maximum: 10 });

    expect(JSON.stringify(tool.outputSchema)).toContain("courseCode");
  });
});
