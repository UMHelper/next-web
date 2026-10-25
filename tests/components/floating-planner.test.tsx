import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock, plannerMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/reviews/ACCT1000/CHAN"),
  plannerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

import FloatingPlanner from "@/components/timetable/floating-planner";

afterEach(() => {
  cleanup();
});

describe("FloatingPlanner", () => {
  it("shows the active plan count and opens the preview", () => {
    plannerMock.mockReturnValue({
      activePlan: {
        name: "我的课表",
        payload: {
          sections: [
            {
              key: "ACCT1000|CHAN|A01",
              courseCode: "ACCT1000",
              prof: "CHAN",
              section: "A01",
              color: "#2563eb",
              schedules: [
                { date: "MON", time: "09:00-10:00", location: "E4" },
              ],
            },
          ],
        },
      },
      syncState: "idle",
    });

    render(<FloatingPlanner />);
    fireEvent.click(screen.getByLabelText("Open timetable preview"));
    expect(screen.getAllByText("My Timetable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides on the planner page", () => {
    usePathnameMock.mockReturnValue("/timetable");
    plannerMock.mockReturnValue({ activePlan: undefined, syncState: "idle" });

    render(<FloatingPlanner />);
    expect(screen.queryByLabelText("Open timetable preview")).toBeNull();
  });

  it("moves its desktop tab and preview left of an open assistant sidebar", () => {
    usePathnameMock.mockReturnValue("/course/ACCT1000");
    plannerMock.mockReturnValue({ activePlan: undefined, syncState: "idle" });

    render(<FloatingPlanner />);
    const tab = screen.getByLabelText("Open timetable preview");
    expect(tab.className).toContain("[html[data-assistant-open]_&]:right-[var(--assistant-width)]");

    fireEvent.click(tab);
    const preview = screen
      .getAllByText("My Timetable")
      .map((element) => element.closest("aside"))
      .find(Boolean)!;
    expect(preview.className).toContain(
      "[html[data-assistant-open]_&]:right-[calc(var(--assistant-width)_+_1rem)]",
    );
    expect(preview.className).toContain(
      "[html[data-assistant-open]_&]:max-w-[calc(100vw_-_var(--assistant-width)_-_2rem)]",
    );
  });
});
