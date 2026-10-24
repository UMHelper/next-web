import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyStore, upsertPlanLocal } from "@/lib/timetable/store";

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

const storageKey = (userId: string) => `timetable:store:v1:${userId}`;

const Consumer = () => {
  const { activePlan, createPlan, addSection, loadState, serverLoad } =
    useTimetablePlanner();
  return (
    <div>
      <span data-testid="plan-name">{activePlan?.name ?? "none"}</span>
      <span data-testid="section-count">
        {activePlan?.payload.sections.length ?? 0}
      </span>
      <span data-testid="load-state">{loadState}</span>
      <span data-testid="server-load">{serverLoad}</span>
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
    useUserMock.mockReturnValue({
      user: { id: "user_1" },
      isLoaded: true,
    });
  });

  it("exposes local planner state through context", async () => {
    render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("load-state").textContent).toBe("ready");
    });

    expect(screen.getByTestId("plan-name").textContent).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByTestId("plan-name").textContent).toBe("我的课表");
    expect(screen.getByTestId("section-count").textContent).toBe("1");
  });

  it("is loading until the user's store is read, then ready with serverLoad ok", async () => {
    useUserMock.mockReturnValue({ user: { id: "user_1" }, isLoaded: false });

    const { rerender } = render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    expect(screen.getByTestId("load-state").textContent).toBe("loading");

    useUserMock.mockReturnValue({ user: { id: "user_1" }, isLoaded: true });
    rerender(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("load-state").textContent).toBe("ready");
      expect(screen.getByTestId("server-load").textContent).toBe("ok");
    });
  });

  it("reports serverLoad failed but keeps the local plan when listing plans fails", async () => {
    const clientRef = "plan-local-1";
    const store = upsertPlanLocal(createEmptyStore(), {
      clientRef,
      name: "本地课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [] },
      revision: 0,
      syncState: "idle",
    });
    window.localStorage.setItem(storageKey("user_1"), JSON.stringify(store));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("load-state").textContent).toBe("ready");
      expect(screen.getByTestId("server-load").textContent).toBe("failed");
      expect(screen.getByTestId("plan-name").textContent).toBe("本地课表");
    });
  });

  it("clears the previous user's plans on sign-out", async () => {
    const clientRef = "plan-user-1";
    const store = upsertPlanLocal(createEmptyStore(), {
      clientRef,
      name: "用户一课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [] },
      revision: 0,
      syncState: "idle",
    });
    window.localStorage.setItem(storageKey("user_1"), JSON.stringify(store));

    const { rerender } = render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("plan-name").textContent).toBe("用户一课表");
    });

    useUserMock.mockReturnValue({ user: null, isLoaded: true });
    rerender(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("plan-name").textContent).toBe("none");
      expect(screen.getByTestId("load-state").textContent).toBe("signed_out");
      expect(screen.getByTestId("server-load").textContent).toBe("pending");
    });

    const persisted = window.localStorage.getItem(storageKey("user_1"));
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted!).plans[clientRef].name).toBe("用户一课表");
  });

  it("shows only the new user's plans after an account switch", async () => {
    const user1Ref = "plan-user-1";
    const user1Store = upsertPlanLocal(createEmptyStore(), {
      clientRef: user1Ref,
      name: "用户一课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [] },
      revision: 0,
      syncState: "idle",
    });
    window.localStorage.setItem(storageKey("user_1"), JSON.stringify(user1Store));

    const user2Ref = "plan-user-2";
    const user2Store = upsertPlanLocal(createEmptyStore(), {
      clientRef: user2Ref,
      name: "用户二课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [] },
      revision: 0,
      syncState: "idle",
    });
    window.localStorage.setItem(storageKey("user_2"), JSON.stringify(user2Store));

    const { rerender } = render(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("plan-name").textContent).toBe("用户一课表");
    });

    const user1Before = window.localStorage.getItem(storageKey("user_1"));

    useUserMock.mockReturnValue({ user: { id: "user_2" }, isLoaded: true });
    rerender(
      <TimetablePlannerProvider>
        <Consumer />
      </TimetablePlannerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("plan-name").textContent).toBe("用户二课表");
      expect(screen.getByTestId("load-state").textContent).toBe("ready");
    });

    expect(window.localStorage.getItem(storageKey("user_1"))).toBe(user1Before);
    expect(JSON.parse(user1Before!).plans[user1Ref].name).toBe("用户一课表");
  });
});
