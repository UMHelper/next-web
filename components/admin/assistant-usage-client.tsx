"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { AssistantUsageSummary } from "@/lib/assistant/usage";

const number = (value: number | null): string =>
  value == null ? "—" : value.toLocaleString("en-US");

const cost = (value: number | null): string =>
  value == null ? "—" : `$${value.toFixed(4)}`;

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

export default function AssistantUsageClient({ initial }: { initial: AssistantUsageSummary }) {
  const [summary, setSummary] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/assistant/usage", { cache: "no-store" });
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
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 text-sm font-medium">Usage</div>
          <div className="text-xs text-muted-foreground">
            Provider-reported counts and tokens. Cost is an estimate from configured list prices, not a
            bill.
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {summary.error === "usage_unavailable" ? (
        <p role="status" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          Usage is temporarily unavailable. Quota enforcement is unaffected.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Accepted turns · last hour"
          value={number(summary.current.chargedTurnsHour)}
          hint={`Per-user limit ${summary.limits.perHour}/hour`}
        />
        <Stat
          label="Accepted turns · last 24 hours"
          value={number(summary.current.chargedTurnsDay)}
          hint={`Per-user limit ${summary.limits.perDay}/day`}
        />
        <Stat
          label="Quota denials · today"
          value={number(summary.current.denialsToday)}
          hint="Rejected before execution"
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <Stat label="Accepted" value={number(summary.totals.accepted)} hint="Last 14 days" />
        <Stat label="Completed" value={number(summary.totals.completed)} hint="Last 14 days" />
        <Stat label="Provider failures" value={number(summary.totals.providerErrors)} hint="Last 14 days" />
        <Stat label="Rejected" value={number(summary.totals.rejected)} hint="Too long or too large" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2">Day</th>
              <th className="py-2 text-right">Accepted</th>
              <th className="py-2 text-right">Completed</th>
              <th className="py-2 text-right">Provider errors</th>
              <th className="py-2 text-right">Denied</th>
              <th className="py-2 text-right">Rejected</th>
              <th className="py-2 text-right">Input tokens</th>
              <th className="py-2 text-right">Output tokens</th>
              <th className="py-2 text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {summary.daily.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground">
                  No usage recorded yet
                </td>
              </tr>
            ) : null}
            {summary.daily.map((day) => (
              <tr key={day.day} className="border-b last:border-0">
                <td className="py-2 text-xs">{day.day}</td>
                <td className="py-2 text-right text-xs">{number(day.accepted)}</td>
                <td className="py-2 text-right text-xs">{number(day.completed)}</td>
                <td className="py-2 text-right text-xs">{number(day.providerErrors)}</td>
                <td className="py-2 text-right text-xs">{number(day.denied)}</td>
                <td className="py-2 text-right text-xs">{number(day.rejected)}</td>
                <td className="py-2 text-right text-xs">{number(day.inputTokens)}</td>
                <td className="py-2 text-right text-xs">{number(day.outputTokens)}</td>
                <td className="py-2 text-right text-xs">{cost(day.estimatedCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Aggregate and pseudonymous: per-user hashes are never shown. Prompts, replies, tool arguments, and
        course records are not stored. {summary.cost.configured
          ? "Cost uses configured token prices and may differ from the provider invoice."
          : "Token pricing is not configured, so cost is hidden."}
      </p>
    </div>
  );
}
