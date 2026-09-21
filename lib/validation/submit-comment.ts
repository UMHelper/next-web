import * as z from "zod";

export const submitCommentSchema = z.object({
  code: z.string().length(8),
  prof: z.string().min(1),
  attendance: z.enum(["1", "3", "5"]).default("3"),
  pre: z.enum(["1", "3", "5"]).default("3"),
  grade: z.number().min(1).max(5),
  hard: z.number().min(1).max(5),
  reward: z.number().min(1).max(5),
  assignment: z.number().min(1).max(5),
  recommend: z.number().min(1).max(5),
  content: z.string().min(10).max(2000),
});

export type SubmitCommentValues = z.infer<typeof submitCommentSchema>;
