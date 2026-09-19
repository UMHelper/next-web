import type { CommentPageRow } from "@/lib/database/types";

/**
 * 已发布的 iOS 客户端把评论的 `verify_account` 当作必填字段解码。
 *
 * 新的 `get_comment_page_v2` RPC 出于隐私考虑不再返回原始 `verify_account`，
 * 只返回脱敏后的 `avatar_seed`（md5(verify_account)）。为兼容旧客户端，iOS 专用
 * GET 接口在每行评论上补一个同名 `verify_account` 字段，值复用 `avatar_seed`，
 * 既不泄露账号明文，也能让旧客户端正常解码。
 *
 * 后续 iOS 客户端改为解码 `avatar_seed`（或不再依赖该字段）后，可移除本兼容层。
 */
export function withIOSVerifyAccountCompat<T extends { avatar_seed?: string | null }>(
  row: T,
): T & { verify_account: string } {
  return { ...row, verify_account: row.avatar_seed ?? "" };
}

export type IOSCompatCommentRow = CommentPageRow & { verify_account: string };
