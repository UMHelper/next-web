import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { plannerMock, sharedPlanMock } = vi.hoisted(() => ({
  plannerMock: vi.fn(),
  sharedPlanMock: vi.fn(),
}));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("@/lib/timetable/use-shared-plan", () => ({
  useSharedPlan: sharedPlanMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import CompareClient from "@/components/timetable/compare-client";

afterEach(() => {
  cleanup();
});

const section = (key: string, code: string, date: string, time: string) => ({
  key,
  courseCode: code,
  prof: "P",
  section: key,
  color: "#2563eb",
  schedules: [{ date, time, location: "" }],
});

describe("CompareClient", () => {
  it("renders dual plans and common free slots", () => {
    sharedPlanMock.mockReturnValue({
      plan: {
        name: "A",
        year: 2026,
        sem: 1,
        revision: 1,
        updatedAt: "",
        payload: {
          schemaVersion: 1,
          sections: [section("ACCT", "ACCT1000", "MON", "09:00-10:00")],
        },
      },
      loading: false,
      stale: false,
      error: null,
    });
    plannerMock.mockReturnValue({
      store: {
        plans: {
          "plan-1": {
            clientRef: "plan-1",
            name: "我的课表",
            year: 2026,
            sem: 1,
            payload: {
              schemaVersion: 1,
              sections: [section("CISC", "CISC1000", "MON", "11:00-12:00")],
            },
          },
        },
      },
    });

    render(<CompareClient token={"a".repeat(43)} />);
    expect(screen.getByText("对方方案")).toBeTruthy();
    expect(screen.getByText("我的方案")).toBeTruthy();
    expect(screen.getByText(/MON 10:00–11:00/)).toBeTruthy();
  });
});
