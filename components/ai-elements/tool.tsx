import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  type LucideIcon,
} from "lucide-react";

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

const TOOL_FAILED: Record<string, string> = {
  search_catalog: "Couldn't search courses",
  get_course: "Couldn't read course",
  get_instructor: "Couldn't read instructor",
  get_course_reviews: "Couldn't read reviews",
  get_course_sections: "Couldn't read class times",
  check_plan_conflicts: "Couldn't check timetable",
  preview_timetable: "Couldn't build timetable preview",
  filter_catalog_results: "Couldn't filter results",
  present_response: "Couldn't choose a layout",
};

function failedLabel(name: string) {
  return TOOL_FAILED[name] ?? "Lookup failed";
}

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

export function ToolRow({
  call,
  result,
  isRunning,
  announce = false,
}: {
  call: ToolCall;
  result: ToolMessage | undefined;
  isRunning: boolean;
  announce?: boolean;
}) {
  const status = toolActivityStatus(call.function.name, result, isRunning);
  const Icon = STATUS_ICON[status];
  const label = toolLabel(call.function.name);
  const detail = toolDetail(call);
  const text =
    status === "running"
      ? `${label.running}…`
      : status === "error"
        ? failedLabel(call.function.name)
        : status === "pending"
          ? "Not completed"
          : label.done;

  return (
    <div
      role={announce ? "status" : undefined}
      data-status={status}
      className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-xs"
    >
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
          className={cn("h-3.5 w-3.5", status === "running" && "motion-safe:animate-spin")}
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
        <span className="min-w-0 truncate text-xs text-muted-foreground">· {detail}</span>
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

export function ToolTrace({
  calls,
  results,
  isRunning,
}: {
  calls: ToolCall[];
  results: Map<string, ToolMessage>;
  isRunning: boolean;
}) {
  const rows = dedupeCalls(calls, results);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      {rows.map((call) => (
        <ToolRow
          key={call.id}
          call={call}
          result={results.get(call.id)}
          isRunning={isRunning}
          announce
        />
      ))}
    </div>
  );
}
