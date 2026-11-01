import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("@/lib/supabase/admin", () => ({
  default: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

import { ASSISTANT_LIMIT_BOUNDS, resolveAssistantConfig } from "@/lib/assistant/settings";

describe("resolveAssistantConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses environment defaults when the row has no overrides", async () => {
    maybeSingle.mockResolvedValue({ data: { ai_quota_per_hour: null }, error: null });

    const config = await resolveAssistantConfig({
      AI_API_KEY: "k",
      AGENT_RATE_LIMIT_PER_HOUR: "10",
      AGENT_MAX_STEPS: "6",
    });

    expect(config.ratePerHour).toBe(10);
    expect(config.maxSteps).toBe(6);
    expect(config.ratePerDay).toBe(80);
  });

  it("lets database values win and clamps out-of-range values", async () => {
    maybeSingle.mockResolvedValue({
      data: { ai_quota_per_hour: 5000, ai_max_steps: 99 },
      error: null,
    });

    const config = await resolveAssistantConfig({});

    expect(config.ratePerHour).toBe(ASSISTANT_LIMIT_BOUNDS.ratePerHour.max);
    expect(config.maxSteps).toBe(ASSISTANT_LIMIT_BOUNDS.maxSteps.max);
  });

  it("clamps environment values that exceed the absolute ceiling", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const config = await resolveAssistantConfig({
      AGENT_RATE_LIMIT_PER_DAY: "99999",
      AI_MAX_OUTPUT_TOKENS: "999999",
    });

    expect(config.ratePerDay).toBe(ASSISTANT_LIMIT_BOUNDS.ratePerDay.max);
    expect(config.maxOutputTokens).toBe(ASSISTANT_LIMIT_BOUNDS.maxOutputTokens.max);
  });

  it("falls back to environment values when the read fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });

    const config = await resolveAssistantConfig({ AGENT_RATE_LIMIT_PER_DAY: "42" });

    expect(config.ratePerDay).toBe(42);
  });

  it("falls back when the read throws", async () => {
    maybeSingle.mockRejectedValue(new Error("network"));

    const config = await resolveAssistantConfig({ AGENT_MAX_TURNS_PER_CONVERSATION: "12" });

    expect(config.maxTurns).toBe(12);
  });

  it("skips the database in read-only preview", async () => {
    vi.stubEnv("PREVIEW_DB_READONLY", "1");

    const config = await resolveAssistantConfig({ AGENT_RATE_LIMIT_PER_HOUR: "7" });

    expect(config.ratePerHour).toBe(7);
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
