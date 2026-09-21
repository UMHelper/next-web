import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useUserMock } = vi.hoisted(() => ({
  useUserMock: vi.fn(() => ({
    user: { id: "user_1" },
    isLoaded: true,
  })),
}));

vi.mock("@clerk/nextjs", () => ({ useUser: useUserMock }));

import {
  TimetablePlannerProvider,
  useTimetablePlanner,
} from "@/components/timetable/planner-provider";

const Consumer = () => {
  const { activePlan, createPlan, addSection } = useTimetablePlanner();
  return (
    <div>
      <span data-testid="plan-name">{activePlan?.name ?? "none"}</span>
      <span data-testid="section-count">
        {activePlan?.payload.sections.length ?? 0}
      </span>
      <button
        onClick={() => {
          const plan = createPlan("我的课表", { year: 2026, sem: 1 });
          addSection(plan.clientRef, {
            key: "ACCT1000|CHAN|A01",
            courseCode: "ACCT1000",
            prof: "CHAN",
            section: "A01",
            color: "#2563eb",
            schedules: [
              { date: "MON", time: "09:00-10:00", location: "E4" },
            ],
          });
        }}
      >
        add
      </button>
    </div>
  );
};

afterEach(() => {
  cleanup();
});

describe("TimetablePlannerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const memory = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ plans: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  it("exposes local planner state through context", async () => {
    render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    expect(screen.getByTestId("plan-name").textContent).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByTestId("plan-name").textContent).toBe("我的课表");
    expect(screen.getByTestId("section-count").textContent).toBe("1");
  });
});
