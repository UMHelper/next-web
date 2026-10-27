import { describe, expect, it, vi } from "vitest";

const { getAppConfigMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock("@/lib/assistant/data/discovery", async () => {
  const fixture = await import("./discovery-fixture");
  return {
    MAX_POOL_COURSES: 150,
    loadDiscoveryPool: fixture.loadDiscoveryPool,
    loadReviewTexts: fixture.loadReviewTexts,
  };
});

vi.mock("@/lib/mcp/data/search-catalog", async () => ({
  searchCatalog: (await import("./discovery-fixture")).searchCatalogForAssistant,
}));
vi.mock("@/lib/mcp/data/get-course", async () => ({
  getCourse: (await import("./discovery-fixture")).getCourse,
}));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({
  getInstructor: (await import("./discovery-fixture")).getInstructor,
}));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("./discovery-fixture")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("./discovery-fixture")).getCourseSections,
}));
vi.mock("@/lib/assistant/data/search-catalog", async () => ({
  searchCatalogForAssistant: (await import("./discovery-fixture")).searchCatalogForAssistant,
  countCoursesForAssistant: (await import("./discovery-fixture")).countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/course-text", async () => ({
  getCourseText: (await import("./discovery-fixture")).getCourseText,
}));
vi.mock("@/lib/assistant/data/instructor", async () => ({
  getInstructorForAssistant: (await import("./discovery-fixture")).getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", async () => ({
  countCourseReviews: (await import("./discovery-fixture")).countCourseReviews,
}));

import { runDiscoveryEval } from "./discovery-eval-lib";

const enabled = process.env.ASSISTANT_EVAL === "1";

describe.skipIf(!enabled)("assistant discovery shadow holdout (secondary evidence)", () => {
  it("runs the frozen shadow cases without gating the release", async () => {
    process.env.ASSISTANT_EVAL_SUITE ??= "shadow";
    await runDiscoveryEval({
      getAppConfigMock,
      mode: "with_discovery",
      enforceThresholds: false,
    });
    expect(true).toBe(true);
  });
});
