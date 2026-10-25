import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { Message, ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

import {
  AssistantChatView,
  type AssistantChatViewProps,
} from "@/components/assistant/assistant-chat-view";
import { CourseDetailToolResult } from "@/components/assistant/course-detail-tool-render";
import { TimetablePreviewToolResult } from "@/components/assistant/timetable-preview-tool-render";
import { PREVIEW_TIMETABLE_TOOL_NAME, runPreviewTimetable } from "@/lib/assistant/timetable-preview";
import type { TimetableToolDeps } from "@/lib/assistant/timetable-tools";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { McpToolError } from "@/lib/mcp/errors";
import { RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import { SITE_URL } from "@/lib/site";
import { FIXTURE_CATALOG_SECTIONS, FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

function catalogBody(totalCount = 0) {
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: false,
    totalCount,
    results: [],
  });
}

const reviewsBody = JSON.stringify({
  courseCode: "CISC1001",
  instructor: "XU QI WEN",
  page: 1,
  hasMore: false,
  url: `${SITE_URL}/reviews/CISC1001/XU%20QI%20WEN`,
  reviews: [],
});

const emptyToolOk = JSON.stringify({});

const gelhCourseBody = JSON.stringify({
  course: {
    courseCode: "GELH1000",
    titleEn: "Great Books",
    titleZh: null,
    credits: "3",
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
    url: `${SITE_URL}/course/GELH1000`,
  },
  page: 1,
  hasMore: false,
  totalCount: 0,
  instructors: [],
});

const courseBody = JSON.stringify({
  course: {
    courseCode: "APAC1000",
    titleEn: null,
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
    isOffered: false,
    url: `${SITE_URL}/course/APAC1000`,
  },
  page: 1,
  hasMore: false,
  totalCount: 0,
  instructors: [],
});

const sectionsBody = JSON.stringify({
  courseCode: "APAC1000",
  instructor: "CHAN TAI MAN",
  courseUrl: `${SITE_URL}/course/APAC1000`,
  sections: [],
});

function fakeToolRenderer() {
  return {
    names: RICH_TOOL_NAMES,
    render: (call: ToolCall, result: ToolMessage | undefined) => {
      if (call.function.name === PREVIEW_TIMETABLE_TOOL_NAME) {
        return (
          <TimetablePreviewToolResult
            status={result ? "complete" : "inProgress"}
            result={typeof result?.content === "string" ? result.content : undefined}
          />
        );
      }
      return (
        <div data-testid={`rich-${call.id}`}>
          {typeof result?.content === "string" ? result.content : "loading"}
        </div>
      );
    },
  };
}

const previewDeps = (): TimetableToolDeps => ({
  loadSections: async (input) => {
    const match = FIXTURE_CATALOG_SECTIONS.find(
      (entry) => entry.courseCode === input.code.toUpperCase() && entry.instructor === input.instructor,
    );
    if (!match) throw new McpToolError("not_found");
    return { ...match, sectionDataComplete: true };
  },
  loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
});

const previewReadyState = (): TimetableState => ({
  status: "ready",
  plan: {
    name: FIXTURE_PLAN.name,
    year: FIXTURE_PLAN.year,
    sem: FIXTURE_PLAN.sem,
    sections: FIXTURE_PLAN.payload.sections,
  },
  currentTerm: { year: 2026, sem: 1 },
  otherPlansThisTerm: 0,
  localOnly: false,
  truncated: false,
  version: timetableVersion(FIXTURE_PLAN.payload.sections),
});

function activityRows() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-status]"));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const MESSAGES: Message[] = [
  { id: "u1", role: "user", content: "What is ACCT1000?" },
  {
    id: "a1",
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "search_catalog", arguments: '{"query":"ACCT1000"}' },
      },
    ],
  },
  {
    id: "t1",
    role: "tool",
    toolCallId: "call-1",
    content:
      '{"type":"course","page":1,"hasMore":false,"totalCount":0,"results":[]}',
  },
  {
    id: "a2",
    role: "assistant",
    content:
      "**3 credits**\n\n- Prerequisite: none\n- Assessment: final exam\n\nOpen [Course reviews](/reviews/ACCT1000) after `ACCT1000`.",
  },
];

