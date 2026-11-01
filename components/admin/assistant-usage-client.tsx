"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ASSISTANT_USAGE_DAY_WINDOWS,
  type AssistantUsageDayWindow,
  type AssistantUsageSummary,
} from "@/lib/assistant/usage-shared";
import { cn } from "@/lib/utils";

const AssistantUsageCharts = dynamic(() => import("@/components/admin/assistant-usage-charts"), {
  ssr: false,
});

const number = (value: number | null): string =>
  value == null ? "—" : value.toLocaleString("en-US");

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function AssistantUsageClient({ initial }: { initial: AssistantUsageSummary }) {
  const [summary, setSummary] = useState(initial);
  const [days, setDays] = useState<AssistantUsageDayWindow>(14);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async (windowDays: AssistantUsageDayWindow) => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/admin/assistant/usage?days=${windowDays}`, { cache: "no-store" });
      if (!response.ok) {
        toast.error("Failed to refresh usage");
        return;
      }
      setSummary((await response.json()) as AssistantUsageSummary);
    } catch {
      toast.error("Failed to refresh usage");
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function changeWindow(next: AssistantUsageDayWindow) {
    if (next === days || refreshing) return;
    setDays(next);
    await loadSummary(next);
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Usage</div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Usage date range"
            className="inline-flex rounded-md border p-0.5"
          >
            {ASSISTANT_USAGE_DAY_WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                disabled={refreshing}
                aria-pressed={days === window}
                onClick={() => void changeWindow(window)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  days === window ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {window}d
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => void loadSummary(days)} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {summary.recording.status === "preview_readonly" ? (
        <p role="status" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          Preview worker: assistant usage is not recorded. Use production admin for live metrics.
        </p>
      ) : null}
      {summary.recording.status === "dev_quota_bypass" ? (
        <p role="status" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          DISABLE_RATE_LIMIT is on. Quota is not enforced; usage is still written after each run.
        </p>
      ) : null}
      {summary.error === "usage_unavailable" ? (
        <p role="status" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          Usage is temporarily unavailable. Quota enforcement is unaffected.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Accepted turns · last hour"
          value={number(summary.current.chargedTurnsHour)}
        />
        <Stat
          label="Accepted turns · last 24 hours"
          value={number(summary.current.chargedTurnsDay)}
        />
        <Stat label="Quota denials · today" value={number(summary.current.denialsToday)} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <Stat label="In flight" value={number(summary.totals.accepted)} />
        <Stat label="Completed" value={number(summary.totals.completed)} />
        <Stat label="Provider failures" value={number(summary.totals.providerErrors)} />
        <Stat label="Rejected" value={number(summary.totals.rejected)} />
      </div>

      <AssistantUsageCharts daily={summary.daily} costConfigured={summary.cost.configured} />
    </div>
  );
}
