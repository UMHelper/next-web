import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantBubble } from "@/components/assistant/assistant-bubble";

afterEach(() => {
  cleanup();
});

describe("AssistantBubble", () => {
  it("always shows the label next to the button, since it only renders on desktop", () => {
    render(<AssistantBubble onClick={() => {}} />);
    const label = screen.getByText("AI Course Helper");
    expect(label.className.split(" ")).not.toContain("hidden");
    expect(screen.getByRole("button", { name: "AI Course Helper" })).toBeTruthy();
    expect(screen.getByText("AI 選課助手")).toBeTruthy();
  });
});
