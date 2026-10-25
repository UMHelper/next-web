import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";
import { McpToolError } from "@/lib/mcp/errors";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";

/**
 * Real AssistantPanel, CopilotKit provider, /api/copilotkit route, and assistant server tools
 * with mocked data adapters only. Proves V2.3.5-A student journeys end to end.
 */

type Step =
  | { text: string }
  | { tool: string; input: Record<string, unknown> }
  | { tools: { tool: string; input: Record<string, unknown> }[] };

type ModelCall = {
  page: unknown;
  catalog?: unknown;
  referent?: { kind: string; courseCode?: string; explicitCodes?: string[]; reason?: string; ask?: string };
  visibleBlocks?: { latestTurn: number; turns: Array<{ turn: number; blocks: Array<{ kind: string; course?: string }> }> };
  toolNames: string[];
  lastUser: string;
  lastTool?: { name: string; output: string };
  userMessages: string[];
  toolResults: string[];
};

type RunRecord = { body: { messages: Array<{ role: string; content?: unknown }> }; modelCalls: ModelCall[] };

const data = vi.hoisted(() => ({
  getCourse: vi.fn(),
  getCourseReviews: vi.fn(),
  getCourseSections: vi.fn(),
  searchCatalogForAssistant: vi.fn(),
  countCoursesForAssistant: vi.fn(),
  getInstructorForAssistant: vi.fn(),
  countCourseReviews: vi.fn(),
  getCourseText: vi.fn(),
  getAppConfig: vi.fn(),
}));

const h = vi.hoisted(() => ({
  brain: (() => ({ text: "ok" })) as (call: never) => unknown,
  runs: [] as unknown[],
  rateLimitCalls: 0,
  rateLimit: { allowed: true } as AgentRateLimitOutcome,
  access: true,
  plan: undefined as unknown,
}));

