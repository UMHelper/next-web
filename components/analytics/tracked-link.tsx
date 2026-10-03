"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { trackSelectItem, type ItemListName } from "@/lib/analytics/events";

type TrackedItemLinkProps = {
  href: string;
  children: ReactNode;
  itemId: string;
  listName: ItemListName;
  /** 该条目在列表数组里的下标；广告位不占号。 */
  position: number;
  faculty?: string;
};

/**
 * 列表卡片的链接叶子：点击时上报 `select_item`，然后放行 next/link 的默认导航。
 *
 * 只接收可序列化 props（数据，不是回调）：调用方 CourseCard / ProfCard 是
 * server component，React Server Component 边界不允许把函数当 prop 传过来。
 */
export function TrackedItemLink({
  href,
  children,
  itemId,
  listName,
  position,
  faculty,
}: TrackedItemLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        // dev 下 emit() 遇到形状不对的上报会直接抛错；埋点绝不能挡住导航，
        // 所以这里兜住并留一行日志（静默吞掉会让问题更难查）。lib/analytics/* 不吞错。
        try {
          trackSelectItem({ itemId, listName, position, faculty });
        } catch (error) {
          console.error("[analytics]", error);
        }
      }}
    >
      {children}
    </Link>
  );
}
