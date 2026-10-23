import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";

/**
 * Drives the real AssistantPanel, CopilotKitProvider, /api/copilotkit route, CopilotRuntime and
 * BuiltInAgent end to end. Only Clerk, assistant access, the rate-limit store, the catalog and the
 * model are replaced; the model is a script, so these tests prove what the model is given and how
 * many runs a turn costs, not how DeepSeek answers.
 */

type Step = { text: string } | { tool: string; input: Record<string, unknown> };
type ModelCall = {
  page: unknown;
  referent?: { kind: string; courseCode?: string; reason?: string; ask?: string };
  lastUser: string;
  lastTool?: { name: string; output: string };
  userMessages: string[];
  toolResults: string[];
};
type RunRecord = { body: { messages: Array<{ role: string; content?: unknown }> }; modelCalls: ModelCall[] };

const h = vi.hoisted(() => ({
  brain: (() => ({ text: "ok" })) as (call: never) => unknown,
  failNextModelCall: false,
  runs: [] as unknown[],
  serverToolCodes: [] as string[],
  rateLimitCalls: 0,
  rateLimit: { allowed: true } as AgentRateLimitOutcome,
  access: true,
  plan: undefined as unknown,
  core: undefined as unknown,
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
vi.mock("@/lib/assistant/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/navigation")>()),
  NAVIGATION_TIMEOUT_MS: 300,
}));
vi.mock("@/lib/assistant/tools", async () => {
  const { defineTool } = await import("@copilotkit/runtime/v2");
  const { z } = await import("zod");
  const { bindCourseToolArgs } = await import("@/lib/assistant/course-referent");
  type CourseReferent = import("@/lib/assistant/course-referent").CourseReferent;
  return {
    createAssistantTools: (slot?: { current: CourseReferent }) => [
      defineTool({
        name: "get_course",
        description: "Get a course",
        parameters: z.object({ code: z.string() }),
        execute: async (args: { code: string }) => {
          const bound = bindCourseToolArgs(slot?.current ?? { kind: "none" }, "get_course", args);
          if (bound.action === "clarify") return bound.result;
          const code = (bound.args as { code: string }).code;
          h.serverToolCodes.push(code);
          const courseCode = code.trim().toUpperCase();
          return {
            course: {
              courseCode,
              titleEn: `Fixture course ${courseCode}`,
              titleZh: null,
              credits: null,
              faculty: null,
              department: null,
              programLevel: null,
              suggestedYear: null,
              medium: null,
              gradingSystem: null,
              courseType: null,
              duration: null,
              description: null,
              isOffered: true,
              url: `${SITE_URL}/course/${courseCode}`,
            },
            page: 1,
            hasMore: false,
            totalCount: 0,
            instructors: [],
          };
        },
      }),
    ],
  };
});
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => scriptedModel(),
}));
vi.mock("@/lib/timetable/catalog-client", () => ({
  getCourseDetail: async (code: string) =>
    code.startsWith("ZZZZ")
      ? { course: { courseTitle: "Unknown Course" }, profList: [] }
      : { course: { courseTitle: `Fixture course ${code}` }, profList: [{}] },
  getInstructorCourses: async () => ({ courses: [] }),
  getSections: async () => ({
    sections: [{ section: "001", schedules: [{ date: "MON", time: "09:30-10:30", location: "E11" }] }],
  }),
}));
vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: () => ({ activePlan: h.plan }),
}));
vi.mock("@/components/assistant/assistant-chat", async () => {
  const { useCopilotKit } = await import("@copilotkit/react-core/v2/headless");
  return {
    default: function MockAssistantChat(props: { notice: string | null }) {
      h.core = useCopilotKit().copilotkit;
      return props.notice ? <div role="alert">{props.notice}</div> : null;
    },
  };
});

import * as route from "@/app/api/copilotkit/[[...slug]]/route";
import AssistantPanel from "@/components/assistant/assistant-panel";
import { COURSE_REFERENT_DESCRIPTION } from "@/lib/assistant/course-referent";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { SITE_URL } from "@/lib/site";

