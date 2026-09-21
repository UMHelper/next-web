import { formatRpcError } from "@/lib/update/errors";
import type { UpdateTask } from "@/lib/update/task-types";

export const resetOffered: UpdateTask = {
  id: "reset-offered",
  label: "重置所有 Is_Offered = 0",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const { data, error } = await ctx.client.rpc("admin_reset_offered");
    if (error) throw new Error(formatRpcError(error));
    ctx.onProgress(1, 1, `reset: ${JSON.stringify(data)}`);
    return `reset: ${JSON.stringify(data)}`;
  },
};
