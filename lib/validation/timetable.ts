import { z } from "zod";
import { planPayloadSchema } from "@/lib/timetable/schema";

export const createPlanSchema = z.object({
  clientRef: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  year: z.number().int().min(2000).max(2100),
  sem: z.number().int().min(1).max(3),
  payload: planPayloadSchema,
});

export const updatePlanSchema = z
  .object({
    baseRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(80).optional(),
    payload: planPayloadSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.payload !== undefined, {
    message: "At least one of name or payload is required",
  });

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
