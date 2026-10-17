import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useUserMock } = vi.hoisted(() => ({ useUserMock: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useUser: useUserMock }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPanel() {
      return <div data-testid="assistant-panel" />;
    },
}));

import AssistantLauncher from "@/components/assistant/assistant-launcher";

afterEach(() => {
  cleanup();
});

describe("AssistantLauncher", () => {
  it("renders nothing while Clerk is loading", () => {
    useUserMock.mockReturnValue({ isLoaded: false, user: null });
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for users outside the pilot", () => {
    useUserMock.mockReturnValue({ isLoaded: true, user: { publicMetadata: {} } });
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("loads the panel only after a pilot user opens it", () => {
    useUserMock.mockReturnValue({ isLoaded: true, user: { publicMetadata: { aiPilot: true } } });
    render(<AssistantLauncher plan={undefined} />);

    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "AI 选课助手" }));
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();
  });
});
