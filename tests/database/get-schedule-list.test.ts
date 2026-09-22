import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc },
}));

import getScheduleList from "@/lib/database/get-schedule-list";

describe("getScheduleList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CURRENT_YEAR = "2026";
    process.env.NEXT_PUBLIC_CURRENT_SEM = "1";
  });

  it("passes current year and semester to the production RPC signature", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await getScheduleList("CISC1000", "CHAN%20TAI%20MAN");

    expect(rpc).toHaveBeenCalledWith("get_schedule_list", {
      course_code: "CISC1000",
      prof: "CHAN TAI MAN",
      target_year: 2026,
      target_sem: 1,
    });
  });

  it("returns an empty list when the RPC has no data", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.get_schedule_list(course_code, prof)" },
    });

    await expect(getScheduleList("CISC1000", "LOCAL TESTER")).resolves.toEqual([]);
  });
});
