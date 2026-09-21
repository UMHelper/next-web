import { z } from "zod";

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);

export const clerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9_-]+$/);

export const identityIdSchema = z.union([clerkUserIdSchema, uuidSchema]);
export const commentIdSchema = z.coerce.number().int().positive();

export type IdentityId = z.infer<typeof identityIdSchema>;

/**
 * `user_...`(Clerk 账号)才是认证身份;iOS 本机匿名 UUID 只代表设备,
 * 不应获得认证徽章。评论/回复的 `verify` 字段以此为准。
 */
export function isVerifiedIdentityId(id: string) {
  return clerkUserIdSchema.safeParse(id).success;
}
