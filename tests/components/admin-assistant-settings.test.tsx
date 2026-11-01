import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({
  default: () => {
    const ReactModule = require("react");
    return () => ReactModule.createElement("div", { "data-testid": "usage-charts" });
  },
}));

import AssistantSettingsClient, {
  type AssistantLimitView,
  type AssistantSettingsInitial,
} from "@/components/admin/assistant-settings-client";
import AssistantUsageClient from "@/components/admin/assistant-usage-client";
import type { AssistantUsageSummary } from "@/lib/assistant/usage-shared";

const bounds: AssistantLimitView[] = [
  {
    column: "ai_quota_per_hour",
    key: "ratePerHour",
    label: "Turns per hour",
    unit: "requests",
    min: 1,
    defaultValue: 30,
    configuredValue: null,
  },
  {
    column: "ai_max_steps",
    key: "maxSteps",
    label: "Steps per run",
    unit: "steps",
    min: 1,
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
  recording: { status: "live" },
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
    expect(hour.getAttribute("max")).toBeNull();
    expect(hour.value).toBe("30");

    const steps = screen.getByLabelText("Steps per run") as HTMLInputElement;
    expect(steps.value).toBe("6");
  });

  it("posts null immediately when reset clears a stored override", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    const stepsField = screen.getByLabelText("Steps per run").closest("div.space-y-1");
    fireEvent.click(within(stepsField!).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/app-config");
    expect(JSON.parse(init.body)).toEqual({ ai_max_steps: null });
    expect(screen.queryByRole("button", { name: "Save limits" })).toHaveProperty("disabled", true);
  });

  it("sends only edited fields and leaves inherited columns out of the patch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    fireEvent.change(screen.getByLabelText("Turns per hour"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ai_quota_per_hour: 300 });
  });

  it("does not call the API when save is clicked with no edits", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantSettingsClient, { initial: settings, canEdit: true }));

    expect(screen.getByRole("button", { name: "Save limits" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(screen.getByText("Limits")).toBeTruthy();
  });
});

describe("AssistantUsageClient", () => {
  it("renders summary stats and charts instead of the daily table", () => {
    render(React.createElement(AssistantUsageClient, { initial: usage }));

    expect(screen.getByText("Accepted turns · last hour")).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getByTestId("usage-charts")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("loads a new window when the range switcher changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => usage,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantUsageClient, { initial: usage }));

    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/assistant/usage?days=7", { cache: "no-store" }),
    );
  });

  it("shows a banner when dev quota bypass is active", () => {
    render(
      React.createElement(AssistantUsageClient, {
        initial: { ...usage, recording: { status: "dev_quota_bypass" } },
      }),
    );

    expect(screen.getByText(/DISABLE_RATE_LIMIT is on/)).toBeTruthy();
  });

  it("refreshes from the admin usage endpoint with the selected window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...usage, current: { chargedTurnsHour: 9, chargedTurnsDay: 30, denialsToday: 2 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(AssistantUsageClient, { initial: usage }));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getAllByText("9").length).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/assistant/usage?days=14", { cache: "no-store" });
  });
});
