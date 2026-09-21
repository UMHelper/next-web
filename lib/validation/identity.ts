import { z } from "zod";

/** 标准 UUID(v1–v5)的字符模式,供 uuidSchema 与 iosDeviceIdSchema 共用。 */
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

export const uuidSchema = z.string().regex(new RegExp(`^${UUID_PATTERN}$`));

export const clerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9_-]+$/);

/**
 * iOS 客户端 `AppIdentity.userID` 的持久化格式:`ios_` + UUID。
 * 已安装的客户端存的就是这个值,服务端必须接受,否则写接口会 400。
 */
export const iosDeviceIdSchema = z.string().regex(new RegExp(`^ios_${UUID_PATTERN}$`));

export const identityIdSchema = z.union([clerkUserIdSchema, uuidSchema, iosDeviceIdSchema]);
export const commentIdSchema = z.coerce.number().int().positive();

export type IdentityId = z.infer<typeof identityIdSchema>;

/**
 * `user_...`(Clerk 账号)才是认证身份;iOS 本机匿名 UUID 只代表设备,
 * 不应获得认证徽章。评论/回复的 `verify` 字段以此为准。
 */
export function isVerifiedIdentityId(id: string) {
  return clerkUserIdSchema.safeParse(id).success;
}
