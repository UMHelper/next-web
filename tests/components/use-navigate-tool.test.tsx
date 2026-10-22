import { useLayoutEffect, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NAVIGATION_TIMEOUT_MS } from "@/lib/assistant/navigation";

const CO_TAUGHT = "LI ZIHAO / WONG KA KI KATRINE";
const REVIEWS_PUSH_PATH = "/reviews/GELH2009/LI%20ZIHAO%20$%20WONG%20KA%20KI%20KATRINE";
const REVIEWS_LAND_PATHS = [
  REVIEWS_PUSH_PATH,
  REVIEWS_PUSH_PATH.replace("$", "%24"),
] as const;

const { pathnameRef, pushMock, usePathnameMock } = vi.hoisted(() => {
  const pathnameRef = { current: "/course/ACCT1000" };
  const pushMock = vi.fn();
  const usePathnameMock = vi.fn(() => pathnameRef.current);
  return { pathnameRef, pushMock, usePathnameMock };
});

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

const getCourseDetailMock = vi.fn();
const getInstructorCoursesMock = vi.fn();

vi.mock("@/lib/timetable/catalog-client", () => ({
  getCourseDetail: (...args: unknown[]) => getCourseDetailMock(...args),
  getInstructorCourses: (...args: unknown[]) => getInstructorCoursesMock(...args),
}));

import { useNavigateTool } from "@/components/assistant/use-navigate-tool";

const probe = { lastPathname: "" };

function Probe() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    probe.lastPathname = pathname;
  }, [pathname]);
  return null;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <Probe />
      {children}
    </>
  );
}

function agentAfterNavigateResults(...statuses: string[]) {
  return {
    messages: [
      { role: "user" },
      ...statuses.flatMap((status, index) => [
        { role: "assistant", toolCalls: [{ id: `nav-${index}`, function: { name: "navigate" } }] },
        { role: "tool", toolCallId: `nav-${index}`, content: JSON.stringify({ status }) },
      ]),
      { role: "assistant", toolCalls: [{ id: "nav-now", function: { name: "navigate" } }] },
    ],
  };
}

