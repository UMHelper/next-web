import type { TaskContext, UpdateTask } from "@/lib/update/task-types";

export async function runTasks(tasks: UpdateTask[], ctx: TaskContext): Promise<string[]> {
  const results: string[] = [];

  for (const task of tasks) {
    if (ctx.signal.aborted) throw new Error("aborted");
    ctx.onProgress(0, 1, `▶ ${task.label}`);
    const result = await task.run(ctx);
    results.push(result);
    ctx.onProgress(1, 1, `✔ ${task.label}`);
  }

  return results;
}
