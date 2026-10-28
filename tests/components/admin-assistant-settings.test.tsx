import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import AssistantSettingsClient, {
  type AssistantLimitView,
  type AssistantSettingsInitial,
} from "@/components/admin/assistant-settings-client";
import AssistantUsageClient from "@/components/admin/assistant-usage-client";
import type { AssistantUsageSummary } from "@/lib/assistant/usage";

const bounds: AssistantLimitView[] = [
  {
    column: "ai_quota_per_hour",
    key: "ratePerHour",
    label: "Turns per hour",
    unit: "requests",
    min: 1,
    max: 500,
    defaultValue: 30,
    configuredValue: null,
  },
  {
    column: "ai_max_steps",
    key: "maxSteps",
    label: "Steps per run",
    unit: "steps",
    min: 1,
    max: 12,
    defaultValue: 8,
    configuredValue: 6,
  },
];

const settings: AssistantSettingsInitial = {
  configured: true,
  effective: {
    ratePerHour: 30,
    ratePerDay: 200,
    maxTurns: 12,
    historyTurns: 4,
    maxSteps: 6,
    maxOutputTokens: 1_024,
    timeoutMs: 45_000,
  },
  bounds,
};

const usage: AssistantUsageSummary = {
  generatedAt: "2026-10-28T12:00:00.000Z",
  limits: { perHour: 30, perDay: 200 },
  current: { chargedTurnsHour: 2, chargedTurnsDay: 12, denialsToday: 1 },
  totals: {
    accepted: 12,
    completed: 10,
    providerErrors: 1,
    denied: 1,
    rejected: 0,
    inputTokens: 1_000,
    outputTokens: 200,
  },
  daily: [
    {
      day: "2026-10-27",
      accepted: 12,
      completed: 10,
      providerErrors: 1,
      denied: 1,
      rejected: 0,
      inputTokens: 1_000,
      outputTokens: 200,
      estimatedCostUsd: null,
    },
  ],
  cost: { estimate: true, configured: false, currency: "USD" },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantSettingsClient", () => {
  it("exposes server bounds and configured values", () => {
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    const hour = screen.getByLabelText("Turns per hour") as HTMLInputElement;
    expect(hour.min).toBe("1");
    expect(hour.max).toBe("500");
    expect(hour.placeholder).toBe("Inherited (default 30)");

    const steps = screen.getByLabelText("Steps per run") as HTMLInputElement;
    expect(steps.value).toBe("6");
  });

  it("sends null when a field is emptied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    fireEvent.change(screen.getByLabelText("Steps per run"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/app-config");
    expect(JSON.parse(init.body)).toEqual({ ai_quota_per_hour: null, ai_max_steps: null });
  });

  it("blocks out-of-range values before calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    fireEvent.change(screen.getByLabelText("Turns per hour"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is read-only for non-platform admins", () => {
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: false }));

    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.getByText(/platform admin/i)).toBeTruthy();
  });
});

describe("AssistantUsageClient", () => {
  it("labels cost as an estimate and states the privacy boundary", () => {
    render(React.createElement(AssistantUsageClient, { initial: usage }));

    expect(screen.getByText(/cost is an estimate/i)).toBeTruthy();
    expect(screen.getByText(/Prompts, replies, tool arguments/i)).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
  });

  it("refreshes from the admin usage endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...usage, current: { chargedTurnsHour: 9, chargedTurnsDay: 30, denialsToday: 2 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantUsageClient, { initial: usage }));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByText("9")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/assistant/usage", { cache: "no-store" });
  });
});
