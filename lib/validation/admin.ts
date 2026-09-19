import { z } from "zod";

export const adminGrantSchema = z.object({
  clerk_user_id: z.string().regex(/^user_[A-Za-z0-9_-]+$/),
});

export const reportUpdateSchema = z
  .object({
    status: z.enum(["open", "resolved", "dismissed"]).optional(),
    admin_note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.admin_note !== undefined, {
    message: "at least one field is required",
  });

export const commentUpdateSchema = z
  .object({
    content: z.string().trim().min(1).max(5000).optional(),
    content_en: z.string().trim().max(5000).nullable().optional(),
    img: z.string().trim().max(2000).nullable().optional(),
    hidden: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no fields to update" });

export const courseUpdateSchema = z
  .object({
    courseTitleEng: z.string().trim().min(1).max(200).optional(),
    courseTitleChi: z.string().trim().max(200).nullable().optional(),
    Credits: z.string().trim().max(50).optional(),
    Course_Duration: z.string().trim().max(100).optional(),
    Medium_of_Instruction: z.string().trim().max(100).optional(),
    Is_Offered: z.union([z.literal(0), z.literal(1)]).optional(),
    offeringProgLevel: z.string().trim().max(100).nullable().optional(),
    courseType: z.string().trim().max(100).nullable().optional(),
    suggestedYearOfStudy: z.coerce.number().int().min(0).max(20).nullable().optional(),
    gradingSystem: z.string().trim().max(100).nullable().optional(),
    courseDescription: z.string().trim().max(10000).nullable().optional(),
    ilo: z.string().trim().max(10000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no fields to update" });

export const profWithCourseUpdateSchema = z
  .object({
    is_offered: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no fields to update" });

export const syncUmSchema = z
  .object({
    mode: z.enum(["missing", "all", "code"]).default("missing"),
    code: z.string().trim().regex(/^[A-Z]{4}\d{4}$/).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "code" && !value.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "code is required when mode is code",
      });
    }
  });