const nav = vi.hoisted(() => {
  let pathname = "/";
  const listeners = new Set<() => void>();
  return {
    landOnPush: true,
    pushes: [] as string[],
    get: () => pathname,
    set(next: string) {
      pathname = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

function gelhInstructors() {
  return [
    {
      name: "CHAN TAI MAN",
      commentCount: 24,
      result: 4.0,
      attendance: 3.2,
      grade: 3.5,
      difficulty: 2.58,
      reward: 4.0,
      isOffered: true,
      reviewUrl: absoluteUrl(buildReviewPath("GELH1000", "CHAN TAI MAN")),
    },
    {
      name: "LEE MEI LING",
      commentCount: 31,
      result: 4.1,
      attendance: 3.5,
      grade: 4.0,
      difficulty: 3.88,
      reward: 4.2,
      isOffered: true,
      reviewUrl: absoluteUrl(buildReviewPath("GELH1000", "LEE MEI LING")),
    },
    {
      name: "HO KA WAI",
      commentCount: 0,
      result: 0,
      attendance: 0,
      grade: 0,
      difficulty: 0,
      reward: 0,
      isOffered: false,
      reviewUrl: absoluteUrl(buildReviewPath("GELH1000", "HO KA WAI")),
    },
  ];
}

function courseRow(
  courseCode: string,
  titleEn: string,
  instructors: ReturnType<typeof gelhInstructors>,
) {
  return {
    course: {
      courseCode,
      titleEn,
      titleZh: null,
      credits: "3",
      faculty: "FSS",
      department: courseCode.slice(0, 4),
      programLevel: "UG",
      suggestedYear: "1",
      medium: "English",
      gradingSystem: "Graded",
      courseType: "Elective",
      duration: "One semester",
      description: `${titleEn} description.`,
      aka: [],
      isOffered: true,
      url: absoluteUrl(buildCoursePath(courseCode)),
    },
    page: 1,
    hasMore: false,
    totalCount: instructors.length,
    instructors,
  };
}

const gelhSearchFixture = {
  type: "course" as const,
  page: 1,
  hasMore: false,
  totalCount: 3,
  results: ["GELH1000", "GELH1001", "GELH2001"].map((courseCode) => ({
    courseCode,
    titleEn: `General Education ${courseCode}`,
    titleZh: null as string | null,
    faculty: "FSS" as string | null,
    department: "GELH" as string | null,
    credits: "3",
    isOffered: true,
    aka: [] as string[],
    url: absoluteUrl(buildCoursePath(courseCode)),
  })),
};

function wireFixtures() {
  data.getAppConfig.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
  data.getCourseText.mockImplementation(async (code: string) => ({
    courseCode: code.trim().toUpperCase(),
    text: "Full text.",
  }));
  data.countCoursesForAssistant.mockResolvedValue({ totalCount: 0 });
  data.countCourseReviews.mockResolvedValue({ totalCount: 12 });
  data.getInstructorForAssistant.mockRejectedValue(new McpToolError("not_found"));

  data.getCourse.mockImplementation(async (input: { code: string }) => {
    const code = input.code.trim().toUpperCase();
    if (code === "GELH1000") return courseRow(code, "Great Books", gelhInstructors());
    if (code === "GEST1004") {
      return courseRow(code, "Science and Technology", [
        {
          name: "WONG SIU MING",
          commentCount: 12,
          result: 3.8,
          attendance: 3.0,
          grade: 3.4,
          difficulty: 3.2,
          reward: 3.6,
          isOffered: true,
          reviewUrl: absoluteUrl(buildReviewPath(code, "WONG SIU MING")),
        },
      ]);
    }
    if (code === "GELH1001" || code === "GELH2001") {
      return courseRow(code, `Course ${code}`, []);
    }
    throw new McpToolError("not_found");
  });

  data.getCourseReviews.mockImplementation(async (input: { code: string; instructor: string }) => {
    const code = input.code.trim().toUpperCase();
    const instructor = input.instructor.trim().toUpperCase();
    const url = absoluteUrl(buildReviewPath(code, instructor));
    return {
      courseCode: code,
      instructor,
      page: 1,
      hasMore: false,
      url,
      reviews: [
        {
          publishedAt: "2026-05-01",
          content: "Sample review.",
          contentEn: null,
          result: 4,
          upvotes: 0,
          downvotes: 0,
          verified: false,
          url,
        },
      ],
    };
  });

  data.getCourseSections.mockImplementation(async (input: { code: string; instructor: string }) => {
    const courseCode = input.code.trim().toUpperCase();
    const instructor = input.instructor.trim().toUpperCase();
    if (courseCode !== "GELH1000" || instructor !== "LEE MEI LING") throw new McpToolError("not_found");
    return {
      courseCode,
      instructor,
      courseUrl: absoluteUrl(buildCoursePath(courseCode)),
      sectionDataComplete: false,
      term: { year: 2026, sem: 1 },
      sections: [
        {
          section: "001",
          schedules: [{ weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E11-1001" }],
          courseUrl: absoluteUrl(buildCoursePath(courseCode)),
        },
      ],
    };
  });

  data.searchCatalogForAssistant.mockImplementation(async (input: { query?: string }) => {
    const query = input.query?.toUpperCase() ?? "";
    if (query.includes("GEST")) throw new McpToolError("temporarily_unavailable");
    if (query.includes("GELH")) return gelhSearchFixture;
    throw new McpToolError("not_found");
  });
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({ getAppConfig: data.getAppConfig }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: data.getCourse }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: data.getCourseReviews }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: data.getCourseSections }));
vi.mock("@/lib/assistant/data/search-catalog", () => ({
  searchCatalogForAssistant: data.searchCatalogForAssistant,
  countCoursesForAssistant: data.countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/instructor", () => ({
  getInstructorForAssistant: data.getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", () => ({
  countCourseReviews: data.countCourseReviews,
}));
vi.mock("@/lib/assistant/data/course-text", () => ({
  getCourseText: data.getCourseText,
}));

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
    useRouter: () => ({
      push: (path: string) => {
        nav.pushes.push(path);
        if (nav.landOnPush) setTimeout(() => nav.set(new URL(path, "http://localhost").pathname), 0);
      },
    }),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: async () => h.access }));
