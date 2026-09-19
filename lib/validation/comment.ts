import { z } from "zod";

const scoreSchema = z.coerce.number().finite().min(1).max(5);

export const courseCodeSchema = z.string().regex(/^[A-Z]{4}\d{4}$/);
export const professorNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "professor name contains control characters");

export const commentSubmissionSchema = z
  .object({
    attendance: scoreSchema,
    pre: scoreSchema,
    grade: scoreSchema,
    hard: scoreSchema,
    reward: scoreSchema,
    assignment: scoreSchema,
    recommend: scoreSchema,
    content: z.string().trim().min(1).max(2000),
  })
  .strict();

export type CommentSubmission = z.infer<typeof commentSubmissionSchema>;
