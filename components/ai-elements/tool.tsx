"use client";

import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { ConversationScrollTogglePreserver } from "@/components/ai-elements/conversation";

import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

import { toolActivityStatus, type ToolActivityStatus } from "@/lib/assistant/tool-activity";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  search_catalog: { running: "Searching courses", done: "Searched courses" },
  count_courses: { running: "Counting courses", done: "Counted courses" },
  get_course: { running: "Reading course", done: "Read course" },
  get_course_description: { running: "Reading description", done: "Read description" },
  get_course_ilo: { running: "Reading learning outcomes", done: "Read learning outcomes" },
  get_instructor: { running: "Reading instructor", done: "Read instructor" },
  get_course_reviews: { running: "Reading reviews", done: "Read reviews" },
  count_reviews: { running: "Counting reviews", done: "Counted reviews" },
  get_course_sections: { running: "Reading class times", done: "Read class times" },
  check_plan_conflicts: { running: "Checking timetable", done: "Checked timetable" },
  preview_timetable: { running: "Building timetable preview", done: "Built timetable preview" },
  filter_catalog_results: { running: "Filtering results", done: "Filtered results" },
  present_response: { running: "Choosing a layout", done: "Chose a layout" },
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? { running: `Using ${name}`, done: `Used ${name}` };
}

function toolDetail(call: ToolCall): string | null {
  try {
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    for (const key of ["query", "code", "courseCode", "course", "name", "instructor"]) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // The model can emit incomplete JSON while streaming; show just the label.
  }
  return null;
}

const STATUS_ICON: Record<ToolActivityStatus, LucideIcon> = {
  running: Loader2,
  done: Check,
  error: AlertCircle,
  pending: Clock,
};

export function traceSummaryLabel(
  rows: ToolCall[],
  results: Map<string, ToolMessage>,
  isRunning: boolean,
): string {
  if (isRunning) {
    for (const call of rows) {
      const status = toolActivityStatus(
        call.function.name,
        results.get(call.id),
        isRunning,
      );
      if (status === "running") {
        return `${toolLabel(call.function.name).running}…`;
      }
    }
    return "Working…";
  }
  const n = rows.length;
  return n === 1 ? "1 step" : `${n} steps`;
}

export function traceToggleAriaLabel(expanded: boolean, stepCount: number): string {
  if (expanded) return "Hide tool steps";
  return stepCount === 1 ? "Show 1 tool step" : `Show ${stepCount} tool steps`;
}

export function ToolRow({
  call,
  result,
  isRunning,
}: {
  call: ToolCall;
  result: ToolMessage | undefined;
  isRunning: boolean;
}) {
  const status = toolActivityStatus(call.function.name, result, isRunning);
  const Icon = STATUS_ICON[status];
  const label = toolLabel(call.function.name);
  const detail = toolDetail(call);
  const text =
    status === "running"
      ? `${label.running}…`
      : status === "error"
        ? "Lookup failed"
        : status === "pending"
          ? "Not completed"
          : label.done;

  return (
    <div data-status={status} className="flex min-w-0 items-center gap-2 text-xs">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center",
          status === "error"
            ? "text-destructive-strong"
            : status === "running"
              ? "text-brand"
              : "text-muted-foreground",
        )}
      >
        <Icon
          className={cn("h-3.5 w-3.5", status === "running" && "animate-spin")}
          aria-hidden
        />
      </span>
      <span
        className={cn(
          "shrink-0 font-medium",
          status === "error" ? "text-destructive-strong" : "text-foreground",
        )}
      >
        {text}
      </span>
      {detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

export function dedupeCalls(
  calls: ToolCall[],
  results?: Map<string, ToolMessage>,
): ToolCall[] {
  const bestById = new Map<string, ToolCall>();
  const idOrder: string[] = [];

  for (const call of calls) {
    if (!bestById.has(call.id)) {
      idOrder.push(call.id);
      bestById.set(call.id, call);
      continue;
    }
    const existing = bestById.get(call.id)!;
    if (!toolDetail(existing) && toolDetail(call)) {
      bestById.set(call.id, call);
    }
  }

  const unique = idOrder.map((id) => bestById.get(id)!);

  const namesWithDetail = new Set(
    unique.filter((call) => toolDetail(call)).map((call) => call.function.name),
  );

  const afterReplayFilter = unique.filter((call) => {
    if (toolDetail(call)) return true;
    if (results?.has(call.id)) return true;
    return !namesWithDetail.has(call.function.name);
  });

  const seenEmpty = new Set<string>();
  return afterReplayFilter.filter((call) => {
    if (toolDetail(call) || results?.has(call.id)) return true;
    const name = call.function.name;
    if (seenEmpty.has(name)) return false;
    seenEmpty.add(name);
    return true;
  });
}

function traceShowsRunningSpinner(
  rows: ToolCall[],
  results: Map<string, ToolMessage>,
  isRunning: boolean,
): boolean {
  if (!isRunning) return false;
  return rows.some(
    (call) =>
      toolActivityStatus(call.function.name, results.get(call.id), isRunning) ===
      "running",
  );
}

export function ToolTrace({
  calls,
  results,
  isRunning,
  scrollTogglePreserver,
}: {
  calls: ToolCall[];
  results: Map<string, ToolMessage>;
  isRunning: boolean;
  scrollTogglePreserver?: ConversationScrollTogglePreserver;
}) {
  const rows = dedupeCalls(calls, results);
  const listId = useId();
  const [expanded, setExpanded] = useState(isRunning);
  const manualToggleRef = useRef(false);

  useEffect(() => {
    setExpanded(isRunning);
  }, [isRunning]);

  useLayoutEffect(() => {
    if (!manualToggleRef.current) return;
    manualToggleRef.current = false;
    scrollTogglePreserver?.apply();
  }, [expanded, scrollTogglePreserver]);

  if (rows.length === 0) return null;

  const summary = expanded
    ? rows.length === 1
      ? "1 step"
      : `${rows.length} steps`
    : traceSummaryLabel(rows, results, isRunning);
  const showSpinner = !expanded && traceShowsRunningSpinner(rows, results, isRunning);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={traceToggleAriaLabel(expanded, rows.length)}
        onClick={() => {
          manualToggleRef.current = true;
          scrollTogglePreserver?.lock();
          setExpanded((open) => !open);
        }}
      >
        {showSpinner ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" aria-hidden />
        ) : (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        )}
        <span className="min-w-0 truncate font-medium">{summary}</span>
      </button>
      {expanded ? (
        <div id={listId} className="flex flex-col gap-1.5 pl-5" aria-live="polite">
          {rows.map((call) => (
            <ToolRow
              key={call.id}
              call={call}
              result={results.get(call.id)}
              isRunning={isRunning}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