vi.mock("@/lib/assistant/rate-limit", () => ({
  consumeAgentRateLimits: async () => {
    h.rateLimitCalls++;
    return h.rateLimit;
  },
}));
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => scriptedModel(),
}));
vi.mock("@/lib/timetable/catalog-client", () => ({
  getCourseDetail: async () => ({ course: { courseTitle: "Fixture" }, profList: [] }),
  getInstructorCourses: async () => ({ courses: [] }),
  getSections: async () => ({ sections: [] }),
}));
vi.mock("@/components/timetable/planner-provider", async () => {
  const { plannerState } = await import("@/tests/helpers/planner-state");
  return {
    useTimetablePlanner: () => (h.plan ? plannerState(h.plan) : plannerState(undefined)),
  };
});

import * as route from "@/app/api/copilotkit/[[...slug]]/route";
import AssistantPanel from "@/components/assistant/assistant-panel";
import { CATALOG_RESULTS_CONTEXT_DESCRIPTION } from "@/lib/assistant/catalog-result-sets";
import { COURSE_REFERENT_DESCRIPTION } from "@/lib/assistant/course-referent";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { VISIBLE_BLOCKS_CONTEXT_DESCRIPTION } from "@/lib/assistant/visible-blocks";

const runs = () => h.runs as RunRecord[];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let toolCallCount = 0;
let searchCallCount = 0;
let inflightRunPosts = 0;

