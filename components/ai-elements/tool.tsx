import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

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
};

type ToolStatus = "running" | "done" | "error" | "pending";

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? { running: `Using ${name}`, done: `Used ${name}` };
}

function toolDetail(call: ToolCall): string | null {
  try {
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    for (const key of ["query", "code", "courseCode", "course", "instructor"]) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // The model can emit incomplete JSON while streaming; show just the label.
  }
  return null;
}

function statusOf(result: ToolMessage | undefined, isRunning: boolean): ToolStatus {
  if (result) return result.error ? "error" : "done";
  return isRunning ? "running" : "pending";
}

const STATUS_ICON: Record<ToolStatus, LucideIcon> = {
  running: Loader2,
  done: Check,
  error: AlertCircle,
  pending: Clock,
};

function ToolRow({
  call,
  result,
  isRunning,
}: {
  call: ToolCall;
  result: ToolMessage | undefined;
  isRunning: boolean;
}) {
  const status = statusOf(result, isRunning);
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
    <div className="flex min-w-0 items-center gap-2 text-xs">
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

function dedupeCalls(calls: ToolCall[]): ToolCall[] {
  const seenIds = new Set<string>();
  const seenDetail = new Set<string>();
  const seenEmpty = new Set<string>();
  const unique: ToolCall[] = [];

  for (const call of calls) {
    if (seenIds.has(call.id)) continue;
    seenIds.add(call.id);

    const name = call.function.name;
    const detail = toolDetail(call);
    if (detail) {
      const key = `${name}\u0000${detail}`;
      if (seenDetail.has(key)) continue;
      seenDetail.add(key);
      unique.push(call);
    } else {
      if (seenEmpty.has(name)) continue;
      seenEmpty.add(name);
      unique.push(call);
    }
  }

  // A call replayed without arguments should not sit next to the same call that
  // did carry the query. Keep the informative row.
  const namesWithDetail = new Set(
    unique.filter((call) => toolDetail(call)).map((call) => call.function.name),
  );
  return unique.filter((call) => toolDetail(call) || !namesWithDetail.has(call.function.name));
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
  const rows = dedupeCalls(calls);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      {rows.map((call) => (
        <ToolRow key={call.id} call={call} result={results.get(call.id)} isRunning={isRunning} />
      ))}
    </div>
  );
}
