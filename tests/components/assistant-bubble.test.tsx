import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantBubble } from "@/components/assistant/assistant-bubble";

afterEach(() => {
  cleanup();
});

describe("AssistantBubble", () => {
  it("shows only the round button on phones so it clears FloatingPlanner's centered button", () => {
    render(<AssistantBubble onClick={() => {}} />);
    const label = screen.getByText("可以試試 AI 選課");
    expect(label.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "md:block"]));
    expect(screen.getByRole("button", { name: "AI 選課助手" })).toBeTruthy();
  });
});
