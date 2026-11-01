import { describe, expect, it } from "vitest";

import { buildAssistantLimitAuditDiff, effectiveAssistantLimit } from "@/lib/assistant/limit-audit";

const env = {
  ratePerHour: 30,
  ratePerDay: 80,
  maxTurns: 30,
  historyTurns: 8,
  maxSteps: 8,
  maxOutputTokens: 2_000,
  timeoutMs: 30_000,
} as const;

describe("assistant limit audit", () => {
  it("maps stored null to the environment default for display", () => {
    expect(effectiveAssistantLimit("ai_quota_per_hour", null, env as never)).toBe(30);
    expect(effectiveAssistantLimit("ai_quota_per_hour", 300, env as never)).toBe(300);
  });

  it("shows effective before/after when inheriting vs overriding", () => {
    const { before, after } = buildAssistantLimitAuditDiff(
      ["ai_quota_per_hour"],
      { ai_quota_per_hour: null },
      { ai_quota_per_hour: 300 },
      env as never,
    );
    expect(before).toEqual({ ai_quota_per_hour: 30 });
    expect(after).toEqual({ ai_quota_per_hour: 300 });
  });

  it("shows effective after when clearing an override", () => {
    const { before, after } = buildAssistantLimitAuditDiff(
      ["ai_quota_per_hour"],
      { ai_quota_per_hour: 381 },
      { ai_quota_per_hour: null },
      env as never,
    );
    expect(before).toEqual({ ai_quota_per_hour: 381 });
    expect(after).toEqual({ ai_quota_per_hour: 30 });
  });
});
