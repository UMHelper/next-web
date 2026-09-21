import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { plannerMock } = vi.hoisted(() => ({ plannerMock: vi.fn() }));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import TimetablePage from "@/app/timetable/page";

afterEach(() => {
  cleanup();
});

const baseContext = {
  store: { plans: {}, activePlanByTerm: {}, outbox: [] },
  activePlan: undefined,
  createPlan: vi.fn(),
  renamePlan: vi.fn(),
  deletePlan: vi.fn(),
  setActivePlan: vi.fn(),
  removeSection: vi.fn(),
  syncState: "idle",
};

describe("TimetablePage", () => {
  it("shows the empty planner state", () => {
    plannerMock.mockReturnValue(baseContext);
    render(<TimetablePage />);
    expect(screen.getByText("Create timetable")).toBeTruthy();
  });

  it("renders an active plan section and conflict count", () => {
    plannerMock.mockReturnValue({
      ...baseContext,
      activePlan: {
        clientRef: "plan-1",
        name: "我的课表",
        year: 2026,
        sem: 1,
        payload: {
          schemaVersion: 1,
          sections: [
            {
              key: "ACCT1000|CHAN|A01",
              courseCode: "ACCT1000",
              prof: "CHAN",
              section: "A01",
              color: "#2563eb",
              credits: 3,
              schedules: [
                { date: "MON", time: "09:00-10:00", location: "E4" },
              ],
            },
          ],
        },
        revision: 1,
        syncState: "idle",
      },
    });

    render(<TimetablePage />);
    expect(screen.getByText("3 credits")).toBeTruthy();
    expect(screen.getAllByText("ACCT1000-A01").length).toBeGreaterThan(0);
  });
});
