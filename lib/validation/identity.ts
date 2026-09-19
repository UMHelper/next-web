import { z } from "zod";

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);

export const clerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9_-]+$/);

export const identityIdSchema = z.union([clerkUserIdSchema, uuidSchema]);
export const commentIdSchema = z.coerce.number().int().positive();

export type IdentityId = z.infer<typeof identityIdSchema>;