describe("useNavigateTool", () => {
  let rerender: () => void;

  function land(path: string) {
    act(() => {
      pathnameRef.current = new URL(path, "https://umeh.top").pathname;
      rerender();
    });
  }

  function mountNavigate() {
    const hook = renderHook(() => useNavigateTool(), { wrapper });
    rerender = hook.rerender;
    probe.lastPathname = pathnameRef.current;
    return hook;
  }

  beforeEach(() => {
    pathnameRef.current = "/course/ACCT1000";
    pushMock.mockClear();
    getCourseDetailMock.mockResolvedValue({
      course: { courseTitle: "Financial Accounting" },
      profList: [{}],
    });
    getInstructorCoursesMock.mockResolvedValue({ courses: [{ course_id: "GELH2009" }] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("navigates and waits for the pathname to land", async () => {
    const { result } = mountNavigate();
    const navigate = result.current;

    let settled = false;
    const pending = navigate({ destination: "course", code: "ECON1001" }).then((value) => {
      settled = true;
      return value;
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    expect(pushMock).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith("/course/ECON1001");

    land("/course/ECON1001");
    await expect(pending).resolves.toEqual({
      status: "navigated",
      page: { page: "course", courseCode: "ECON1001" },
    });
  });

  it.each(REVIEWS_LAND_PATHS)("co-taught reviews land on %s", async (landPath) => {
    const { result } = mountNavigate();
    const navigate = result.current;

    const pending = navigate({
      destination: "reviews",
      code: "GELH2009",
      instructor: CO_TAUGHT,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledWith(REVIEWS_PUSH_PATH);

    land(landPath);
    await expect(pending).resolves.toEqual({
      status: "navigated",
      page: { page: "course_reviews", courseCode: "GELH2009", instructor: CO_TAUGHT },
    });
  });

  it("returns already_here on the current course page", async () => {
    pathnameRef.current = "/course/ACCT1000";
    const { result } = mountNavigate();

    await expect(result.current({ destination: "course", code: "acct1000" })).resolves.toEqual({
      status: "already_here",
      page: { page: "course", courseCode: "ACCT1000" },
    });
    expect(getCourseDetailMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("returns already_here on paginated reviews for the same instructor", async () => {
    pathnameRef.current = "/reviews/ACCT1000/CHAN%20TAI%20MAN/2";
    const { result } = mountNavigate();

    await expect(
      result.current({
        destination: "reviews",
        code: "ACCT1000",
        instructor: "CHAN TAI MAN",
      }),
    ).resolves.toEqual({
      status: "already_here",
      page: { page: "course_reviews", courseCode: "ACCT1000", instructor: "CHAN TAI MAN" },
    });
    expect(getInstructorCoursesMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it.each([
    { destination: "url", url: "https://evil.example" },
    { destination: "course", code: "../admin" },
  ])("rejects invalid destination %j", async (input) => {
    const { result } = mountNavigate();

    await expect(result.current(input)).resolves.toEqual({ status: "invalid_destination" });
    expect(getCourseDetailMock).not.toHaveBeenCalled();
    expect(getInstructorCoursesMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown course", async () => {
    getCourseDetailMock.mockResolvedValue({
      course: { courseTitle: "Unknown Course" },
      profList: [],
    });
    const { result } = mountNavigate();

    await expect(result.current({ destination: "course", code: "ZZZZ9999" })).resolves.toEqual({
      status: "not_found",
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when the catalog lookup fails", async () => {
    getCourseDetailMock.mockRejectedValue(new Error("offline"));
    const { result } = mountNavigate();

    await expect(result.current({ destination: "course", code: "ECON1001" })).resolves.toEqual({
      status: "unavailable",
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("times out, ignores a late land, and allows a later navigation", async () => {
    vi.useFakeTimers();
    const { result } = mountNavigate();
    const navigate = result.current;

    const first = navigate({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_TIMEOUT_MS);
    });
    await expect(first).resolves.toEqual({ status: "timeout" });

    expect(() => land("/course/ECON1001")).not.toThrow();

    act(() => {
      pathnameRef.current = "/course/ACCT1000";
      rerender();
    });

    getCourseDetailMock.mockResolvedValue({
      course: { courseTitle: "Intro Economics" },
      profList: [{}],
    });
    const second = navigate({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });
    land("/course/ECON1001");
    await expect(second).resolves.toEqual({
      status: "navigated",
      page: { page: "course", courseCode: "ECON1001" },
    });
  });

  it("returns cancelled when aborted during lookup", async () => {
    let resolveLookup!: () => void;
    getCourseDetailMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = () =>
            resolve({ course: { courseTitle: "Financial Accounting" }, profList: [{}] });
        }),
    );
    const { result } = mountNavigate();
    const controller = new AbortController();

    const pending = result.current({ destination: "course", code: "ECON1001" }, { signal: controller.signal });
    await act(async () => {
      await Promise.resolve();
    });
    controller.abort();
    act(() => resolveLookup());
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("returns cancelled when aborted while waiting to land", async () => {
    const { result } = mountNavigate();
    const controller = new AbortController();

    const pending = result.current({ destination: "course", code: "ECON1001" }, { signal: controller.signal });
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledOnce();
    controller.abort();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("returns landed_elsewhere when the pathname changes somewhere else", async () => {
    const { result } = mountNavigate();

    const pending = result.current({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledWith("/course/ECON1001");

    land("/timetable");
    await expect(pending).resolves.toEqual({
      status: "landed_elsewhere",
      page: { page: "timetable" },
    });
  });

  it("returns busy for a second in-flight navigation", async () => {
    const { result } = mountNavigate();
    const navigate = result.current;

    const first = navigate({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });

    await expect(navigate({ destination: "timetable" })).resolves.toEqual({ status: "busy" });
    expect(pushMock).toHaveBeenCalledOnce();

    land("/course/ECON1001");
    await expect(first).resolves.toEqual({
      status: "navigated",
      page: { page: "course", courseCode: "ECON1001" },
    });
  });

  it.each(["navigated", "timeout"])(
    "returns limit_reached once a page was opened this turn (previous result %s)",
    async (status) => {
      const { result } = mountNavigate();

      await expect(
        result.current({ destination: "course", code: "ECON1001" }, { agent: agentAfterNavigateResults(status) }),
      ).resolves.toEqual({ status: "limit_reached" });
      expect(getCourseDetailMock).not.toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
    },
  );

  it("allows a corrected navigation after a not_found in the same turn", async () => {
    const { result } = mountNavigate();

    const pending = result.current(
      { destination: "timetable" },
      { agent: agentAfterNavigateResults("not_found", "invalid_destination") },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledWith("/timetable");
    land("/timetable");
    await expect(pending).resolves.toEqual({
      status: "navigated",
      page: { page: "timetable" },
    });
  });

  it("allows the first navigation of a turn after a page opened in an earlier turn", async () => {
    const { result } = mountNavigate();
    const agent = agentAfterNavigateResults("navigated");
    agent.messages.splice(-1, 0, { role: "user" });

    const pending = result.current({ destination: "timetable" }, { agent });
    await act(async () => {
      await Promise.resolve();
    });
    land("/timetable");
    await expect(pending).resolves.toMatchObject({ status: "navigated" });
  });

  it("returns cancelled when unmounted while waiting to land", async () => {
    const hook = mountNavigate();
    const pending = hook.result.current({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(pushMock).toHaveBeenCalledOnce();

    act(() => hook.unmount());
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("returns cancelled when unmounted during lookup without pushing", async () => {
    let resolveLookup!: () => void;
    getCourseDetailMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = () =>
            resolve({ course: { courseTitle: "Financial Accounting" }, profList: [{}] });
        }),
    );
    const hook = mountNavigate();
    const pending = hook.result.current({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => hook.unmount());
    act(() => resolveLookup());
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("records the landed pathname in the probe before the promise resolves", async () => {
    const { result } = mountNavigate();
    const pending = result.current({ destination: "course", code: "ECON1001" });
    await act(async () => {
      await Promise.resolve();
    });

    land("/course/ECON1001");
    await pending;
    expect(probe.lastPathname).toBe("/course/ECON1001");
  });

  it("returns a stable navigate handler across rerenders", () => {
    const hook = mountNavigate();
    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });
});
