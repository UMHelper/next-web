import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfig, rpc } = vi.hoisted(() => ({ getAppConfig: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/config/app-config", () => ({ getAppConfig }));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import getScheduleList from "@/lib/database/get-schedule-list";

describe("getScheduleList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfig.mockResolvedValue({ currentYear: 2026, currentSem: 1 });
  });

  it("passes the current term to the RPC and groups by section", async () => {
    rpc.mockResolvedValue({
      data: [
        { section: "1", date: "MON", times: "09:00-10:15", location: "E1" },
        { section: "1", date: "MON", times: "09:00-10:15", location: "E1" },
        { section: "1", date: "WED", times: "09:00-10:15", location: "E1" },
        { section: "2", date: "FRI", times: "13:00-14:15", location: "E2" },
      ],
      error: null,
    });

    const result = await getScheduleList("ACCT1000", "CHAN Tai Man");

    expect(rpc).toHaveBeenCalledWith("get_schedule_list", {
      course_code: "ACCT1000",
      prof: "CHAN Tai Man",
      target_year: 2026,
      target_sem: 1,
    });
    expect(result).toEqual([
      {
        section: "1",
        schedules: [
          { date: "MON", time: "09:00-10:15", location: "E1" },
          { date: "WED", time: "09:00-10:15", location: "E1" },
        ],
      },
      { section: "2", schedules: [{ date: "FRI", time: "13:00-14:15", location: "E2" }] },
    ]);
  });

  it("returns an empty array on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getScheduleList("ACCT1000", "X")).resolves.toEqual([]);
    spy.mockRestore();
  });
});
