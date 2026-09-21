import { uniqueCourseCodes } from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";

export const setOffered: UpdateTask = {
  id: "set-offered",
  label: "批量标记 Is_Offered = 1",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const codes = uniqueCourseCodes(ctx.rows);
    const { data, error } = await ctx.client.rpc("admin_mark_offered", { codes });
    if (error) throw new Error(error.message);
    return `marked ${data} of ${codes.length}`;
  },
};
