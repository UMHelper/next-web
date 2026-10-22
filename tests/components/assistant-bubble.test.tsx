import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantBubble } from "@/components/assistant/assistant-bubble";

afterEach(() => {
  cleanup();
});

describe("AssistantBubble", () => {
  it("always shows the label next to the button, since it only renders on desktop", () => {
    render(<AssistantBubble onClick={() => {}} />);
    const label = screen.getByText("可以試試 AI 選課");
    expect(label.className.split(" ")).not.toContain("hidden");
    expect(screen.getByRole("button", { name: "AI 選課助手" })).toBeTruthy();
  });
});
