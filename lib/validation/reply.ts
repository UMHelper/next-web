import { z } from "zod";

export const replySubmissionSchema = z.object({
  replyto: z.coerce.number().int().positive(),
  content: z.string().trim().min(1).max(250),
});

export type ReplySubmission = z.infer<typeof replySubmissionSchema>;
