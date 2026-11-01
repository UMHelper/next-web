"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CatalogFilter } from "@/lib/assistant/catalog-result-sets";

type CatalogFilterStore = {
  filters: Readonly<Record<string, CatalogFilter>>;
  setFilter(id: string, filter: CatalogFilter): void;
  reset(): void;
};

const CatalogFilterContext = createContext<CatalogFilterStore | null>(null);

export function CatalogFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Record<string, CatalogFilter>>({});

  const setFilter = useCallback((id: string, filter: CatalogFilter) => {
    setFilters((previous) => ({ ...previous, [id]: filter }));
  }, []);

  const reset = useCallback(() => {
    setFilters({});
  }, []);

  const value = useMemo(
    () => ({ filters, setFilter, reset }),
    [filters, setFilter, reset],
  );

  return (
    <CatalogFilterContext.Provider value={value}>{children}</CatalogFilterContext.Provider>
  );
}

export function useCatalogFilterStore(): CatalogFilterStore | null {
  return useContext(CatalogFilterContext);
}

export function useCatalogFilter(
  resultSetId: string | undefined,
): [CatalogFilter, (next: CatalogFilter) => void] {
  const store = useCatalogFilterStore();
  const [localFilter, setLocalFilter] = useState<CatalogFilter>("all");

  const usesStore =
    store !== null && typeof resultSetId === "string" && resultSetId.length > 0;

  const filter = usesStore ? (store.filters[resultSetId] ?? "all") : localFilter;

  const setFilter = useCallback(
    (next: CatalogFilter) => {
      if (usesStore && store && resultSetId) {
        store.setFilter(resultSetId, next);
      } else {
        setLocalFilter(next);
      }
    },
    [usesStore, store, resultSetId],
  );

  return [filter, setFilter];
}

export function catalogResultsElementId(resultSetId: string): string {
  return `catalog-results-${resultSetId}`;
}
