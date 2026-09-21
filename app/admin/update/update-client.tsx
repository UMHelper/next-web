"use client";

import React, { useMemo, useRef, useState } from "react";

import { parseScheduleWorkbook } from "@/lib/update/excel";
import { PIPELINE_STAGES } from "@/lib/update/pipeline";
import { createRelayClient } from "@/lib/update/relay-client";
import { runTasks } from "@/lib/update/runner";
import { UPDATE_TASKS } from "@/lib/update/tasks";
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";
import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";

const TASK_IDS = Object.keys(UPDATE_TASKS);

export default function UpdateClient() {
  const [mode, setMode] = useState<ScheduleMode>("add-drop");
  const [targetYear, setTargetYear] = useState(2026);
  const [targetSem, setTargetSem] = useState(1);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [selected, setSelected] = useState<string[]>(PIPELINE_STAGES.flatMap((stage) => stage.tasks));
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const availableTasks = useMemo(
    () => TASK_IDS.map((id) => UPDATE_TASKS[id]).filter((task) => task.modes.includes(mode)),
    [mode],
  );

  async function handleFile(file: File) {
    const data = await file.arrayBuffer();
    const parsed = parseScheduleWorkbook(data, { mode });
    setRows(parsed);
    setLog([`parsed ${parsed.length} rows (${mode})`]);
  }

  async function run() {
    setRunning(true);
    setLog((current) => [...current, `target ${targetYear}/${targetSem}`]);
    abortRef.current = new AbortController();

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
        if (message) setLog((current) => [...current.slice(-99), message]);
      },
    };

    const tasks = selected
      .map((id) => UPDATE_TASKS[id])
      .filter((task): task is UpdateTask => Boolean(task) && task.modes.includes(mode));

    try {
      await runTasks(tasks, ctx);
      setLog((current) => [...current, "✔ all tasks complete"]);
    } catch (error) {
      setLog((current) => [...current, `✘ ${error instanceof Error ? error.message : String(error)}`]);
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
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            表类型
            <select value={mode} onChange={(event) => setMode(event.target.value as ScheduleMode)}>
              <option value="add-drop">Add/Drop</option>
              <option value="pre-enrollment">Pre-enrollment</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            年份
            <input type="number" className="w-20 rounded border px-1" value={targetYear} onChange={(event) => setTargetYear(Number(event.target.value))} />
          </label>
          <label className="flex items-center gap-1">
            学期
            <input type="number" className="w-16 rounded border px-1" value={targetSem} onChange={(event) => setTargetSem(Number(event.target.value))} />
          </label>
          <span>已解析 {rows.length} 行</span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 2 · 选择任务</div>
        <div className="flex flex-wrap gap-3 text-sm">
          {availableTasks.map((task) => (
            <label key={task.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(task.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                  )
                }
              />
              {task.id}
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={running || rows.length === 0} onClick={() => void run()}>
            开始执行
          </button>
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!running} onClick={() => abortRef.current?.abort()}>
            取消
          </button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 3 · 进度 {total > 0 ? `${done}/${total}` : ""}</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{log.join("\n")}</pre>
      </div>
    </div>
  );
}