function renderView(overrides: Partial<AssistantChatViewProps> = {}) {
  const props: AssistantChatViewProps = {
    messages: [],
    suggestions: [{ title: "Q1", message: "M1" }],
    isRunning: false,
    isReady: true,
    draft: "",
    alert: null,
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onNewChat: vi.fn(),
    onClose: vi.fn(),
    onClearAlert: vi.fn(),
    ...overrides,
  };
  render(<AssistantChatView {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AssistantChatView", () => {
  it("shows the welcome intro and sends an example question", () => {
    const props = renderView();

    expect(screen.getByText("What can I help with?")).toBeTruthy();
    expect(screen.getByText(/Ask about courses, professors, reviews, class times/)).toBeTruthy();
    expect(screen.getAllByText(/查課程、教授、評價/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/read-only|30 turns/)).toBeNull();
    expect(screen.queryByText("Beta")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Q1" }));
    expect(props.onSend).toHaveBeenCalledWith("M1");
  });

  it("falls back to the built-in examples when no suggestions are configured", () => {
    renderView({ suggestions: [] });

    expect(screen.getByText("Which courses cover accounting?")).toBeTruthy();
    expect(screen.getByText("What is ACCT1000? How many credits?")).toBeTruthy();
  });

  it("does not show model reasoning text in the sidebar", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "Show me CISC3014" },
        { id: "r1", role: "reasoning", content: "PRIVATE-CHAIN-OF-THOUGHT" },
        { id: "a1", role: "assistant", content: "Opened CISC3014." },
      ],
    });

    expect(screen.getByText("Opened CISC3014.")).toBeTruthy();
    expect(screen.queryByText("PRIVATE-CHAIN-OF-THOUGHT")).toBeNull();
    expect(screen.queryByText("Reasoning")).toBeNull();
  });

  it("renders bold-only assistant text through markdown", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "How many credits?" },
        { id: "a1", role: "assistant", content: "**3 credits**" },
      ],
    });

    expect(screen.getByText("3 credits")).toBeTruthy();
    expect(screen.queryByText("**3 credits**")).toBeNull();
  });

  it("splits glued sentences so each is findable by getByText", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "MATH courses" },
        {
          id: "a1",
          role: "assistant",
          content: "Here are MATH courses.Filtered to offered courses.",
        },
      ],
    });

    expect(screen.getByText("Here are MATH courses.")).toBeTruthy();
    expect(screen.getByText("Filtered to offered courses.")).toBeTruthy();
  });

  it("renders user and assistant turns with the tool trace and markdown", () => {
    renderView({ messages: MESSAGES });

    expect(screen.getByText("What is ACCT1000?")).toBeTruthy();
    expect(screen.getByText("Searched courses")).toBeTruthy();
    expect(screen.getByText("3 credits")).toBeTruthy();
    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getByText("Prerequisite: none")).toBeTruthy();
    expect(screen.getByText("ACCT1000", { selector: "code" })).toBeTruthy();

    const link = screen.getByRole("link", { name: "Course reviews" });
    expect(link.getAttribute("href")).toBe("/reviews/ACCT1000");
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeTruthy();
  });

  it("labels count and course-text tools instead of falling back to Chinese", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "CISC1001 xuqiwen 如何？" },
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "get_course_reviews", arguments: '{"code":"CISC1001","instructor":"XU QI WEN"}' },
            },
            {
              id: "call-2",
              type: "function",
              function: { name: "count_reviews", arguments: '{"code":"CISC1001","instructor":"XU QI WEN"}' },
            },
            {
              id: "call-3",
              type: "function",
              function: { name: "get_course_ilo", arguments: '{"code":"CISC1001"}' },
            },
            {
              id: "call-4",
              type: "function",
              function: { name: "custom_tool", arguments: "{}" },
            },
          ],
        },
        { id: "t1", role: "tool", toolCallId: "call-1", content: reviewsBody },
        { id: "t2", role: "tool", toolCallId: "call-2", content: emptyToolOk },
        { id: "t3", role: "tool", toolCallId: "call-3", content: emptyToolOk },
        { id: "t4", role: "tool", toolCallId: "call-4", content: emptyToolOk },
      ],
    });

    expect(screen.getByText("Read reviews")).toBeTruthy();
    expect(screen.getByText("Counted reviews")).toBeTruthy();
    expect(screen.getByText("Read learning outcomes")).toBeTruthy();
    expect(screen.getByText("Used custom_tool")).toBeTruthy();
    expect(screen.queryByText(/已使用/)).toBeNull();
  });

  it("renders GFM tables as real tables", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "Compare these courses" },
        {
          id: "a1",
          role: "assistant",
          content:
            "| Course | Credits |\n| --- | ---: |\n| **ACCT1000** | 3 |\n| ACCT2000 | 3 |",
        },
      ],
    });

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Course" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Credits" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "ACCT1000" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "ACCT2000" })).toBeTruthy();
    expect(screen.queryByText(/\| Course \|/)).toBeNull();
  });

  it("renders one tool trace and one copy action per turn", () => {
    renderView({
      messages: [
        { id: "u1", role: "user", content: "Which courses cover accounting?" },
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
            },
          ],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "call-1",
          content:
            '{"type":"course","page":1,"hasMore":false,"totalCount":0,"results":[]}',
        },
        {
          id: "a2",
          role: "assistant",
          content: "I'll look up accounting courses in the catalog.",
          toolCalls: [
            {
              id: "call-2",
              type: "function",
              function: { name: "search_catalog", arguments: "{}" },
            },
          ],
        },
        { id: "a3", role: "assistant", content: "Showing 10 of 58 ACCT courses." },
      ],
    });

    expect(screen.getAllByText("Searched courses")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy reply" })).toHaveLength(1);
  });

  it("shows the thinking row and a stop control while the agent runs", () => {
    const props = renderView({
      messages: [{ id: "u1", role: "user", content: "ACCT1001 呢？" }],
      isRunning: true,
    });

    expect(screen.getByText(/AI is thinking/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(props.onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("sends on Enter and keeps Shift+Enter for a newline", () => {
    const props = renderView({ draft: "hello" });
    const textarea = screen.getByLabelText("Ask about courses");

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(props.onSend).toHaveBeenCalledWith("hello");

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("sends from the button and disables it for an empty draft", () => {
    const props = renderView({ draft: "ACCT1000" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(props.onSend).toHaveBeenCalledWith("ACCT1000");

    cleanup();
    renderView({ draft: "   " });
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows an alert and clears it", () => {
    const props = renderView({ alert: "Too many requests. Please try again later." });

    expect(screen.getByRole("alert").textContent).toContain("Too many requests");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(props.onClearAlert).toHaveBeenCalledTimes(1);
  });

  it("closes from the header and starts a new conversation", () => {
    const props = renderView();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(props.onNewChat).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the concise affiliation and AI-reference disclaimer below the composer", () => {
    renderView();

    expect(
      screen.getByText(/Not affiliated with UM/),
    ).toBeTruthy();
    expect(screen.getByText(/與澳門大學無隸屬關係/)).toBeTruthy();
    expect(screen.queryByText(/myUM/)).toBeNull();
  });

  it("disables the composer and suggestions until the agent is ready", () => {
    renderView({ isReady: false });

    expect(screen.getByRole("button", { name: "Q1" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  });

  describe("toolRenderer", () => {
    it("renders one search activity row and the rich block", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "ACCT" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: catalogBody() },
          { id: "a2", role: "assistant", content: "Found courses." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe(catalogBody());
      expect(screen.getAllByText("Searched courses")).toHaveLength(1);
      expect(activityRows()).toHaveLength(1);
      expect(activityRows()[0].textContent).toContain("ACCT");
    });

    it("keeps non-rich tools in ToolTrace", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "course" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "get_instructor", arguments: '{"name":"CHAN TAI MAN"}' },
              },
            ],
          },
          {
            id: "t1",
            role: "tool",
            toolCallId: "call-1",
            content:
              '{"name":"CHAN TAI MAN","page":1,"hasMore":false,"totalCount":0,"courses":[]}',
          },
          { id: "a2", role: "assistant", content: "Here is CHAN TAI MAN." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByText("Read instructor")).toBeTruthy();
      expect(screen.queryByTestId("rich-call-1")).toBeNull();
    });

    it("pairs tool results by toolCallId only", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"A"}' },
              },
              {
                id: "call-x",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"B"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: "for-call-1" },
          { id: "t2", role: "tool", toolCallId: "call-x", content: "for-call-x" },
          { id: "a2", role: "assistant", content: "Done." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe("for-call-1");
      expect(screen.getByTestId("rich-call-x").textContent).toBe("for-call-x");
    });

    it("pairs a late tool message with the earlier call", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "a2", role: "assistant", content: "Still working on it." },
          { id: "t1", role: "tool", toolCallId: "call-1", content: "late-result" },
          { id: "a3", role: "assistant", content: "All set." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe("late-result");
    });

    it("renders two rich search blocks in call order", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "two searches" },
          {
            id: "a1",
            role: "assistant",
            content: "First pass.",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: "first" },
          {
            id: "a2",
            role: "assistant",
            content: "Second pass.",
            toolCalls: [
              {
                id: "call-2",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"CISC"}' },
              },
            ],
          },
          { id: "t2", role: "tool", toolCallId: "call-2", content: "second" },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      const rich = screen.getAllByTestId(/^rich-call-/);
      expect(rich.map((node) => node.textContent)).toEqual(["first", "second"]);
    });

    it("shows Not completed in trace when interrupted without a result", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "a2", role: "assistant", content: "Stopped early." },
        ],
        isRunning: false,
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Not completed")).toHaveLength(1);
      expect(screen.queryByText("Searching courses…")).toBeNull();
      expect(screen.queryByTestId("rich-call-1")).toBeNull();
    });

    it("shows loading in the rich block while running without a result", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
        ],
        isRunning: true,
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe("loading");
      expect(screen.getAllByText("Searching courses…")).toHaveLength(1);
      expect(screen.queryByText("Searched courses")).toBeNull();
      expect(activityRows().map((node) => node.textContent)).toEqual([
        expect.stringContaining("Searching courses…"),
      ]);
      expect(screen.queryByText(/AI is thinking/)).toBeNull();
    });

    it("renders two rich blocks for identical args with different ids and results", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "two searches" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
              {
                id: "call-2",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: catalogBody(1) },
          { id: "t2", role: "tool", toolCallId: "call-2", content: catalogBody(2) },
          { id: "a2", role: "assistant", content: "Done." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe(catalogBody(1));
      expect(screen.getByTestId("rich-call-2").textContent).toBe(catalogBody(2));
      expect(screen.getAllByText("Searched courses")).toHaveLength(2);
      expect(activityRows()).toHaveLength(2);
    });

    it("does not restart loading on an incomplete call from a previous turn", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "first" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-old",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "a2", role: "assistant", content: "Stopped." },
          { id: "u2", role: "user", content: "second" },
        ],
        isRunning: true,
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Not completed")).toHaveLength(1);
      expect(screen.queryByText("Searching courses…")).toBeNull();
      expect(screen.queryByTestId("rich-call-old")).toBeNull();
    });

    it("keeps completed rich results visible while a new turn runs", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "first" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: catalogBody() },
          { id: "a2", role: "assistant", content: "Found some." },
          { id: "u2", role: "user", content: "follow up" },
        ],
        isRunning: true,
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-call-1").textContent).toBe(catalogBody());
      expect(screen.getAllByText("Searched courses")).toHaveLength(1);
      expect(screen.queryByText("Searching courses…")).toBeNull();
      expect(screen.getByText(/AI is thinking/)).toBeTruthy();
    });

    it("dedupes a replayed empty-arg search_catalog call", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: catalogBody() },
          {
            id: "a2",
            role: "assistant",
            content: "Looking again.",
            toolCalls: [
              {
                id: "call-2",
                type: "function",
                function: { name: "search_catalog", arguments: "{}" },
              },
            ],
          },
          { id: "a3", role: "assistant", content: "Done." },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByTestId(/^rich-call-/)).toHaveLength(1);
      expect(screen.getAllByText("Searched courses")).toHaveLength(1);
      expect(screen.queryByText("Not completed")).toBeNull();
    });

    function courseDetailToolRenderer() {
      return {
        names: RICH_TOOL_NAMES,
        render: (call: ToolCall, result: ToolMessage | undefined) => {
          if (call.function.name === "get_course") {
            return (
              <CourseDetailToolResult
                status={result ? "complete" : "inProgress"}
                result={typeof result?.content === "string" ? result.content : undefined}
              />
            );
          }
          return fakeToolRenderer().render(call, result);
        },
      };
    }

    it("offers a show-details button for an unclaimed course lookup and mounts the card on click", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "What is GELH1000?" },
          {
            id: "a1",
            role: "assistant",
            content: "GELH1000 is a great books course.",
            toolCalls: [
              {
                id: "c1",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"GELH1000"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "c1", content: gelhCourseBody },
        ],
        toolRenderer: courseDetailToolRenderer(),
      });

      expect(screen.queryByRole("article", { name: "GELH1000" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Show GELH1000 details" }));
      expect(screen.getByRole("article", { name: "GELH1000" })).toBeTruthy();
    });

    it("offers no button for a failed lookup or an already mounted card", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "APAC1000" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: '{"error":"not_found"}' },
        ],
        toolRenderer: courseDetailToolRenderer(),
      });

      expect(screen.queryByRole("button", { name: /Show .* details/ })).toBeNull();

      cleanup();

      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show the full details of APAC1000." },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
              {
                id: "p",
                type: "function",
                function: {
                  name: "present_response",
                  arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
                },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "g", content: courseBody },
          {
            id: "t2",
            role: "tool",
            toolCallId: "p",
            content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}',
          },
        ],
        toolRenderer: courseDetailToolRenderer(),
      });

      expect(screen.getByRole("article", { name: "APAC1000" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Show APAC1000 details" })).toBeNull();
    });

    it("offers one button for two lookups of the same course", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "GELH1000?" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "g1", type: "function", function: { name: "get_course", arguments: '{"code":"GELH1000"}' } },
              { id: "g2", type: "function", function: { name: "get_course", arguments: '{"code":"GELH1000"}' } },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "g1", content: gelhCourseBody },
          { id: "t2", role: "tool", toolCallId: "g2", content: gelhCourseBody },
        ],
        toolRenderer: courseDetailToolRenderer(),
      });

      expect(screen.getAllByRole("button", { name: "Show GELH1000 details" })).toHaveLength(1);
    });

    it("offers no button while the turn is still streaming", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "GELH1000?" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "c1",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"GELH1000"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "c1", content: gelhCourseBody },
        ],
        isRunning: true,
        toolRenderer: courseDetailToolRenderer(),
      });

      expect(screen.queryByRole("button", { name: "Show GELH1000 details" })).toBeNull();
    });

    it("renders one activity row and a rich block for get_course", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Tell me about APAC1000." },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-course",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-course", content: courseBody },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Read course")).toHaveLength(1);
      expect(activityRows()[0].textContent).toContain("APAC1000");
      expect(screen.queryByTestId("rich-call-course")).toBeNull();
    });

    it("renders one activity row and a rich block for get_course_sections", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "When is APAC1000 taught?" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-sections",
                type: "function",
                function: {
                  name: "get_course_sections",
                  arguments: '{"code":"APAC1000","instructor":"CHAN TAI MAN"}',
                },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-sections", content: sectionsBody },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Read class times")).toHaveLength(1);
      expect(activityRows()[0].textContent).toContain("APAC1000");
      expect(screen.queryByTestId("rich-call-sections")).toBeNull();
    });

    it("renders a course card only when present_response claims course_detail", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show the full details of APAC1000." },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
              {
                id: "p",
                type: "function",
                function: {
                  name: "present_response",
                  arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
                },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "g", content: courseBody },
          {
            id: "t2",
            role: "tool",
            toolCallId: "p",
            content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}',
          },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-g")).toBeTruthy();
      expect(screen.getByText("Read course")).toBeTruthy();
      expect(screen.queryByText("Choosing a layout")).toBeNull();
      expect(screen.queryByText("Chose a layout")).toBeNull();
    });

    it("renders a single course card for duplicate claimed lookups of one course", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show full details of GELH1000." },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "g1", type: "function", function: { name: "get_course", arguments: '{"code":"GELH1000"}' } },
              { id: "g2", type: "function", function: { name: "get_course", arguments: '{"code":"GELH1000"}' } },
              {
                id: "p",
                type: "function",
                function: {
                  name: "present_response",
                  arguments: '{"show":[{"component":"course_detail","course":"GELH1000"}]}',
                },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "g1", content: gelhCourseBody },
          { id: "t2", role: "tool", toolCallId: "g2", content: gelhCourseBody },
          {
            id: "t3",
            role: "tool",
            toolCallId: "p",
            content:
              '{"status":"requested","items":[{"component":"course_detail","course":"GELH1000","eligibility":"ready"}],"note":"note"}',
          },
        ],
        toolRenderer: {
          names: RICH_TOOL_NAMES,
          render: (call, result) => {
            if (call.function.name === "get_course") {
              return (
                <CourseDetailToolResult
                  status={result ? "complete" : "inProgress"}
                  result={typeof result?.content === "string" ? result.content : undefined}
                />
              );
            }
            return fakeToolRenderer().render(call, result);
          },
        },
      });

      expect(screen.getAllByRole("article", { name: "GELH1000" })).toHaveLength(1);
    });

    it("does not mount two course cards for a comparison turn", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "CISC2001 vs CISC2003?" },
          {
            id: "a1",
            role: "assistant",
            content: "| Attribute | A | B |\n|---|---|---|",
            toolCalls: [
              { id: "g1", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
              { id: "g2", type: "function", function: { name: "get_course", arguments: '{"code":"APAC2000"}' } },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "g1", content: courseBody },
          { id: "t2", role: "tool", toolCallId: "g2", content: courseBody },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.queryByTestId("rich-g1")).toBeNull();
      expect(screen.queryByTestId("rich-g2")).toBeNull();
      expect(screen.getAllByText("Read course").length).toBeGreaterThan(0);
    });

    it("keeps a get_course clarification visible", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "the second one" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [{ id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } }],
          },
          {
            id: "t",
            role: "tool",
            toolCallId: "g",
            content: '{"status":"needs_clarification","ask":"Which course do you mean?"}',
          },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByTestId("rich-g")).toBeTruthy();
    });

    it("renders one activity row and the filter block", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show only those offered." },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-filter",
                type: "function",
                function: {
                  name: "filter_catalog_results",
                  arguments: '{"resultSetId":"call-1","filter":"offered"}',
                },
              },
            ],
          },
          {
            id: "t1",
            role: "tool",
            toolCallId: "call-filter",
            content:
              '{"status":"applied","resultSetId":"call-1","filter":"offered","shownCount":2,"loadedCount":10,"totalCount":10,"hasMore":false,"shownCourseCodes":["APAC1000","APAC2000"],"scope":"loaded_results_only"}',
          },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Filtered results")).toHaveLength(1);
      expect(activityRows()[0].textContent).not.toContain("call-1");
      expect(screen.getByTestId("rich-call-filter").textContent).toContain("applied");
    });

    it("marks a rich domain error as failed and still renders the rich block once", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "APAC1000" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: '{"error":"not_found"}' },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      const status = activityRows()[0];
      expect(status.getAttribute("data-status")).toBe("error");
      expect(status.textContent).toContain("Couldn't read course");
      expect(screen.queryByText("Read course")).toBeNull();
      expect(screen.queryByTestId("rich-call-1")).toBeNull();
    });

    it("mounts the rich failure block when present_response claims a not_found course", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "APAC1000" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
              {
                id: "p",
                type: "function",
                function: {
                  name: "present_response",
                  arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
                },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: '{"error":"not_found"}' },
          {
            id: "t2",
            role: "tool",
            toolCallId: "p",
            content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}',
          },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByTestId("rich-call-1")).toHaveLength(1);
    });

    it("shows activity without a course card until present_response arrives on a running turn", () => {
      const toolRenderer = fakeToolRenderer();
      const sharedProps: AssistantChatViewProps = {
        messages: [],
        suggestions: [{ title: "Q1", message: "M1" }],
        isRunning: true,
        isReady: true,
        draft: "",
        alert: null,
        onDraftChange: vi.fn(),
        onSend: vi.fn(),
        onStop: vi.fn(),
        onNewChat: vi.fn(),
        onClose: vi.fn(),
        onClearAlert: vi.fn(),
        toolRenderer,
      };

      const beforePresent: Message[] = [
        { id: "u1", role: "user", content: "APAC1000 details" },
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
          ],
        },
        { id: "t1", role: "tool", toolCallId: "g", content: courseBody },
      ];

      const { rerender } = render(
        <AssistantChatView {...sharedProps} messages={beforePresent} />,
      );

      expect(screen.getByText("Read course")).toBeTruthy();
      expect(screen.queryByTestId("rich-g")).toBeNull();

      const afterPresent: Message[] = [
        ...beforePresent,
        {
          id: "a2",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "p",
              type: "function",
              function: {
                name: "present_response",
                arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
              },
            },
          ],
        },
        {
          id: "t2",
          role: "tool",
          toolCallId: "p",
          content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}',
        },
      ];

      rerender(<AssistantChatView {...sharedProps} messages={afterPresent} />);

      expect(screen.getByTestId("rich-g")).toBeTruthy();
    });

    it("keeps a course card when a later empty present_response arrives on a running turn", () => {
      const toolRenderer = fakeToolRenderer();
      const sharedProps: AssistantChatViewProps = {
        messages: [],
        suggestions: [{ title: "Q1", message: "M1" }],
        isRunning: true,
        isReady: true,
        draft: "",
        alert: null,
        onDraftChange: vi.fn(),
        onSend: vi.fn(),
        onStop: vi.fn(),
        onNewChat: vi.fn(),
        onClose: vi.fn(),
        onClearAlert: vi.fn(),
        toolRenderer,
      };

      const afterPresent: Message[] = [
        { id: "u1", role: "user", content: "APAC1000 details" },
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "g", type: "function", function: { name: "get_course", arguments: '{"code":"APAC1000"}' } },
            {
              id: "p1",
              type: "function",
              function: {
                name: "present_response",
                arguments: '{"show":[{"component":"course_detail","course":"APAC1000"}]}',
              },
            },
          ],
        },
        { id: "t1", role: "tool", toolCallId: "g", content: courseBody },
        {
          id: "t2",
          role: "tool",
          toolCallId: "p1",
          content: '{"status":"accepted","show":[{"component":"course_detail","course":"APAC1000"}]}',
        },
      ];

      const { rerender } = render(<AssistantChatView {...sharedProps} messages={afterPresent} />);
      expect(screen.getByTestId("rich-g")).toBeTruthy();

      const afterEmptyPresent: Message[] = [
        ...afterPresent,
        {
          id: "a2",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "p2",
              type: "function",
              function: { name: "present_response", arguments: '{"show":[]}' },
            },
          ],
        },
        { id: "t3", role: "tool", toolCallId: "p2", content: '{"status":"accepted","show":[]}' },
      ];

      rerender(<AssistantChatView {...sharedProps} messages={afterEmptyPresent} />);
      expect(screen.getByTestId("rich-g")).toBeTruthy();
    });

    it("pairs get_course and get_course_sections in call order when results arrive reversed", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "details and times" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-course",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
              {
                id: "call-sections",
                type: "function",
                function: {
                  name: "get_course_sections",
                  arguments: '{"code":"APAC1000","instructor":"CHAN TAI MAN"}',
                },
              },
            ],
          },
          { id: "t-sections", role: "tool", toolCallId: "call-sections", content: sectionsBody },
          { id: "t-course", role: "tool", toolCallId: "call-course", content: courseBody },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      const statuses = activityRows().map((node) => node.textContent ?? "");
      expect(statuses[0]).toContain("Read course");
      expect(statuses[1]).toContain("Read class times");
      expect(screen.queryByTestId("rich-call-course")).toBeNull();
      expect(screen.queryByTestId("rich-call-sections")).toBeNull();
      expect(activityRows()).toHaveLength(2);
    });

    it("updates each call in one turn independently", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "both" },
          { id: "t1", role: "tool", toolCallId: "call-done", content: courseBody },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-done",
                type: "function",
                function: { name: "get_course", arguments: '{"code":"APAC1000"}' },
              },
              {
                id: "call-open",
                type: "function",
                function: {
                  name: "get_course_sections",
                  arguments: '{"code":"APAC2000","instructor":"CHAN TAI MAN"}',
                },
              },
            ],
          },
        ],
        isRunning: true,
        toolRenderer: fakeToolRenderer(),
      });

      const statuses = activityRows();
      expect(statuses).toHaveLength(2);
      expect(statuses[0].getAttribute("data-status")).toBe("done");
      expect(statuses[0].textContent).toContain("Read course");
      expect(statuses[1].getAttribute("data-status")).toBe("running");
      expect(statuses[1].textContent).toContain("Reading class times…");
      expect(screen.queryByText(/AI is thinking/)).toBeNull();
    });

    it("renders one row when the same call id is replayed", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "search" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: "{}" },
              },
            ],
          },
          {
            id: "a2",
            role: "assistant",
            content: "Again.",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"MATH"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-1", content: catalogBody() },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByTestId("rich-call-1")).toHaveLength(1);
      expect(screen.getAllByText("Searched courses")).toHaveLength(1);
      expect(activityRows()[0].textContent).toContain("MATH");
    });

    it("mounts a preview_timetable result automatically", async () => {
      const previewBody = JSON.stringify(await runPreviewTimetable(previewReadyState(), {}, previewDeps()));
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show my timetable" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-preview",
                type: "function",
                function: { name: PREVIEW_TIMETABLE_TOOL_NAME, arguments: "{}" },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-preview", content: previewBody },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getByRole("region", { name: "Saved timetable preview" })).toBeTruthy();
      expect(screen.queryByText("Choosing a layout")).toBeNull();
    });

    it("drops an unanswered preview call once the run stops", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "Show my timetable" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-preview",
                type: "function",
                function: { name: PREVIEW_TIMETABLE_TOOL_NAME, arguments: "{}" },
              },
            ],
          },
          { id: "a2", role: "assistant", content: "Stopped early." },
        ],
        isRunning: false,
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.queryByText("Building timetable preview")).toBeNull();
      expect(screen.queryByRole("region", { name: /timetable preview/i })).toBeNull();
    });

    it("keeps a non-rich trace and a rich row as two different calls", () => {
      renderView({
        messages: [
          { id: "u1", role: "user", content: "both" },
          {
            id: "a1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-rich",
                type: "function",
                function: { name: "search_catalog", arguments: '{"query":"MATH"}' },
              },
              {
                id: "call-plain",
                type: "function",
                function: { name: "get_instructor", arguments: '{"name":"CHAN TAI MAN"}' },
              },
            ],
          },
          { id: "t1", role: "tool", toolCallId: "call-rich", content: catalogBody() },
          {
            id: "t2",
            role: "tool",
            toolCallId: "call-plain",
            content: JSON.stringify({
              name: "CHAN TAI MAN",
              page: 1,
              hasMore: false,
              totalCount: 0,
              courses: [],
            }),
          },
        ],
        toolRenderer: fakeToolRenderer(),
      });

      expect(screen.getAllByText("Searched courses")).toHaveLength(1);
      expect(screen.getAllByText("Read instructor")).toHaveLength(1);
      expect(screen.getAllByTestId(/^rich-call-/)).toHaveLength(1);
      expect(screen.getByTestId("rich-call-rich").textContent).toBe(catalogBody());
    });
  });
});
