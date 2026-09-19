"use client";

import { useEffect, useRef } from "react";

type AdminInfiniteScrollProps = {
  canLoadMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
};

export default function AdminInfiniteScroll({
  canLoadMore,
  loading = false,
  onLoadMore,
}: AdminInfiniteScrollProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !canLoadMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, loading]);

  return (
    <div ref={targetRef} className="py-4 text-center text-xs text-gray-400">
      {loading ? "Loading..." : canLoadMore ? "Scroll to load more" : "No more results"}
    </div>
  );
}
