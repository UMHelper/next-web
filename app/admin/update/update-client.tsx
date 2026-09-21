"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { parseScheduleWorkbook } from "@/lib/update/excel";
import { PIPELINE_STAGES } from "@/lib/update/pipeline";
import { createRelayClient } from "@/lib/update/relay-client";
import { runTasks } from "@/lib/update/runner";
import { UPDATE_TASKS } from "@/lib/update/tasks";
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";
import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";

const TASK_IDS = Object.keys(UPDATE_TASKS);

type TaskState = "pending" | "running" | "done" | "error";
type LogLine = { at: string; text: string };

const clock = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });

function taskBadge(state: TaskState | undefined) {
  switch (state) {
    case "running":
      return { label: "运行中", className: "bg-blue-100 text-blue-700" };
    case "done":
      return { label: "完成", className: "bg-green-100 text-green-700" };
    case "error":
      return { label: "失败", className: "bg-red-100 text-red-700" };
    default:
      return { label: "待执行", className: "bg-gray-100 text-gray-500" };
  }
}

export default function UpdateClient() {
  const [mode, setMode] = useState<ScheduleMode>("add-drop");
  const [targetYear, setTargetYear] = useState(2026);
  const [targetSem, setTargetSem] = useState(1);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [selected, setSelected] = useState<string[]>(PIPELINE_STAGES.flatMap((stage) => stage.tasks));
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const appendLog = (text: string) =>
    setLog((current) => [...current.slice(-199), { at: clock(), text }]);

  useEffect(() => {
    if (running) logRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, log.length]);

  const availableTasks = useMemo(
    () => TASK_IDS.map((id) => UPDATE_TASKS[id]).filter((task) => task.modes.includes(mode)),
    [mode],
  );

  const runnableTasks = useMemo(
    () =>
      selected
        .map((id) => UPDATE_TASKS[id])
        .filter((task): task is UpdateTask => Boolean(task) && task.modes.includes(mode)),
    [selected, mode],
  );

  const completedCount = runnableTasks.filter((task) => taskStates[task.id] === "done").length;
  const inFlight = running && total > 0 ? Math.min(done / total, 1) : 0;
  const overallPercent =
    runnableTasks.length === 0 ? 0 : Math.round(((completedCount + inFlight) / runnableTasks.length) * 100);

  async function handleFile(file: File) {
    setError(null);
    setFinished(false);
    try {
      const data = await file.arrayBuffer();
      const parsed = parseScheduleWorkbook(data, { mode });
      setRows(parsed);
      appendLog(`解析完成：${parsed.length} 行（${mode}）`);
      if (parsed.length === 0) {
        setError("未能解析出任何行：请确认表类型（Add/Drop / Pre-enrollment）与文件是否匹配。");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRows([]);
      setError(`解析文件失败：${message}`);
      appendLog(`✘ 解析文件失败：${message}`);
      toast.error(`解析文件失败：${message}`);
    }
  }

  async function run() {
    if (rows.length === 0) {
      setError("请先上传并解析 Excel 时间表（Step 1）。");
      return;
    }
    if (runnableTasks.length === 0) {
      setError("请至少勾选一个任务。");
      return;
    }
    if (
      selected.includes("reset-offered") &&
      !window.confirm("reset-offered 会先把所有课程/教师标为未开课，再按 Excel 重新标记。确认继续？")
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    setFinished(false);
    setDone(0);
    setTotal(0);
    setTaskStates(Object.fromEntries(runnableTasks.map((task) => [task.id, "pending" as TaskState])));
    appendLog(`开始执行 ${runnableTasks.length} 个任务（target ${targetYear}/${targetSem}）`);
    toast.info("开始执行更新流水线…");
    abortRef.current = new AbortController();

    try {
      const ctx: TaskContext = {
        client: createRelayClient(),
        rows,
        mode,
        targetYear,
        targetSem,
        signal: abortRef.current.signal,
        onProgress: (d, t, message) => {
          setDone(d);
          setTotal(t);
          if (message) appendLog(message);
        },
      };

      const wrapped: UpdateTask[] = runnableTasks.map((task) => ({
        ...task,
        run: async (inner: TaskContext) => {
          setTaskStates((current) => ({ ...current, [task.id]: "running" }));
          try {
            const result = await task.run(inner);
            setTaskStates((current) => ({ ...current, [task.id]: "done" }));
            return result;
          } catch (err) {
            setTaskStates((current) => ({ ...current, [task.id]: "error" }));
            throw err;
          }
        },
      }));

      await runTasks(wrapped, ctx);
      setFinished(true);
      appendLog("✔ 全部任务完成");
      toast.success("更新流水线完成 ✓");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`执行失败：${message}`);
      appendLog(`✘ 执行失败：${message}`);
      toast.error(`执行失败：${message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 1 · 上传学期时间表</div>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={running}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            表类型
            <select
              value={mode}
              disabled={running}
              onChange={(event) => setMode(event.target.value as ScheduleMode)}
            >
              <option value="add-drop">Add/Drop</option>
              <option value="pre-enrollment">Pre-enrollment</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            年份
            <input
              type="number"
              className="w-20 rounded border px-1"
              value={targetYear}
              disabled={running}
              onChange={(event) => setTargetYear(Number(event.target.value))}
            />
          </label>
          <label className="flex items-center gap-1">
            学期
            <input
              type="number"
              className="w-16 rounded border px-1"
              value={targetSem}
              disabled={running}
              onChange={(event) => setTargetSem(Number(event.target.value))}
            />
          </label>
          <span className={rows.length === 0 ? "font-medium text-amber-600" : "font-medium text-green-700"}>
            {rows.length === 0 ? "尚未解析（请先选择 Excel 文件）" : `已解析 ${rows.length} 行 ✓`}
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 2 · 选择任务</div>
        <div className="flex flex-col gap-2 text-sm">
          {availableTasks.map((task) => {
            const state = taskStates[task.id];
            const badge = taskBadge(state);
            return (
              <label key={task.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(task.id)}
                  disabled={running}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                    )
                  }
                />
                <code className="text-xs text-gray-700">{task.id}</code>
                <span className="text-xs text-gray-500">{task.label}</span>
                {state ? (
                  <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
            disabled={running || rows.length === 0}
            onClick={() => void run()}
          >
            {running ? "运行中…" : rows.length === 0 ? "请先上传 Excel" : "开始执行"}
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={!running}
            onClick={() => abortRef.current?.abort()}
          >
            取消
          </button>
          {running ? (
            <span className="text-xs font-medium text-blue-600">运行中…（进度见下方 Step 3）</span>
          ) : error ? (
            <span className="text-xs font-medium text-red-600">执行失败</span>
          ) : finished ? (
            <span className="text-xs font-medium text-green-700">已完成 ✓</span>
          ) : rows.length === 0 ? (
            <span className="text-xs text-gray-500">等待上传 Excel</span>
          ) : (
            <span className="text-xs text-gray-500">就绪，共 {rows.length} 行</span>
          )}
        </div>

        {error ? (
          <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
      </div>

      <div className="rounded-lg border p-4" ref={logRef}>
        <div className="mb-2 font-semibold">Step 3 · 进度</div>
        <div className="mb-1 h-2 w-full overflow-hidden rounded bg-gray-200">
          <div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${overallPercent}%` }} />
        </div>
        <div className="mb-3 text-xs text-gray-500">
          {overallPercent}% · 已完成 {completedCount}/{runnableTasks.length} 个任务
          {total > 0 ? ` · 当前任务 ${done}/${total}` : ""}
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">
          {log.length
            ? log.map((line) => `${line.at}  ${line.text}`).join("\n")
            : "（尚无日志——上传 Excel 后点「开始执行」，这里会逐条显示进度）"}
        </pre>
      </div>
    </div>
  );
}
