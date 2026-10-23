import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { Message, ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

import {
  AssistantChatView,
  type AssistantChatViewProps,
} from "@/components/assistant/assistant-chat-view";
import { RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import { SITE_URL } from "@/lib/site";

function catalogBody(totalCount = 0) {
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: false,
    totalCount,
    results: [],
  });
}

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
    render: (call: ToolCall, result: ToolMessage | undefined) => (
      <div data-testid={`rich-${call.id}`}>
        {typeof result?.content === "string" ? result.content : "loading"}
      </div>
    ),
  };
}

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

    expect(screen.getByText("How can I help?")).toBeTruthy();
    expect(screen.getByText(/Ask about courses, professors, reviews, class times/)).toBeTruthy();
    expect(screen.getByText(/查課程、教授、評價/)).toBeTruthy();
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

    expect(screen.getByText("Thinking…")).toBeTruthy();
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

    expect(screen.getByText("Connecting…")).toBeTruthy();
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
      expect(screen.getByRole("status").textContent).toContain("ACCT");
      expect(screen.getAllByRole("status")).toHaveLength(1);
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
      expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual([
        expect.stringContaining("Searching courses…"),
      ]);
      expect(screen.queryByText("Thinking…")).toBeNull();
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
      expect(screen.getAllByRole("status")).toHaveLength(2);
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
      expect(screen.getByText("Thinking…")).toBeTruthy();
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
      expect(screen.getByRole("status").textContent).toContain("APAC1000");
      expect(screen.getByTestId("rich-call-course").textContent).toBe(courseBody);
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
      expect(screen.getByRole("status").textContent).toContain("APAC1000");
      expect(screen.getByTestId("rich-call-sections").textContent).toBe(sectionsBody);
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
      expect(screen.getByRole("status").textContent).not.toContain("call-1");
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

      const status = screen.getByRole("status");
      expect(status.getAttribute("data-status")).toBe("error");
      expect(status.textContent).toContain("Couldn't read course");
      expect(screen.queryByText("Read course")).toBeNull();
      expect(screen.getAllByTestId("rich-call-1")).toHaveLength(1);
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

      const statuses = screen.getAllByRole("status").map((node) => node.textContent ?? "");
      expect(statuses[0]).toContain("Read course");
      expect(statuses[1]).toContain("Read class times");
      expect(screen.getByTestId("rich-call-course").textContent).toBe(courseBody);
      expect(screen.getByTestId("rich-call-sections").textContent).toBe(sectionsBody);
      expect(screen.getAllByRole("status")).toHaveLength(2);
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

      const statuses = screen.getAllByRole("status");
      expect(statuses).toHaveLength(2);
      expect(statuses[0].getAttribute("data-status")).toBe("done");
      expect(statuses[0].textContent).toContain("Read course");
      expect(statuses[1].getAttribute("data-status")).toBe("running");
      expect(statuses[1].textContent).toContain("Reading class times…");
      expect(screen.queryByText("Thinking…")).toBeNull();
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
      expect(screen.getByRole("status").textContent).toContain("MATH");
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
