"use client";

import { useCallback, useEffect, useState } from "react";

import {
  searchCatalog,
  type CatalogCourse,
  type CatalogInstructor,
} from "@/lib/timetable/catalog-client";

export const useCatalogSearch = (query: {
  type: "course" | "instructor";
  q: string;
  faculty: string;
  department: string;
}) => {
  const [items, setItems] = useState<Array<CatalogCourse | CatalogInstructor>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async (page: number, append: boolean, signal?: AbortSignal) => {
      if (!query.q && !query.faculty && !query.department) {
        setItems([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await searchCatalog({
          type: query.type,
          q: query.q,
          faculty: query.faculty,
          department: query.department,
          page,
        });
        if (signal?.aborted) return;
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setTotal(result.total);
      } catch (searchError) {
        if (signal?.aborted) return;
        setError(searchError instanceof Error ? searchError.message : "Search failed");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query.department, query.faculty, query.q, query.type],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(1, false, controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return {
    items,
    loading,
    error,
    total,
    loadMore: (page: number) => load(page, true),
  };
};
