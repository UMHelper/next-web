import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduleRow } from "@/lib/update/types";
import type { TaskContext } from "@/lib/update/task-types";
import { UPDATE_TASKS } from "@/lib/update/tasks";
import { createUmFetcher } from "@/lib/update/um-api";

vi.mock("@/lib/update/um-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/update/um-api")>("@/lib/update/um-api");
  return { ...actual, createUmFetcher: vi.fn() };
});

const row: ScheduleRow = {
  offeringUnit: "FBA",
  offeringDept: "AIM",
  code: "ACCT1000",
  title: "ACCOUNTING",
  section: "1",
  mediumInstruction: "English",
  teacherRaw: "CHAN Tai Man",
  day: "MON",
  times: "09:00-10:15",
  location: "E11-101",
};

function context(client: any): TaskContext {
  return {
    client,
    rows: [row],
    mode: "add-drop",
    targetYear: 2026,
    targetSem: 1,
    onProgress: () => {},
    signal: new AbortController().signal,
  };
}

describe("update tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reset-offered calls the reset RPC", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { course_noporf: 5 }, error: null }) };
    await UPDATE_TASKS["reset-offered"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_reset_offered");
  });

  it("check-courses resolves known codes, fetches missing UM data and upserts", async () => {
    (createUmFetcher as any).mockReturnValue(async () => null);
    const client = {
      rpc: vi.fn((name: string) => {
        if (name === "admin_resolve_known_codes") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: { upserted: 1, marked: 0 }, error: null });
      }),
    };

    await UPDATE_TASKS["check-courses"].run(context(client));

    expect(client.rpc).toHaveBeenCalledWith("admin_resolve_known_codes", { codes: ["ACCT1000"] });
    expect(client.rpc).toHaveBeenCalledWith("admin_upsert_offered_courses", {
      inserts: [expect.objectContaining({ New_code: "ACCT1000" })],
      offered_codes: [],
    });
  });

  it("set-offered marks unique codes", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: 1, error: null }) };
    await UPDATE_TASKS["set-offered"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_mark_offered", { codes: ["ACCT1000"] });
  });

  it("apply-schedule tasks call the scoped RPC", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    await UPDATE_TASKS["add-time-location"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", {
      payload: expect.objectContaining({ year: 2026, sem: 1 }),
      scope: "time_location",
    });

    client.rpc.mockClear();
    await UPDATE_TASKS["add-prof-course"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", {
      payload: expect.any(Object),
      scope: "prof_course",
    });

    client.rpc.mockClear();
    await UPDATE_TASKS["add-offer-schedule"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", {
      payload: expect.any(Object),
      scope: "offer",
    });
  });

  it("throws on an RPC error", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) };
    await expect(UPDATE_TASKS["reset-offered"].run(context(client))).rejects.toThrow("boom");
  });
});
