import { z } from "zod";

export const REPORT_REASONS = {
  spam: "Spam / advertising",
  harassment: "Harassment / bullying",
  hate: "Hate speech",
  misinformation: "False information",
  privacy: "Privacy violation",
  other: "Other",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export const reportSubmissionSchema = z
  .object({
    targetType: z.literal("comment").default("comment"),
    targetId: z.coerce.number().int().positive(),
    reason: z.enum(["spam", "harassment", "hate", "misinformation", "privacy", "other"]),
    details: z.string().trim().max(1000).optional(),
    email: z.string().trim().max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === "other" && !value.details) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["details"],
        message: "details is required when reason is other",
      });
    }
  });

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;
