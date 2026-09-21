import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { plannerMock } = vi.hoisted(() => ({ plannerMock: vi.fn() }));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { TimetableScheduleCard } from "@/components/timetable-schedule-card";

afterEach(() => {
  cleanup();
});

const timetable = [
  {
    section: "A01",
    schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
  },
];

describe("TimetableScheduleCard add flow", () => {
  it("adds a section to the active plan", () => {
    const addSection = vi.fn(() => ({ ok: true as const }));
    plannerMock.mockReturnValue({
      activePlan: {
        clientRef: "plan-1",
        name: "我的课表",
        year: 2026,
        sem: 1,
        payload: { schemaVersion: 1, sections: [] },
      },
      addSection,
      replaceSection: vi.fn(),
      createPlan: vi.fn(),
    });

    render(<TimetableScheduleCard timetable={timetable} code="ACCT1000" prof="CHAN" />);
    fireEvent.click(screen.getByRole("button", { name: /Add to Timetable/i }));
    expect(addSection).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ courseCode: "ACCT1000", section: "A01" }),
    );
  });

  it("shows added state for an existing section", () => {
    plannerMock.mockReturnValue({
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
              schedules: [],
            },
          ],
        },
      },
      addSection: vi.fn(() => ({ ok: true as const })),
      replaceSection: vi.fn(),
      createPlan: vi.fn(),
    });

    render(<TimetableScheduleCard timetable={timetable} code="ACCT1000" prof="CHAN" />);
    expect((screen.getByRole("button", { name: /Added/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
