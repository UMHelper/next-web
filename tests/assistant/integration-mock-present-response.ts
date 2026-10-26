import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

import {
  executePresentResponse,
  MAX_PRESENT_SHOW_ITEMS,
  type PresentationSlot,
} from "@/lib/assistant/presentation";

export function mockPresentResponseTool(presentation: PresentationSlot) {
  return defineTool({
    name: "present_response",
    description: "Choose what rich UI accompanies your reply",
    parameters: z.object({
      show: z
        .array(
          z.object({
            component: z.enum(["course_detail", "course_sections"]),
            course: z.string().max(40),
          }),
        )
        .max(MAX_PRESENT_SHOW_ITEMS)
        .optional(),
      catalog: z
        .object({
          mode: z.enum(["browse", "hidden"]),
          resultSetId: z.string().min(1).max(128).optional(),
        })
        .optional(),
      recommendations: z
        .object({
          courses: z.array(z.string().max(40)).max(5),
        })
        .optional(),
    }),
    execute: (args) => executePresentResponse(args, presentation.current),
  });
}
