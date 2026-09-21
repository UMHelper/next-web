import { describe, expect, it } from "vitest";
import { runTasks } from "@/lib/update/runner";
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";

const ctx = { signal: new AbortController().signal, onProgress: () => {} } as unknown as TaskContext;

function task(id: string, log: string[]): UpdateTask {
  return { id, label: id, modes: ["add-drop"], run: async () => { log.push(id); return id; } };
}

function failingTask(id: string): UpdateTask {
  return { id, label: id, modes: ["add-drop"], run: async () => { throw new Error("nope"); } };
}

describe("runTasks", () => {
  it("runs sequentially and stops on failure", async () => {
    const log: string[] = [];
    const tasks = [task("a", log), failingTask("b"), task("c", log)];

    await expect(runTasks(tasks, ctx)).rejects.toThrow("nope");
    expect(log).toEqual(["a"]);
  });
});
