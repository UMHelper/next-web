import { z } from "zod";
import { REACTION_EMOJI_LIST } from "@/lib/consant";

const reactionEmojiSchema = z.enum(REACTION_EMOJI_LIST as [string, ...string[]]);

export const voteSubmissionSchema = z
  .object({
    comment: z.coerce.number().int().positive(),
    offset: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    emoji: reactionEmojiSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.offset === 0 && !value.emoji) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emoji"],
        message: "emoji is required when offset is 0",
      });
    }
    if (value.offset !== 0 && value.emoji) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emoji"],
        message: "emoji is only allowed when offset is 0",
      });
    }
  });

export type VoteSubmission = z.infer<typeof voteSubmissionSchema>;
