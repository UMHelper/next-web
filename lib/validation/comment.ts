import { z } from "zod";

const scoreSchema = z.coerce.number().finite().min(1).max(5);

// New catalog codes include three-letter prefixes with a section suffix, for
// example TLL1002C, in addition to the classic four-letter form (ACCT1000).
export const courseCodeSchema = z.string().regex(/^[A-Z]{3,5}\d{3,4}[A-Z]?$/);
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
