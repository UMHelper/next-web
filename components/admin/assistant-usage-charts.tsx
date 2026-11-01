"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import type { AssistantUsageDay } from "@/lib/assistant/usage-shared";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function cssColor(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `hsl(${value})` : fallback;
}

function chartPalette() {
  return {
    brand: cssColor("--brand", "hsl(221 83% 53%)"),
    success: cssColor("--success", "hsl(142 76% 36%)"),
    destructive: cssColor("--destructive-strong", "hsl(0 72% 41%)"),
    muted: cssColor("--muted-foreground", "hsl(220 9% 46%)"),
    warning: cssColor("--warning", "hsl(26 90% 37%)"),
    border: cssColor("--border", "hsl(214 32% 91%)"),
    foreground: cssColor("--foreground", "hsl(221 39% 11%)"),
  };
}

const formatDayLabel = (day: string) => day.slice(5);

const baseChartOptions = (colors: ReturnType<typeof chartPalette>) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: {
      labels: { color: colors.foreground, boxWidth: 12, boxHeight: 2 },
    },
  },
  scales: {
    x: {
      ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
      grid: { color: colors.border },
    },
  },
});

export default function AssistantUsageCharts({
  daily,
  costConfigured,
}: {
  daily: AssistantUsageDay[];
  costConfigured: boolean;
}) {
  const [colors, setColors] = useState(chartPalette);

  useEffect(() => {
    setColors(chartPalette());
  }, []);

  const labels = useMemo(() => daily.map((row) => formatDayLabel(row.day)), [daily]);

  const activityData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: "In flight",
          data: daily.map((row) => row.accepted),
          borderColor: colors.brand,
          backgroundColor: colors.brand,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: "Completed",
          data: daily.map((row) => row.completed),
          borderColor: colors.success,
          backgroundColor: colors.success,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: "Provider errors",
          data: daily.map((row) => row.providerErrors),
          borderColor: colors.destructive,
          backgroundColor: colors.destructive,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: "Denied",
          data: daily.map((row) => row.denied),
          borderColor: colors.warning,
          backgroundColor: colors.warning,
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: "Rejected",
          data: daily.map((row) => row.rejected),
          borderColor: colors.muted,
          backgroundColor: colors.muted,
          tension: 0.2,
          pointRadius: 2,
        },
      ],
    }),
    [colors, daily, labels],
  );

  const tokenDatasets = useMemo(() => {
    const datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      tension: number;
      pointRadius: number;
      yAxisID: "y" | "y1";
    }> = [
      {
        label: "Input tokens",
        data: daily.map((row) => row.inputTokens ?? 0),
        borderColor: colors.brand,
        backgroundColor: colors.brand,
        tension: 0.2,
        pointRadius: 2,
        yAxisID: "y",
      },
      {
        label: "Output tokens",
        data: daily.map((row) => row.outputTokens ?? 0),
        borderColor: colors.success,
        backgroundColor: colors.success,
        tension: 0.2,
        pointRadius: 2,
        yAxisID: "y",
      },
    ];
    if (costConfigured) {
      datasets.push({
        label: "Est. cost (USD)",
        data: daily.map((row) => row.estimatedCostUsd ?? 0),
        borderColor: colors.warning,
        backgroundColor: colors.warning,
        tension: 0.2,
        pointRadius: 2,
        yAxisID: "y1",
      });
    }
    return datasets;
  }, [colors, costConfigured, daily]);

  const activityOptions = useMemo(
    () => ({
      ...baseChartOptions(colors),
      scales: {
        ...baseChartOptions(colors).scales,
        y: {
          beginAtZero: true,
          ticks: { color: colors.muted, precision: 0 },
          grid: { color: colors.border },
        },
      },
    }),
    [colors],
  );

  const tokenOptions = useMemo(
    () => ({
      ...baseChartOptions(colors),
      scales: {
        ...baseChartOptions(colors).scales,
        y: {
          position: "left" as const,
          beginAtZero: true,
          ticks: { color: colors.muted, precision: 0 },
          grid: { color: colors.border },
        },
        ...(costConfigured
          ? {
              y1: {
                position: "right" as const,
                beginAtZero: true,
                ticks: {
                  color: colors.muted,
                  callback: (value: string | number) => `$${Number(value).toFixed(4)}`,
                },
                grid: { drawOnChartArea: false },
              },
            }
          : {}),
      },
    }),
    [colors, costConfigured],
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="h-56 sm:h-64">
        <Line aria-label="Daily turn outcomes" data={activityData} options={activityOptions} />
      </div>
      <div className="h-56 sm:h-64">
        <Line aria-label="Daily tokens and cost" data={{ labels, datasets: tokenDatasets }} options={tokenOptions} />
      </div>
    </div>
  );
}
