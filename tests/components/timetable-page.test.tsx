import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useUserMock, usePathnameMock, plannerMock } = vi.hoisted(() => ({
  useUserMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/timetable"),
  plannerMock: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: useUserMock,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("@/components/assistant/assistant-launcher", () => ({
  default: () => <div data-testid="assistant-launcher" />,
}));

import TimetablePage from "@/app/timetable/page";

const emptyStore = {
  plans: {},
};

afterEach(() => {
  cleanup();
});

describe("TimetablePage", () => {
  it("renders nothing while Clerk is loading", () => {
    useUserMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    plannerMock.mockReturnValue({
      store: emptyStore,
      activePlan: undefined,
      createPlan: vi.fn(),
      renamePlan: vi.fn(),
      deletePlan: vi.fn(),
      setActivePlan: vi.fn(),
      removeSection: vi.fn(),
      syncState: "idle",
    });

    const { container } = render(<TimetablePage />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a sign-in prompt when signed out", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    plannerMock.mockReturnValue({
      store: emptyStore,
      activePlan: undefined,
      createPlan: vi.fn(),
      renamePlan: vi.fn(),
      deletePlan: vi.fn(),
      setActivePlan: vi.fn(),
      removeSection: vi.fn(),
      syncState: "idle",
    });

    render(<TimetablePage />);
    expect(screen.getByText(/sign in to build and save/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create timetable" })).toBeNull();
    expect(screen.queryByLabelText("Faculty")).toBeNull();
  });

  it("renders an active plan section and conflict count when signed in", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    plannerMock.mockReturnValue({
      store: {
        plans: {
          "plan-1": {
            clientRef: "plan-1",
            name: "我的课表",
          },
        },
      },
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
              schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
            },
          ],
        },
        revision: 1,
        syncState: "idle",
      },
      createPlan: vi.fn(),
      renamePlan: vi.fn(),
      deletePlan: vi.fn(),
      setActivePlan: vi.fn(),
      removeSection: vi.fn(),
      syncState: "idle",
    });

    render(<TimetablePage />);
    expect(screen.getByText("3 credits")).toBeTruthy();
    expect(screen.getAllByText("ACCT1000-A01").length).toBeGreaterThan(0);
    expect(screen.getByTestId("assistant-launcher")).toBeTruthy();
  });

  it("shows the empty workbench when signed in", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    plannerMock.mockReturnValue({
      store: emptyStore,
      activePlan: undefined,
      createPlan: vi.fn(),
      renamePlan: vi.fn(),
      deletePlan: vi.fn(),
      setActivePlan: vi.fn(),
      removeSection: vi.fn(),
      syncState: "idle",
    });

    render(<TimetablePage />);
    expect(screen.getByRole("button", { name: "Create timetable" })).toBeTruthy();
    expect(screen.getByTestId("assistant-launcher")).toBeTruthy();
    expect(screen.queryByText(/sign in to build and save/i)).toBeNull();
  });
});
