import { describe, expect, it } from "vitest";
import {
  adminGrantSchema,
  appConfigUpdateSchema,
  commentUpdateSchema,
  courseUpdateSchema,
  profWithCourseUpdateSchema,
  reportUpdateSchema,
  syncUmSchema,
} from "@/lib/validation/admin";
import { ASSISTANT_LIMIT_BOUNDS } from "@/lib/assistant/limits";

describe("admin validation schemas", () => {
  it("validates admin grant ids", () => {
    expect(adminGrantSchema.safeParse({ clerk_user_id: "user_abc" }).success).toBe(true);
    expect(adminGrantSchema.safeParse({ clerk_user_id: "admin@example.com" }).success).toBe(true);
    expect(adminGrantSchema.safeParse({ clerk_user_id: "not-a-user" }).success).toBe(false);
  });

  it("validates report status updates", () => {
    expect(reportUpdateSchema.safeParse({ status: "resolved" }).success).toBe(true);
    expect(reportUpdateSchema.safeParse({ status: "closed" }).success).toBe(false);
    expect(reportUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates comment text/image updates", () => {
    expect(commentUpdateSchema.safeParse({ content: "hello" }).success).toBe(true);
    expect(commentUpdateSchema.safeParse({ img: null }).success).toBe(true);
    expect(commentUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates course updates", () => {
    expect(courseUpdateSchema.safeParse({ Credits: "3" }).success).toBe(true);
    expect(courseUpdateSchema.safeParse({ Is_Offered: 2 }).success).toBe(false);
    expect(courseUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates professor-course notes updates", () => {
    expect(profWithCourseUpdateSchema.safeParse({ admin_note: "注意" }).success).toBe(true);
    expect(profWithCourseUpdateSchema.safeParse({ admin_note_en: null }).success).toBe(true);
    expect(profWithCourseUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("requires code for sync mode=code", () => {
    expect(syncUmSchema.safeParse({ mode: "code" }).success).toBe(false);
    expect(syncUmSchema.safeParse({ mode: "code", code: "ACCT1000" }).success).toBe(true);
    expect(syncUmSchema.safeParse({ mode: "missing", limit: 51 }).success).toBe(false);
  });

  const limitColumns = [
    ["ai_quota_per_hour", "ratePerHour"],
    ["ai_quota_per_day", "ratePerDay"],
    ["ai_max_turns", "maxTurns"],
    ["ai_history_turns", "historyTurns"],
    ["ai_max_steps", "maxSteps"],
    ["ai_max_output_tokens", "maxOutputTokens"],
    ["ai_timeout_ms", "timeoutMs"],
  ] as const;

  it.each(limitColumns)("bounds %s and accepts null", (column, key) => {
    const { min, max } = ASSISTANT_LIMIT_BOUNDS[key];
    expect(appConfigUpdateSchema.safeParse({ [column]: min }).success).toBe(true);
    expect(appConfigUpdateSchema.safeParse({ [column]: max }).success).toBe(true);
    expect(appConfigUpdateSchema.safeParse({ [column]: null }).success).toBe(true);
    expect(appConfigUpdateSchema.safeParse({ [column]: min - 1 }).success).toBe(false);
    expect(appConfigUpdateSchema.safeParse({ [column]: max + 1 }).success).toBe(false);
    expect(appConfigUpdateSchema.safeParse({ [column]: 1.5 }).success).toBe(false);
  });

  it("rejects a zero quota but accepts zero history turns", () => {
    expect(appConfigUpdateSchema.safeParse({ ai_quota_per_hour: 0 }).success).toBe(false);
    expect(appConfigUpdateSchema.safeParse({ ai_history_turns: 0 }).success).toBe(true);
  });

  it("rejects an empty app config patch", () => {
    expect(appConfigUpdateSchema.safeParse({}).success).toBe(false);
  });
});
