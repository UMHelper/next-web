import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/assistant/settings", () => ({
  resolveAssistantConfig: async () => ({ ratePerHour: 30, ratePerDay: 200 }),
}));
vi.mock("@/lib/supabase/admin", () => ({ default: { from, rpc } }));

import { estimateUsageCost, readAssistantUsageSummary } from "@/lib/assistant/usage";

function countQuery(result: { count: number | null; error: { message: string } | null }) {
  const builder = {
    select: () => builder,
    gte: () => builder,
    eq: () => builder,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const dailyRow = (overrides: Record<string, unknown> = {}) => ({
  day: "2026-10-27",
  accepted: 4,
  completed: 3,
  provider_errors: 1,
  denied: 2,
  rejected: 0,
  input_tokens: 1_000,
  cached_input_tokens: 400,
  output_tokens: 100,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
  from.mockImplementation(() => countQuery({ count: 0, error: null }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("estimateUsageCost", () => {
  const tokens = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000 };

  it("returns null when input or output pricing is missing", () => {
    expect(
      estimateUsageCost(tokens, { inputPerMTok: null, cachedInputPerMTok: null, outputPerMTok: 8 }),
    ).toBeNull();
    expect(
      estimateUsageCost(tokens, { inputPerMTok: 2, cachedInputPerMTok: null, outputPerMTok: null }),
    ).toBeNull();
  });

  it("returns null when the provider did not report tokens", () => {
    expect(
      estimateUsageCost(
        { inputTokens: null, outputTokens: 100 },
        { inputPerMTok: 2, cachedInputPerMTok: null, outputPerMTok: 8 },
      ),
    ).toBeNull();
  });

  it("prices cached input separately from fresh input", () => {
    const cost = estimateUsageCost(tokens, {
      inputPerMTok: 2,
      cachedInputPerMTok: 0.5,
      outputPerMTok: 8,
    });
    expect(cost).toBeCloseTo(1.2 + 0.2 + 0.8, 6);
  });

  it("charges cached tokens at the input price when no cached price is set", () => {
    const cost = estimateUsageCost(tokens, {
      inputPerMTok: 2,
      cachedInputPerMTok: null,
      outputPerMTok: 8,
    });
    expect(cost).toBeCloseTo(2 + 0.8, 6);
  });
});

describe("readAssistantUsageSummary", () => {
  it("groups daily rows and totals measured tokens", async () => {
    rpc.mockResolvedValue({
      data: [
        dailyRow(),
        dailyRow({ day: "2026-10-28", accepted: 1, completed: 1, provider_errors: 0, denied: 0, input_tokens: null, cached_input_tokens: null, output_tokens: null }),
      ],
      error: null,
    });
    const counts = [6, 20, 3];
    from.mockImplementation(() => countQuery({ count: counts.shift() ?? 0, error: null }));

    const summary = await readAssistantUsageSummary(new Date("2026-10-28T12:00:00.000Z"));

    expect(summary.limits).toEqual({ perHour: 30, perDay: 200 });
    expect(summary.current).toEqual({ chargedTurnsHour: 6, chargedTurnsDay: 20, denialsToday: 3 });
    expect(summary.daily).toHaveLength(2);
    expect(summary.daily[0]).toMatchObject({ day: "2026-10-27", accepted: 4, providerErrors: 1, denied: 2 });
    expect(summary.daily[1]).toMatchObject({ day: "2026-10-28", inputTokens: null, estimatedCostUsd: null });
    expect(summary.totals).toMatchObject({
      accepted: 5,
      completed: 4,
      providerErrors: 1,
      denied: 2,
      rejected: 0,
      inputTokens: 1_000,
      outputTokens: 100,
    });
    expect(summary.generatedAt).toBe("2026-10-28T12:00:00.000Z");
  });

  it("marks cost as an estimate and reports whether pricing is configured", async () => {
    vi.stubEnv("AI_PRICE_INPUT_PER_MTOK", "2");
    vi.stubEnv("AI_PRICE_CACHED_INPUT_PER_MTOK", "0.5");
    vi.stubEnv("AI_PRICE_OUTPUT_PER_MTOK", "8");
    rpc.mockResolvedValue({ data: [dailyRow()], error: null });

    const summary = await readAssistantUsageSummary();

    expect(summary.cost).toEqual({ estimate: true, configured: true, currency: "USD" });
    expect(summary.daily[0].estimatedCostUsd).not.toBeNull();
  });

  it("keeps tokens but null cost when pricing is absent", async () => {
    rpc.mockResolvedValue({ data: [dailyRow()], error: null });

    const summary = await readAssistantUsageSummary();

    expect(summary.cost).toEqual({ estimate: true, configured: false, currency: "USD" });
    expect(summary.daily[0].inputTokens).toBe(1_000);
    expect(summary.daily[0].estimatedCostUsd).toBeNull();
  });

  it("returns an empty table instead of throwing when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });

    const summary = await readAssistantUsageSummary();

    expect(summary.daily).toEqual([]);
    expect(summary.error).toBe("usage_unavailable");
    expect(summary.limits.perHour).toBe(30);
  });

  it("exposes only pseudonymous aggregates", async () => {
    rpc.mockResolvedValue({ data: [dailyRow()], error: null });
    const serialized = JSON.stringify(await readAssistantUsageSummary());

    for (const forbidden of ["user_hash", "thread_hash", "turn_key", "prompt", "reply", "content"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
