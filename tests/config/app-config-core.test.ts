import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_APP_CONFIG,
  mapAppConfigRow,
  readAppConfig,
} from "@/lib/config/app-config-core";

function fakeClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

describe("mapAppConfigRow", () => {
  it("returns defaults for a missing row", () => {
    expect(mapAppConfigRow(null)).toEqual(DEFAULT_APP_CONFIG);
    expect(mapAppConfigRow(undefined)).toEqual(DEFAULT_APP_CONFIG);
  });

  it("maps snake_case columns and coerces types", () => {
    expect(mapAppConfigRow({
      current_year: 2027,
      current_sem: 2,
      is_preenrollment_open: false,
      database_last_update: "2027-01-15",
      updated_at: "2027-01-15T10:00:00.000Z",
      updated_by: "user_admin",
    })).toEqual({
      currentYear: 2027,
      currentSem: 2,
      isPreenrollmentOpen: false,
      databaseLastUpdate: "2027-01-15",
      updatedAt: "2027-01-15T10:00:00.000Z",
      updatedBy: "user_admin",
    });
  });

  it("falls back on invalid enum values", () => {
    expect(mapAppConfigRow({ current_year: "bad", current_sem: 9 })).toMatchObject({
      currentYear: 2026,
      currentSem: 1,
    });
  });
});

describe("readAppConfig", () => {
  it("returns defaults when the query errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await readAppConfig(fakeClient({ data: null, error: { message: "boom" } }) as any);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
    spy.mockRestore();
  });

  it("returns mapped data on success", async () => {
    const config = await readAppConfig(fakeClient({
      data: { current_year: 2028, current_sem: 1, is_preenrollment_open: true, database_last_update: null, updated_at: null, updated_by: null },
      error: null,
    }) as any);
    expect(config.currentYear).toBe(2028);
  });
});
