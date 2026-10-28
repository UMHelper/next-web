import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdmin, readAssistantAccess, readAssistantLimitOverrides, resolveAssistantConfig, readAssistantUsageSummary, redirect, notFound } =
  vi.hoisted(() => ({
    getCurrentAdmin: vi.fn(),
    readAssistantAccess: vi.fn(),
    readAssistantLimitOverrides: vi.fn(),
    resolveAssistantConfig: vi.fn(),
    readAssistantUsageSummary: vi.fn(),
    redirect: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin }));
vi.mock("@/lib/assistant/access", () => ({ readAssistantAccess }));
vi.mock("@/lib/assistant/settings", () => ({ readAssistantLimitOverrides, resolveAssistantConfig }));
vi.mock("@/lib/assistant/usage", () => ({ readAssistantUsageSummary }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import AssistantAdminPage from "@/app/admin/assistant/page";

const effective = {
  apiKey: "sk-test",
  baseURL: "",
  model: "deepseek-chat",
  thinking: "off",
  maxOutputTokens: 1_024,
  timeoutMs: 45_000,
  ratePerHour: 30,
  ratePerDay: 200,
  maxTurns: 12,
  historyTurns: 4,
  maxSteps: 8,
};

const usage = {
  generatedAt: "2026-10-28T12:00:00.000Z",
  limits: { perHour: 30, perDay: 200 },
  current: { chargedTurnsHour: 0, chargedTurnsDay: 0, denialsToday: 0 },
  totals: {
    accepted: 0,
    completed: 0,
    providerErrors: 0,
    denied: 0,
    rejected: 0,
    inputTokens: null,
    outputTokens: null,
  },
  daily: [],
  cost: { estimate: true, configured: false, currency: "USD" },
};

const children = (view: React.ReactElement) =>
  React.Children.toArray(view.props.children) as React.ReactElement[];

describe("AssistantAdminPage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAssistantAccess.mockResolvedValue("testers");
    readAssistantLimitOverrides.mockResolvedValue({});
    resolveAssistantConfig.mockResolvedValue(effective);
    readAssistantUsageSummary.mockResolvedValue(usage);
  });

  it("redirects anonymous users to sign in", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    await expect(AssistantAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(readAssistantAccess).not.toHaveBeenCalled();
  });

  it("renders access and usage for any admin", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: false } });
    const view = await AssistantAdminPage();
    const rendered = children(view);

    const access = rendered.find((element) => element.props.initialAccess !== undefined);
    expect(access?.props.initialAccess).toBe("testers");
    expect(rendered.find((element) => element.props.initial?.daily !== undefined)).toBeDefined();
    expect(rendered.find((element) => element.props.initial?.bounds !== undefined)).toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("adds the limit editor for platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: true } });
    readAssistantLimitOverrides.mockResolvedValue({ ratePerHour: 60 });

    const view = await AssistantAdminPage();
    const settings = children(view).find((element) => element.props.initial?.bounds !== undefined);

    expect(settings?.props.canEdit).toBe(true);
    expect(settings?.props.initial.configured).toBe(true);
    expect(settings?.props.initial.bounds).toHaveLength(7);
    expect(
      settings?.props.initial.bounds.find((bound: { key: string }) => bound.key === "ratePerHour"),
    ).toMatchObject({ min: 1, max: 500, configuredValue: 60 });
  });
});
