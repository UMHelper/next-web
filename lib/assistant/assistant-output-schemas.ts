import { z } from "zod/v4";

import { getCourseSectionsOutputSchema } from "@/lib/mcp/schemas";

export const assistantCourseSectionsOutputSchema = getCourseSectionsOutputSchema.extend({
  sectionDataComplete: z.boolean().default(true),
  term: z.object({ year: z.number().int(), sem: z.number().int() }).optional(),
});

export type AssistantCourseSectionsOutput = z.infer<typeof assistantCourseSectionsOutputSchema>;
