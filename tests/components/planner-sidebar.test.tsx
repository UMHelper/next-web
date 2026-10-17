import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { plannerMock } = vi.hoisted(() => ({
  plannerMock: vi.fn(),
}));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("@/lib/timetable/use-catalog-search", () => ({
  useCatalogSearch: () => ({
    items: [],
    loading: false,
    error: null,
    total: 0,
    loadMore: vi.fn(),
  }),
}));

import PlannerSidebar from "@/components/timetable/planner-sidebar";

const defaultPlanner = {
  activePlan: undefined,
  addSection: vi.fn(),
  replaceSection: vi.fn(),
  createPlan: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlannerSidebar", () => {
  beforeEach(() => {
    plannerMock.mockReturnValue(defaultPlanner);
  });

  it("renders without crashing when filters return 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/timetable/catalog/filters")) {
          return new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
            status: 401,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<PlannerSidebar />);

    await waitFor(() => {
      expect(screen.getByLabelText("Faculty")).toBeTruthy();
    });
    expect(screen.getByRole("option", { name: "All faculties" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Science" })).toBeNull();
  });

  it("renders faculty and department options when filters succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/timetable/catalog/filters")) {
          return new Response(
            JSON.stringify({
              faculties: ["Science", "Arts"],
              departments: ["COMP", "MATH"],
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<PlannerSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Science" })).toBeTruthy();
    });
    expect(screen.getByRole("option", { name: "Arts" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "COMP" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "MATH" })).toBeTruthy();
  });
});