type Core = {
  getAgent(id: string): { messages: Array<{ role: string; content?: unknown }>; addMessage(message: unknown): void } | undefined;
  runAgent(params: { agent: unknown }): Promise<unknown>;
};

const runs = () => h.runs as RunRecord[];
const core = () => h.core as Core;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let toolCallCount = 0;
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
  toolCallCount++;
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `call-${toolCallCount}`, toolName: step.tool, input: JSON.stringify(step.input) },
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

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const marker = `${PAGE_CONTEXT_DESCRIPTION}:\n`;
  const at = system.indexOf(marker);
  const page = at < 0 ? undefined : JSON.parse(system.slice(at + marker.length).split("\n")[0]);

  let referent: ModelCall["referent"];
  const referentMarker = `${COURSE_REFERENT_DESCRIPTION}:\n`;
  const referentAt = system.indexOf(referentMarker);
  if (referentAt >= 0) {
    const valueLine = system.slice(referentAt + referentMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      referent = JSON.parse(valueLine);
    }
  }

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
    referent,
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
      if (h.failNextModelCall) {
        h.failNextModelCall = false;
        throw new Error("model provider unavailable");
      }
      const call = describeCall(prompt);
      runs().at(-1)!.modelCalls.push(call);
      const step = (h.brain as (call: ModelCall) => Step)(call);
      return { stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: streamFor(step) }) };
    },
  });
}

async function routeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost:3000");
  if (!url.pathname.startsWith("/api/copilotkit")) throw new Error(`unexpected fetch ${url}`);
  const { signal: _signal, ...rest } = init ?? {};
  const request = new NativeRequest(url, rest as never);
  if (request.method === "POST" && url.pathname.endsWith("/run")) {
    h.runs.push({
      body: (await request.clone().json()) as RunRecord["body"],
      modelCalls: [],
    } satisfies RunRecord);
  }
  const webRequest = request as unknown as Request;
  return request.method === "GET" ? route.GET(webRequest) : route.POST(webRequest);
}

async function mountAssistant(pathname: string) {
  nav.set(pathname);
  render(<AssistantPanel suppressed={false} />);
  await waitFor(() => expect(core()?.getAgent("default")).toBeDefined(), { timeout: 5000 });
}

/** Sends one student message and resolves once CopilotKit has finished every follow-up run. */
async function ask(text: string) {
  const before = runs().length;
  const agent = core().getAgent("default")!;
  agent.addMessage({ id: `user-${Math.random()}`, role: "user", content: text });
  await core().runAgent({ agent });
  return runs().slice(before);
}

const parsed = (value: string) => JSON.parse(value) as Record<string, unknown>;

