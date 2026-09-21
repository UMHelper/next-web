import { describe, expect, it } from "vitest";
import { createPlanSchema, updatePlanSchema } from "@/lib/validation/timetable";

describe("timetable validation", () => {
  it("accepts a valid create body", () => {
    const parsed = createPlanSchema.safeParse({
      clientRef: "11111111-1111-4111-8111-111111111111",
      name: "我的课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("requires baseRevision on update", () => {
    expect(updatePlanSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("rejects duplicate section keys in the payload", () => {
    const section = {
      key: "A|B|C",
      courseCode: "A",
      prof: "B",
      section: "C",
      color: "#2563eb",
      schedules: [],
    };
    const parsed = createPlanSchema.safeParse({
      clientRef: "11111111-1111-4111-8111-111111111111",
      name: "我的课表",
      year: 2026,
      sem: 1,
      payload: { schemaVersion: 1, sections: [section, section] },
    });
    expect(parsed.success).toBe(false);
  });
});
