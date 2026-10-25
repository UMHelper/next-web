import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCourseOutputSchema } from "@/lib/mcp/schemas";
import { getCourse, getCourseSections } from "@/evals/assistant/timetable-fixture";

describe("timetable eval fixture", () => {
  it("returns schema-valid get_course data for MATH1010", async () => {
    const output = await getCourse({ code: "MATH1010", page: 1 });
    expect(getCourseOutputSchema.safeParse(output).success).toBe(true);
  });

  it("returns section data for MATH1010", async () => {
    const output = await getCourseSections({ code: "MATH1010", instructor: "HO SIU MING" });
    expect(output.sections.length).toBeGreaterThanOrEqual(2);
  });
});