beforeAll(() => {
  vi.stubEnv("AI_API_KEY", "sk-test");
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  // jsdom's Request carries a jsdom AbortSignal, which Node's RequestInit rejects.
  vi.stubGlobal("Request", NativeRequest);
  vi.stubGlobal("fetch", routeFetch);
  h.runs = [];
  h.serverToolCodes = [];
  h.rateLimitCalls = 0;
  h.rateLimit = { allowed: true };
  h.access = true;
  h.plan = undefined;
  h.core = undefined;
  h.failNextModelCall = false;
  nav.landOnPush = true;
  nav.pushes = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Stand-in for the model: follows the prompt's rules for the phrasings used in these tests. */
function courseBrain(call: ModelCall): Step {
  const page = call.page as { courseCode?: string };
  if (call.lastTool?.name === "get_course") {
    const output = parsed(call.lastTool.output) as { course: { courseCode: string } };
    return { text: `About ${output.course.courseCode}` };
  }
  if (call.lastTool?.name === "navigate") return { text: `navigate said ${parsed(call.lastTool.output).status}` };
  if (call.lastTool?.name === "check_plan_conflicts") return { text: "conflict checked" };

  const named = call.lastUser.match(/[A-Z]{4}\d{4}/)?.[0];
  if (/^Open/.test(call.lastUser)) return { tool: "navigate", input: { destination: "course", code: named } };
  if (/clash/.test(call.lastUser)) {
    return { tool: "check_plan_conflicts", input: { code: named, instructor: "CHAN TAI MAN", section: "001" } };
  }
  return { tool: "get_course", input: { code: named ?? page.courseCode } };
}

function staleChatBrain(call: ModelCall): Step {
  if (call.lastTool?.name === "get_course") {
    const output = JSON.parse(call.lastTool.output) as { course?: { courseCode?: string }; status?: string };
    if (output.status === "needs_clarification") return { text: output.status };
    return { text: `About ${output.course?.courseCode}` };
  }
  return { tool: "get_course", input: { code: "APAC2000" } };
}

describe("assistant runtime integration (scripted model)", () => {
  it("keeps page context, navigation and history consistent across the CISC2001 → CISC3014 conversation", async () => {
    h.brain = courseBrain as never;
    await mountAssistant("/course/CISC2001");
    const firstCore = core();

    const turn1 = await ask("Tell me about this course");
    expect(turn1).toHaveLength(1);
    expect(turn1[0].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC2001" });
    expect(h.serverToolCodes).toEqual(["CISC2001"]);

    const turn2 = await ask("Open CISC3014");
    expect(turn2).toHaveLength(2);
    expect(nav.pushes).toEqual(["/course/CISC3014"]);
    expect(turn2[0].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC2001" });
    expect(turn2[1].body.messages.at(-1)?.role).toBe("tool");
    const followUp = turn2[1].modelCalls[0];
    expect(followUp.page).toEqual({ page: "course", courseCode: "CISC3014" });
    expect(parsed(followUp.lastTool!.output)).toEqual({
      status: "navigated",
      page: { page: "course", courseCode: "CISC3014" },
    });

    const turn3 = await ask("What about this course?");
    expect(turn3).toHaveLength(1);
    expect(turn3[0].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC3014" });
    expect(h.serverToolCodes).toEqual(["CISC2001", "CISC3014"]);

    const turn4 = await ask("Compare it with CISC2001.");
    expect(turn4).toHaveLength(1);
    const compare = turn4[0].modelCalls[0];
    expect(compare.page).toEqual({ page: "course", courseCode: "CISC3014" });
    expect(compare.userMessages).toEqual([
      "Tell me about this course",
      "Open CISC3014",
      "What about this course?",
      "Compare it with CISC2001.",
    ]);
    expect(compare.toolResults.some((result) => result.includes('"courseCode":"CISC2001"'))).toBe(true);
    expect(compare.toolResults.some((result) => result.includes('"courseCode":"CISC3014"'))).toBe(true);

    expect(core()).toBe(firstCore);
    expect(h.rateLimitCalls).toBe(5);
    expect(runs().map((run) => run.modelCalls.length)).toEqual([2, 1, 1, 2, 2]);
  });

  it("uses the manually opened page for this course and keeps an explicit code", async () => {
    h.brain = staleChatBrain as never;
    await mountAssistant("/course/CISC2001");

    const discussed = await ask("Tell me about APAC2000.");
    expect(discussed[0].modelCalls[0].referent).toMatchObject({ kind: "explicit", courseCode: "APAC2000" });
    expect(h.serverToolCodes).toEqual(["APAC2000"]);

    nav.set("/course/CISC3014");
    const onPage = await ask("What sections does this course offer?");
    expect(onPage[0].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC3014" });
    expect(onPage[0].modelCalls[0].referent).toEqual({ kind: "page", courseCode: "CISC3014" });
    expect(h.serverToolCodes).toEqual(["APAC2000", "CISC3014"]);

    const named = await ask("What sections does APAC2000 have?");
    expect(named[0].modelCalls[0].referent).toEqual({ kind: "explicit", courseCode: "APAC2000" });
    expect(h.serverToolCodes).toEqual(["APAC2000", "CISC3014", "APAC2000"]);

    const pronoun = await ask("When are its classes?");
    expect(pronoun[0].modelCalls[0].referent).toEqual({ kind: "conversation", courseCode: "APAC2000" });
    expect(h.serverToolCodes.at(-1)).toBe("APAC2000");

    nav.set("/catalog");
    const ambiguous = await ask("What sections does this course offer?");
    expect(ambiguous[0].modelCalls[0].referent).toMatchObject({ kind: "ambiguous", reason: "no_page_course" });
    expect(h.serverToolCodes).toHaveLength(4);

    const agent = core().getAgent("default") as { setMessages(messages: unknown[]): void };
    agent.setMessages([]);
    const cleared = await ask("When are its classes?");
    expect(cleared[0].modelCalls[0].referent).toMatchObject({ kind: "ambiguous", reason: "no_prior_course" });
    expect(h.serverToolCodes).toHaveLength(4);
  });

  it("runs a follow-up after check_plan_conflicts, which has no followUp option set", async () => {
    h.brain = courseBrain as never;
    h.plan = {
      payload: {
        sections: [
          {
            key: "ACCT1000|CHAN|A01",
            courseCode: "ACCT1000",
            prof: "CHAN",
            section: "A01",
            color: "#2563eb",
            schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
          },
        ],
      },
    };
    await mountAssistant("/timetable");

    const turn = await ask("Does ECON1001 section 001 clash with my plan?");

    expect(turn).toHaveLength(2);
    expect(parsed(turn[1].modelCalls[0].lastTool!.output)).toEqual({
      found: true,
      conflicts: [{ with: "ACCT1000-A01", day: "MON" }],
    });
    expect(h.rateLimitCalls).toBe(2);
  });

  it("reports a course that does not exist without leaving the page", async () => {
    h.brain = courseBrain as never;
    await mountAssistant("/course/CISC2001");

    const turn = await ask("Open ZZZZ9999");

    expect(turn).toHaveLength(2);
    expect(nav.pushes).toEqual([]);
    expect(parsed(turn[1].modelCalls[0].lastTool!.output)).toEqual({ status: "not_found" });
    expect(turn[1].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC2001" });
  });

  it("refuses a second page after a timeout and shows the late page on the next turn", async () => {
    nav.landOnPush = false;
    let navigateCalls = 0;
    h.brain = ((call: ModelCall): Step => {
      if (call.lastTool?.name === "navigate" && parsed(call.lastTool.output).status === "limit_reached") {
        return { text: "The page has not finished opening yet." };
      }
      if (call.lastUser.startsWith("Open") && navigateCalls < 2) {
        navigateCalls++;
        return { tool: "navigate", input: { destination: "course", code: "CISC3014" } };
      }
      return { text: `page is ${JSON.stringify(call.page)}` };
    }) as never;
    await mountAssistant("/course/CISC2001");

    const turn = await ask("Open CISC3014");

    expect(turn).toHaveLength(3);
    expect(nav.pushes).toEqual(["/course/CISC3014"]);
    expect(parsed(turn[1].modelCalls[0].lastTool!.output)).toEqual({ status: "timeout" });
    expect(parsed(turn[2].modelCalls[0].lastTool!.output)).toEqual({ status: "limit_reached" });
    expect(h.rateLimitCalls).toBe(3);

    nav.set("/course/CISC3014");
    const next = await ask("What page am I on?");
    expect(next[0].modelCalls[0].page).toEqual({ page: "course", courseCode: "CISC3014" });
  });

  it("shows the rate-limit notice and answers normally once the limit clears", async () => {
    h.brain = (() => ({ text: "fine" })) as never;
    await mountAssistant("/");

    h.rateLimit = { allowed: false, window: "hour", retryAfter: 60 };
    const rejected = await ask("hello");
    expect(rejected[0].modelCalls).toHaveLength(0);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Too many requests. Please try again later.");

    h.rateLimit = { allowed: true };
    const retried = await ask("hello again");
    expect(retried[0].modelCalls).toHaveLength(1);
    const messages = core().getAgent("default")!.messages;
    expect(messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "hello",
      "hello again",
    ]);
    expect(textOf(messages.at(-1)?.content)).toBe("fine");
  });

  it("shows the unavailable notice when the model fails and recovers on the next message", async () => {
    h.brain = (() => ({ text: "back" })) as never;
    await mountAssistant("/");

    h.failNextModelCall = true;
    await ask("first");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The assistant is temporarily unavailable. Please try again.");

    await ask("second");
    expect(textOf(core().getAgent("default")!.messages.at(-1)?.content)).toBe("back");
  });
});
