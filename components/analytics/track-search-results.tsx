"use client";

import { useEffect, useRef } from "react";

import { trackSearchResults, type SearchScope } from "@/lib/analytics/events";

type TrackSearchResultsProps = {
  term: string;
  scope: SearchScope;
  resultCount: number;
};

/**
 * 搜索结果页的"结果已展示"上报点。挂在服务端拿到的结果数组旁边即可，
 * 只接收可序列化 props（讲师搜索页是 server component）。
 *
 * `resultCount` 后续变化（例如客户端筛选）不会重复上报：口径是"这次搜索返回了多少条"。
 */
export function TrackSearchResults({ term, scope, resultCount }: TrackSearchResultsProps) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackSearchResults({ term, scope, resultCount });
  }, [term, scope, resultCount]);

  return null;
}
