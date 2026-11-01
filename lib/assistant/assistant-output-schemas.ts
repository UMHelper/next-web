import { z } from "zod/v4";

import {
  courseInstructorSummarySchema,
  getCourseOutputSchema,
  getCourseSectionsOutputSchema,
  getInstructorOutputSchema,
  instructorCourseSummarySchema,
} from "@/lib/mcp/schemas";

export const assistantCourseSectionsOutputSchema = getCourseSectionsOutputSchema.extend({
  sectionDataComplete: z.boolean().default(true),
  term: z.object({ year: z.number().int(), sem: z.number().int() }).optional(),
});

export type AssistantCourseSectionsOutput = z.infer<typeof assistantCourseSectionsOutputSchema>;

const sampleSizeSchema = z.enum(["none", "small", "adequate"]);

const ratingScaleSchema = z.object({
  result: z.string(),
  grade: z.string(),
  difficulty: z.string(),
  reward: z.string(),
  attendance: z.string(),
});

const assistantCourseInstructorSummarySchema = courseInstructorSummarySchema.extend({
  sampleSize: sampleSizeSchema,
});

export const assistantGetCourseOutputSchema = getCourseOutputSchema.extend({
  ratingScale: ratingScaleSchema,
  notAvailableOnSite: z.array(z.string()),
  instructors: z.array(assistantCourseInstructorSummarySchema).max(20),
});

export type AssistantCourseOutput = z.infer<typeof assistantGetCourseOutputSchema>;

const assistantInstructorCourseSummarySchema = instructorCourseSummarySchema.extend({
  sampleSize: sampleSizeSchema,
});

export const assistantGetInstructorOutputSchema = getInstructorOutputSchema.extend({
  ratingScale: ratingScaleSchema,
  courses: z.array(assistantInstructorCourseSummarySchema).max(20),
});

export type AssistantInstructorOutput = z.infer<typeof assistantGetInstructorOutputSchema>;