function streamFor(step: Step): LanguageModelV3StreamPart[] {
  if ("text" in step) {
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: step.text },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
    ];
  }
  if ("tools" in step) {
    const chunks: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
    for (const entry of step.tools) {
      toolCallCount++;
      const toolCallId =
        entry.tool === "search_catalog" ? `call-${++searchCallCount}` : `tool-${toolCallCount}`;
      chunks.push({
        type: "tool-call",
        toolCallId,
        toolName: entry.tool,
        input: JSON.stringify(entry.input),
      });
    }
    chunks.push({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
    return chunks;
  }
  toolCallCount++;
  const toolCallId = step.tool === "search_catalog" ? `call-${++searchCallCount}` : `tool-${toolCallCount}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId, toolName: step.tool, input: JSON.stringify(step.input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
  ];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function outputOf(output: { type: string; value: unknown }): string {
  return typeof output.value === "string" ? output.value : JSON.stringify(output.value);
}

function toolNamesFrom(prompt: LanguageModelV3Prompt): string[] {
  const names: string[] = [];
  for (const message of prompt) {
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === "tool-call") names.push(part.toolName);
    }
  }
  return names;
}

function parseContextLine(system: string, marker: string): unknown {
  const at = system.indexOf(marker);
  if (at < 0) return undefined;
  const valueLine = system.slice(at + marker.length).split("\n")[0];
  if (!valueLine.startsWith("{")) return undefined;
  return JSON.parse(valueLine);
}

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const page = parseContextLine(system, `${PAGE_CONTEXT_DESCRIPTION}:\n`);
  const catalog = parseContextLine(system, `${CATALOG_RESULTS_CONTEXT_DESCRIPTION}:\n`);
  const referent = parseContextLine(system, `${COURSE_REFERENT_DESCRIPTION}:\n`) as ModelCall["referent"];
  const visibleBlocks = parseContextLine(system, `${VISIBLE_BLOCKS_CONTEXT_DESCRIPTION}:\n`) as ModelCall["visibleBlocks"];

  const userMessages = prompt.filter((message) => message.role === "user").map((message) => textOf(message.content));
  const toolResults = prompt.flatMap((message) =>
    message.role === "tool"
      ? message.content.flatMap((part) => (part.type === "tool-result" ? [outputOf(part.output as never)] : []))
      : [],
  );
  const last = prompt.at(-1)!;
  const lastResult = last.role === "tool" ? last.content.find((part) => part.type === "tool-result") : undefined;
  return {
    page,
    catalog,
    referent,
    visibleBlocks,
    toolNames: toolNamesFrom(prompt),
    lastUser: userMessages.at(-1) ?? "",
    lastTool:
      lastResult && lastResult.type === "tool-result"
        ? { name: lastResult.toolName, output: outputOf(lastResult.output as never) }
        : undefined,
    userMessages,
    toolResults,
  };
}

function scriptedModel() {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      const call = describeCall(prompt);
      runs().at(-1)!.modelCalls.push(call);
      const step = (h.brain as (call: ModelCall) => Step)(call);
      return { stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: streamFor(step) }) };
    },
  });
}

function v235Brain(call: ModelCall): Step {
  if (call.lastTool) {
    if (/What is GELH1000/i.test(call.lastUser)) return { text: "GELH1000 is a great books course." };
    if (/I'm considering taking it/i.test(call.lastUser)) {
      if (call.lastTool.name === "present_response") {
        return { text: "It looks manageable if you keep up with the readings." };
      }
      const reviewResults = call.toolResults.filter((out) => out.includes('"reviews"'));
      if (reviewResults.length >= 2) {
        return {
          tool: "present_response",
          input: { show: [{ component: "course_detail", course: "GELH1000" }] },
        };
      }
    }
    if (/Tell me more\.?$/i.test(call.lastUser.trim())) {
      if (call.lastTool.name === "present_response" && call.lastTool.output.includes("missing_lookup")) {
        return {
          tools: [
            { tool: "get_course", input: { code: "GELH1000" } },
            { tool: "present_response", input: { show: [{ component: "course_detail", course: "GELH1000" }] } },
          ],
        };
      }
      if (call.lastTool.name === "present_response") {
        return { text: "Here is a deeper look at GELH1000." };
      }
    }
    if (/Which professor is easier/i.test(call.lastUser)) {
      return { text: "LEE MEI LING is easier on average than CHAN TAI MAN, with more reviews." };
    }
    if (/How many credits is GEST1004/i.test(call.lastUser)) return { text: "GEST1004 is worth 3 credits." };
    if (/Compare GELH1000 and GEST1004/i.test(call.lastUser)) {
      return { text: "GELH1000 is humanities; GEST1004 is science and technology." };
    }
    if (/Show me the available sections of GELH1000 with LEE MEI LING/i.test(call.lastUser)) {
      if (call.lastTool.name === "present_response") {
        return { text: "These are LEE MEI LING's listed sections." };
      }
      if (call.toolResults.some((out) => out.includes("sectionDataComplete"))) {
        return {
          tool: "present_response",
          input: { show: [{ component: "course_sections", course: "GELH1000" }] },
        };
      }
    }
    if (/Is this course hard/i.test(call.lastUser)) {
      return { text: "Ratings suggest moderate difficulty overall." };
    }
    if (/Find GEST and GELH courses/i.test(call.lastUser)) {
      return { text: "I found GELH courses, but the GEST search failed just now." };
    }
    if (/What do students say about workload for CHAN TAI MAN/i.test(call.lastUser)) {
      return { text: "I couldn't read the reviews right now." };
    }
    if (/Still there/i.test(call.lastUser)) return { text: "Yes, the card from earlier is still in view." };
    return { text: "Here is the interpretation." };
  }

  if (/What is GELH1000/i.test(call.lastUser)) {
    return { tool: "get_course", input: { code: "GELH1000" } };
  }
  if (/I'm considering taking it/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "GELH1000" } },
        { tool: "get_course_reviews", input: { code: "GELH1000", instructor: "CHAN TAI MAN" } },
        { tool: "get_course_reviews", input: { code: "GELH1000", instructor: "LEE MEI LING" } },
      ],
    };
  }
  if (/Tell me more\.?$/i.test(call.lastUser.trim())) {
    return {
      tool: "present_response",
      input: { show: [{ component: "course_detail", course: "GELH1000" }] },
    };
  }
  if (/Which professor is easier/i.test(call.lastUser)) {
    return { tool: "get_course", input: { code: "GELH1000" } };
  }
  if (/How many credits is GEST1004/i.test(call.lastUser)) {
    return { tool: "get_course", input: { code: "GEST1004" } };
  }
  if (/Compare GELH1000 and GEST1004/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "GELH1000" } },
        { tool: "get_course", input: { code: "GEST1004" } },
      ],
    };
  }
  if (/Show me the available sections of GELH1000 with LEE MEI LING/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "GELH1000" } },
        { tool: "get_course_sections", input: { code: "GELH1000", instructor: "LEE MEI LING" } },
      ],
    };
  }
  if (/Is this course hard/i.test(call.lastUser)) {
    return { tool: "get_course", input: { code: "GELH1000" } };
  }
  if (/Find GEST and GELH courses/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "search_catalog", input: { type: "course", query: "GEST" } },
        { tool: "search_catalog", input: { type: "course", query: "GELH" } },
      ],
    };
  }
  if (/What do students say about workload for CHAN TAI MAN/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "GELH1000" } },
        { tool: "get_course_reviews", input: { code: "GELH1000", instructor: "CHAN TAI MAN" } },
      ],
    };
  }
  if (/Still there/i.test(call.lastUser)) {
    return { text: "Checking context." };
  }
  return { text: "ok" };
}

async function routeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost:3000");
  if (!url.pathname.startsWith("/api/copilotkit")) throw new Error(`unexpected fetch ${url}`);
  const { signal: _signal, ...rest } = init ?? {};
  const request = new NativeRequest(url, rest as never);
  const webRequest = request as unknown as Request;
  if (request.method === "POST" && url.pathname.endsWith("/run")) {
    h.runs.push({
      body: (await request.clone().json()) as RunRecord["body"],
      modelCalls: [],
    } satisfies RunRecord);
    inflightRunPosts++;
    try {
      return await route.POST(webRequest);
    } finally {
      inflightRunPosts--;
    }
  }
  return request.method === "GET" ? route.GET(webRequest) : route.POST(webRequest);
}

function linkRouter() {
  return {
    push: (href: string) => {
      nav.pushes.push(href);
      if (nav.landOnPush) setTimeout(() => nav.set(new URL(href, "http://localhost").pathname), 0);
    },
    replace: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}

function mountAssistant() {
  nav.set("/");
  render(
    <RouterContext.Provider value={linkRouter() as never}>
      <AssistantPanel suppressed={false} />
    </RouterContext.Provider>,
  );
  return waitFor(() => expect(screen.getByLabelText("Ask about courses")).toBeTruthy(), { timeout: 5000 });
}

function agentBusy() {
  return (
    inflightRunPosts > 0 ||
    screen.queryByText("Thinking…") ||
    screen.queryByText("Filtering results…") ||
    screen.queryByText("Searching the catalog…") ||
    screen.queryByText("Loading course details…") ||
    screen.queryByText("Loading class sections…")
  );
}

async function waitForAgentIdle() {
  let lastSignature = "";
  let stableChecks = 0;
  await waitFor(
    async () => {
      if (agentBusy()) {
        lastSignature = "";
        stableChecks = 0;
        expect(false).toBe(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (agentBusy() || inflightRunPosts > 0) {
        lastSignature = "";
        stableChecks = 0;
        expect(false).toBe(true);
      }
      const signature = `${runs().length}:${runs().flatMap((run) => run.modelCalls).length}`;
      if (signature === lastSignature) stableChecks++;
      else {
        lastSignature = signature;
        stableChecks = 0;
      }
      expect(stableChecks).toBeGreaterThanOrEqual(2);
    },
    { timeout: 10000 },
  );
}

async function typeAndSend(text: string) {
  const beforeRuns = runs().length;
  fireEvent.change(screen.getByLabelText("Ask about courses"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(runs().length).toBeGreaterThan(beforeRuns), { timeout: 10000 });
  await waitForAgentIdle();
}

function assistantTurnRootForUserMessage(text: string) {
  const userLabel = screen.getByText(text);
  const turnRoot = userLabel.closest("div.flex.flex-col.gap-3");
  if (!turnRoot) throw new Error(`assistant turn not found for user message: ${text}`);
  return turnRoot;
}

function presentResponseReceipts() {
  const receipts: Array<{ status: string }> = [];
  for (const out of runs().flatMap((run) => run.modelCalls).flatMap((call) => call.toolResults)) {
    if (!out.includes('"items"') || !out.includes('"eligibility"')) continue;
    try {
      const parsed = JSON.parse(out) as { status?: string; items?: unknown[] };
      if (parsed.status && Array.isArray(parsed.items)) receipts.push(parsed as { status: string });
    } catch {
      /* not a present_response receipt */
    }
  }
  return receipts;
}

beforeAll(() => {
  vi.stubEnv("AI_API_KEY", "sk-test");
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.stubGlobal("Request", NativeRequest);
  vi.stubGlobal("fetch", routeFetch);
  h.runs = [];
  h.rateLimitCalls = 0;
  h.rateLimit = { allowed: true };
  h.access = true;
  h.plan = undefined;
  h.brain = v235Brain as never;
  nav.landOnPush = true;
  nav.pushes = [];
  toolCallCount = 0;
  searchCallCount = 0;
  inflightRunPosts = 0;
  wireFixtures();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assistant V2.3.5-A integration (real tools, scripted model)", () => {
  it("J1 exploration: text-only fact, then a natural evaluation card, then historical tell-me-more recovery", async () => {
    await mountAssistant();

    await typeAndSend("What is GELH1000?");
    expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show GELH1000 details" })).toBeTruthy();

    await typeAndSend("I'm considering taking it.");
    await waitFor(() => expect(screen.getByRole("article", { name: "GELH1000" })).toBeTruthy(), { timeout: 10000 });
    expect(screen.getAllByRole("article", { name: "GELH1000" })).toHaveLength(1);
    const turn2Receipt = runs()
      .flatMap((run) => run.modelCalls)
      .flatMap((call) => call.toolResults)
      .map((out) => {
        try {
          return JSON.parse(out) as { status?: string; items?: Array<{ eligibility: string }> };
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.status === "requested" && parsed.items?.[0]?.eligibility === "ready");
    expect(turn2Receipt).toBeTruthy();

    await typeAndSend("Tell me more.");
    const turn3Calls = runs().at(-1)!.modelCalls;
    const turn3Results = turn3Calls.flatMap((call) => call.toolResults);
    expect(turn3Results.some((out) => out.includes("missing_lookup"))).toBe(true);
    expect(turn3Calls.some((call) => call.toolNames.includes("get_course"))).toBe(true);
    expect(turn3Calls.some((call) => call.toolNames.includes("present_response"))).toBe(true);
    expect(
      turn3Calls.some(
        (call) =>
          call.visibleBlocks?.turns.some(
            (entry) =>
              entry.turn === 2 &&
              entry.blocks.some((block) => block.kind === "course_detail" && block.course === "GELH1000"),
          ),
      ),
    ).toBe(true);
    const turn3Assistant = assistantTurnRootForUserMessage("Tell me more.");
    await waitFor(
      () => expect(within(turn3Assistant).getAllByRole("article", { name: "GELH1000" })).toHaveLength(1),
      { timeout: 10000 },
    );
    expect(screen.getAllByRole("article", { name: "GELH1000" })).toHaveLength(2);
  }, 120_000);

  it("J1 instructor comparison sees direction, sample size and nulled zero aggregates, with no card", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/course/GELH1000");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/GELH1000"));

    await typeAndSend("Which professor is easier?");
    const courseOutput = runs()
      .at(-1)!
      .modelCalls.find((call) => call.toolResults.some((out) => out.includes("GELH1000")))!
      .toolResults.find((out) => out.includes("ratingScale"))!;
    expect(courseOutput).toMatch(/EASIER/);
    expect(courseOutput).toContain('"difficulty":3.88');
    expect(courseOutput).toContain('"sampleSize":"adequate"');
    expect(courseOutput).toContain("LEE MEI LING");
    expect(courseOutput).toContain('"difficulty":null');
    expect(courseOutput).toContain('"sampleSize":"none"');
    expect(courseOutput).toContain("HO KA WAI");
    expect(
      screen.getByText("LEE MEI LING is easier on average than CHAN TAI MAN, with more reviews."),
    ).toBeTruthy();
    expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
  }, 60_000);

  it("keeps a credit question text-only", async () => {
    await mountAssistant();
    await typeAndSend("How many credits is GEST1004?");
    expect(screen.getByText("GEST1004 is worth 3 credits.")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "GEST1004" })).toBeNull();
    const turnCalls = runs().at(-1)!.modelCalls;
    expect(turnCalls.some((call) => call.toolNames.includes("get_course"))).toBe(true);
    expect(turnCalls.flatMap((call) => call.toolResults).some((out) => out.includes("GEST1004"))).toBe(true);
  }, 60_000);

  it("keeps a two-course comparison free of stacked cards", async () => {
    await mountAssistant();
    await typeAndSend("Compare GELH1000 and GEST1004.");
    expect(screen.getByText(/GELH1000 is humanities/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show GELH1000 details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show GEST1004 details" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
    expect(screen.queryByRole("article", { name: "GEST1004" })).toBeNull();
    const turnResults = runs().at(-1)!.modelCalls.flatMap((call) => call.toolResults);
    const courseCodes = turnResults
      .map((out) => {
        try {
          const parsed = JSON.parse(out) as { course?: { courseCode?: string } };
          return parsed.course?.courseCode;
        } catch {
          return undefined;
        }
      })
      .filter((code): code is string => typeof code === "string");
    expect(courseCodes.filter((code) => code === "GELH1000").length).toBeGreaterThanOrEqual(1);
    expect(courseCodes.filter((code) => code === "GEST1004").length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("shows section cards on request and the incomplete note when data was cut", async () => {
    await mountAssistant();
    await typeAndSend("Show me the available sections of GELH1000 with LEE MEI LING.");
    await waitFor(() => expect(screen.getByRole("article", { name: "Section 001" })).toBeTruthy(), {
      timeout: 10000,
    });
    expect(screen.getByText("Some sections or class times could not be listed.")).toBeTruthy();

    const turnResults = runs().at(-1)!.modelCalls.flatMap((call) => call.toolResults);
    const sectionsOutput = turnResults.find(
      (out) => out.includes("sectionDataComplete") && out.includes("GELH1000"),
    );
    expect(sectionsOutput).toBeTruthy();
    expect(JSON.parse(sectionsOutput!)).toMatchObject({ sectionDataComplete: false });

    const sectionReceipt = turnResults
      .map((out) => {
        try {
          return JSON.parse(out) as {
            status?: string;
            items?: Array<{ component: string; course: string; eligibility: string }>;
          };
        } catch {
          return null;
        }
      })
      .find(
        (parsed) =>
          parsed?.status === "requested" &&
          parsed.items?.some((item) => item.component === "course_sections" && item.eligibility),
      );
    expect(sectionReceipt).toBeTruthy();
    expect(sectionReceipt!.items!.some((item) => item.component === "course_sections" && item.course === "GELH1000")).toBe(
      true,
    );
  }, 60_000);

  it("resolves a course-page evaluation from the page referent", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/course/GELH1000");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/GELH1000"));
    await typeAndSend("Is this course hard?");
    expect(data.getCourse).toHaveBeenCalledWith(expect.objectContaining({ code: "GELH1000" }));
    const firstCall = runs().at(-1)!.modelCalls[0];
    expect(firstCall.referent).toMatchObject({ kind: "page", courseCode: "GELH1000" });
    expect(screen.getByText("Ratings suggest moderate difficulty overall.")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
  }, 60_000);

  it("J5 partial failure: a failed search and a populated search stay distinct", async () => {
    await mountAssistant();
    await typeAndSend("Find GEST and GELH courses.");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The catalog is temporarily unavailable."), {
      timeout: 10000,
    });
    expect(screen.getByRole("link", { name: /GELH1000/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /GELH1001/ })).toBeTruthy();
    const toolResults = runs().at(-1)!.modelCalls.flatMap((call) => call.toolResults);
    expect(toolResults.some((out) => out.includes('"error":"temporarily_unavailable"'))).toBe(true);
    expect(toolResults.some((out) => out.includes("GELH1000"))).toBe(true);
  }, 60_000);

  it("reports a review read failure as temporarily_unavailable, not not_found", async () => {
    data.getCourseReviews.mockRejectedValueOnce(new Error("mapping exploded"));
    await mountAssistant();
    await typeAndSend("What do students say about workload for CHAN TAI MAN?");
    const reviewOutput = runs()
      .at(-1)!
      .modelCalls.flatMap((call) => call.toolResults)
      .find((out) => out.includes("temporarily_unavailable") || out.includes("not_found"));
    expect(reviewOutput).toContain("temporarily_unavailable");
    expect(reviewOutput).not.toContain("not_found");
    expect(screen.getByText("I couldn't read the reviews right now.")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
  }, 60_000);

  it("keeps cards and visible-blocks context after closing and reopening the sidebar", async () => {
    await mountAssistant();
    await typeAndSend("What is GELH1000?");
    await typeAndSend("I'm considering taking it.");
    await waitFor(() => expect(screen.getByRole("article", { name: "GELH1000" })).toBeTruthy(), { timeout: 10000 });

    await act(async () => {
      nav.set("/course/GELH1000");
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "AI Course Helper" }));
    await waitFor(() => expect(screen.getByRole("article", { name: "GELH1000" })).toBeTruthy(), { timeout: 10000 });

    await typeAndSend("Still there?");
    expect(screen.getByText("Checking context.")).toBeTruthy();
    const contextCall = runs().at(-1)!.modelCalls[0];
    expect(
      contextCall.visibleBlocks?.turns.some((entry) =>
        entry.blocks.some((block) => block.kind === "course_detail" && block.course === "GELH1000"),
      ),
    ).toBe(true);
  }, 120_000);

  it("never sends present_response status accepted", async () => {
    await mountAssistant();
    await typeAndSend("What is GELH1000?");
    await typeAndSend("I'm considering taking it.");
    await typeAndSend("Tell me more.");
    await typeAndSend("Show me the available sections of GELH1000 with LEE MEI LING.");

    for (const parsed of presentResponseReceipts()) {
      expect(parsed.status).toBe("requested");
      expect(parsed.status).not.toBe("accepted");
    }
    const allPresentStrings = runs().flatMap((run) => run.modelCalls).flatMap((call) => call.toolResults);
    expect(allPresentStrings.some((out) => out.includes('"status":"accepted"'))).toBe(false);
    expect(screen.getByText("These are LEE MEI LING's listed sections.")).toBeTruthy();
  }, 150_000);
});
