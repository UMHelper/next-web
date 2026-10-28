import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin, readAssistantUsageSummary } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  readAssistantUsageSummary: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/assistant/usage", () => ({ readAssistantUsageSummary }));

import { GET } from "@/app/api/admin/assistant/usage/route";

const summary = {
  generatedAt: "2026-10-28T12:00:00.000Z",
  limits: { perHour: 30, perDay: 200 },
  current: { chargedTurnsHour: 2, chargedTurnsDay: 5, denialsToday: 0 },
  totals: {
    accepted: 5,
    completed: 4,
    providerErrors: 1,
    denied: 0,
    rejected: 0,
    inputTokens: 1_000,
    outputTokens: 100,
  },
  daily: [],
  cost: { estimate: true, configured: false, currency: "USD" },
};

describe("/api/admin/assistant/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: false } });
    readAssistantUsageSummary.mockResolvedValue(summary);
  });

  it("requires an admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden" } }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(readAssistantUsageSummary).not.toHaveBeenCalled();
  });

  it("returns aggregates without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(summary);
    expect(requireAdmin).toHaveBeenCalledWith();
  });

  it("does not leak per-user identifiers", async () => {
    const body = JSON.stringify(await (await GET()).json());
    for (const forbidden of ["user_hash", "thread_hash", "turn_key", "user_1"]) {
      expect(body).not.toContain(forbidden);
    }
  });
});
