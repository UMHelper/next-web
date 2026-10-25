import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";

const { getAppConfigMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({
  getCourseSections: vi.fn(),
}));

import { defaultTimetableToolDeps } from "@/lib/assistant/timetable-tools";

describe("defaultTimetableToolDeps.loadCatalogTerm", () => {
  beforeEach(() => {
    getAppConfigMock.mockReset();
    getAppConfigMock.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
  });

  it("returns the catalog term from getAppConfig", async () => {
    await expect(defaultTimetableToolDeps.loadCatalogTerm()).resolves.toEqual({
      year: 2026,
      sem: 1,
    });
    expect(getAppConfigMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces failures when getAppConfig throws", async () => {
    getAppConfigMock.mockRejectedValue(new Error("offline"));
    await expect(defaultTimetableToolDeps.loadCatalogTerm()).rejects.toThrow("offline");
  });
});
