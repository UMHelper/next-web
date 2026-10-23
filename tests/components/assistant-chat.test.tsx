import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const agent = {
    messages: [] as Array<Record<string, unknown>>,
    isRunning: false,
    addMessage: vi.fn(),
    setMessages: vi.fn(),
  };
  return {
    agent,
    isReady: true,
    runAgent: vi.fn(),
    stopAgent: vi.fn(),
    suggestions: [] as Array<{ title: string; message: string; isLoading: boolean }>,
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  isAbortError: (error: unknown) => error instanceof Error && /abort/i.test(error.message),
  useRenderToolCall: () =>
    ({
      toolCall,
      toolMessage,
    }: {
      toolCall: { id: string };
      toolMessage?: { content?: string };
    }) => (
      <div data-testid={`rich-${toolCall.id}`}>{toolMessage?.content ?? "loading"}</div>
    ),
}));

vi.mock("@copilotkit/react-core/v2/headless", () => ({
  useAgent: () => ({ agent: mocks.agent, isReady: mocks.isReady }),
  useCopilotKit: () => ({
    copilotkit: { runAgent: mocks.runAgent, stopAgent: mocks.stopAgent },
  }),
  useSuggestions: () => ({ suggestions: mocks.suggestions }),
}));

import AssistantChat from "@/components/assistant/assistant-chat";

function renderChat(overrides: { notice?: string | null; onClose?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onClearNotice = vi.fn();
  render(
    <AssistantChat
      onClose={onClose}
      notice={overrides.notice ?? null}
      onClearNotice={onClearNotice}
    />,
  );
  return { onClose, onClearNotice };
}

function send(text: string) {
  const textarea = screen.getByLabelText("Ask about courses");
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  mocks.agent.messages = [];
  mocks.agent.isRunning = false;
  mocks.isReady = true;
  mocks.suggestions = [];
  mocks.runAgent.mockReset();
  mocks.runAgent.mockResolvedValue({});
  mocks.stopAgent.mockReset();
  mocks.agent.addMessage.mockReset();
  mocks.agent.setMessages.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  document.body.style.marginInlineEnd = "";
  document.body.style.overflow = "";
});

describe("AssistantChat", () => {
  it("adds the user message and runs the agent", async () => {
    const { onClearNotice } = renderChat();

    send("What is ACCT1000?");

    await waitFor(() => expect(mocks.runAgent).toHaveBeenCalledWith({ agent: mocks.agent }));
    expect(mocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "What is ACCT1000?" }),
    );
    expect(onClearNotice).toHaveBeenCalled();
    expect((screen.getByLabelText("Ask about courses") as HTMLTextAreaElement).value).toBe("");
  });

  it("shows the mapped error message when a run fails", async () => {
    mocks.runAgent.mockRejectedValueOnce(new Error("429"));
    renderChat();

    send("hello");

    expect((await screen.findByRole("alert")).textContent).toContain("Too many requests");
  });

  it("ignores an aborted run", async () => {
    mocks.runAgent.mockRejectedValueOnce(new Error("aborted"));
    renderChat();

    send("hello");

    await waitFor(() => expect(mocks.runAgent).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops a running agent", () => {
    mocks.agent.isRunning = true;
    mocks.agent.messages = [{ id: "u1", role: "user", content: "hi" }];
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(mocks.stopAgent).toHaveBeenCalledWith({ agent: mocks.agent });
  });

  it("starts a new conversation", () => {
    mocks.agent.messages = [{ id: "u1", role: "user", content: "hi" }];
    const { onClearNotice } = renderChat();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(mocks.agent.setMessages).toHaveBeenCalledWith([]);
    expect(onClearNotice).toHaveBeenCalled();
  });

  it("closes from the header and with Escape", () => {
    const onClose = vi.fn();
    renderChat({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders a provider notice as the alert", () => {
    renderChat({ notice: "Please sign in to use the assistant." });

    expect(screen.getByRole("alert").textContent).toContain("Please sign in to use the assistant.");
  });

  it("keeps a page margin for the panel on desktop and removes it on unmount", () => {
    const { unmount } = render(
      <AssistantChat onClose={() => {}} notice={null} onClearNotice={() => {}} />,
    );
    expect(document.body.style.marginInlineEnd).toBe("var(--assistant-width, 380px)");

    unmount();
    expect(document.body.style.marginInlineEnd).toBe("");
  });

  it("covers the viewport and locks page scrolling on mobile widths", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    renderChat();
    expect(document.body.style.marginInlineEnd).toBe("");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("passes configured suggestions to the welcome screen", () => {
    mocks.suggestions = [{ title: "ACCT1000", message: "What is ACCT1000?", isLoading: false }];
    renderChat();

    expect(screen.getByRole("button", { name: "ACCT1000" })).toBeTruthy();
  });

  it("does not send while the agent is not ready", async () => {
    mocks.isReady = false;
    renderChat();

    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
    await act(async () => {});
    expect(mocks.agent.addMessage).not.toHaveBeenCalled();
  });

  it("renders search_catalog through useRenderToolCall", () => {
    const catalogBody =
      '{"type":"course","page":1,"hasMore":false,"totalCount":0,"results":[]}';
    mocks.agent.messages = [
      { id: "u1", role: "user", content: "Find ACCT courses" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-sc",
            type: "function",
            function: { name: "search_catalog", arguments: '{"query":"ACCT"}' },
          },
        ],
      },
      { id: "t1", role: "tool", toolCallId: "call-sc", content: catalogBody },
      { id: "a2", role: "assistant", content: "Here are matches." },
    ];
    renderChat();

    expect(screen.getByTestId("rich-call-sc").textContent).toBe(catalogBody);
    expect(screen.getAllByText("Searched courses")).toHaveLength(1);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0].getAttribute("data-status")).toBe("done");
  });
});
