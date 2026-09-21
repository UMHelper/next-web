import { formatRpcError } from "@/lib/update/errors";
import { buildApplySchedulePayload } from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";

function makeScheduleTask(id: string, label: string, scope: "time_location" | "prof_course" | "offer"): UpdateTask {
  return {
    id,
    label,
    modes: ["add-drop"],
    async run(ctx) {
      const payload = buildApplySchedulePayload(ctx.rows, ctx.targetYear, ctx.targetSem);
      const { data, error } = await ctx.client.rpc("admin_apply_schedule", { payload, scope });
      if (error) throw new Error(formatRpcError(error));
      return `${scope}: ${JSON.stringify(data)}`;
    },
  };
}

export const addTimeLocation = makeScheduleTask("add-time-location", "补齐 time_location", "time_location");
export const addProfCourse = makeScheduleTask("add-prof-course", "补齐 prof_with_course", "prof_course");
export const addOfferSchedule = makeScheduleTask("add-offer-schedule", "写入 offer + schedule", "offer");
