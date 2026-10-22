import {
  CopilotChatMessageView,
  CopilotChatReasoningMessage,
  CopilotKitProvider,
} from "@copilotkit/react-core/v2";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MESSAGES = [
  { id: "u1", role: "user", content: "Show me CISC3014" },
  { id: "r1", role: "reasoning", content: "PRIVATE-CHAIN-OF-THOUGHT" },
  { id: "a1", role: "assistant", content: "Opened CISC3014." },
];

function Hidden() {
  return null;
}

function renderView(props: { reasoningMessage?: typeof CopilotChatReasoningMessage }) {
  return render(
    <CopilotKitProvider runtimeUrl="/api/copilotkit" enableInspector={false}>
      <CopilotChatMessageView messages={MESSAGES as never} {...props} />
    </CopilotKitProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CopilotKit reasoning messages", () => {
  it("are shown as a Thought block by default", () => {
    renderView({});
    expect(screen.getByText(/Thought/)).toBeTruthy();
  });

  it("are not rendered with the slot the assistant panel sets", () => {
    renderView({ reasoningMessage: Hidden as unknown as typeof CopilotChatReasoningMessage });
    expect(screen.queryByText(/Thought/)).toBeNull();
    expect(screen.queryByText("PRIVATE-CHAIN-OF-THOUGHT")).toBeNull();
  });
});
