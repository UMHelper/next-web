"use client";

import { useAgent, useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { useMemo, useRef } from "react";

import {
  catalogResultsElementId,
  useCatalogFilterStore,
} from "@/components/assistant/catalog-filter-store";
import {
  CATALOG_RESULTS_CONTEXT_DESCRIPTION,
  collectCatalogResultSets,
  describeFilterScope,
  FILTER_CATALOG_RESULTS_DESCRIPTION,
  FILTER_CATALOG_RESULTS_TOOL_NAME,
  filterCatalogResultsParameters,
  parseFilterCatalogResult,
  runFilterCatalogResults,
  summarizeCatalogResultSets,
} from "@/lib/assistant/catalog-result-sets";

function scrollToCatalogResults(resultSetId: string) {
  document.getElementById(catalogResultsElementId(resultSetId))?.scrollIntoView?.({
    block: "start",
    behavior: "smooth",
  });
}

function CatalogFilterLoading() {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      Filtering results…
    </div>
  );
}

export function CatalogFilterToolResult({
  status,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
}) {
  if (status === "inProgress" || status === "executing") {
    return <CatalogFilterLoading />;
  }

  const parsed = parseFilterCatalogResult(result ?? "");

  if (!parsed || parsed.status === "invalid_request") {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t apply that filter.</p>;
  }

  if (parsed.status === "unknown_result_set") {
    return (
      <p className="text-sm text-muted-foreground">
        Those earlier results are no longer available. Search again to filter them.
      </p>
    );
  }

  const scopeText =
    parsed.filter === "all"
      ? `Showing all ${parsed.loadedCount} loaded courses.`
      : describeFilterScope({
          filter: parsed.filter,
          shown: parsed.shownCount,
          loaded: parsed.loadedCount,
          totalCount: parsed.totalCount,
          hasMore: parsed.hasMore,
        });

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>{scopeText}</p>
      <button
        type="button"
        className="inline-flex min-h-8 items-center rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => scrollToCatalogResults(parsed.resultSetId)}
      >
        Show results
      </button>
    </div>
  );
}

export function useCatalogResultsTool(): void {
  const { agent } = useAgent();
  const store = useCatalogFilterStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const contextValue = useMemo(
    () =>
      summarizeCatalogResultSets(
        collectCatalogResultSets(agent?.messages ?? []),
        store?.filters ?? {},
      ),
    [agent?.messages, store?.filters],
  );

  useAgentContext({ description: CATALOG_RESULTS_CONTEXT_DESCRIPTION, value: contextValue });

  useFrontendTool(
    {
      name: FILTER_CATALOG_RESULTS_TOOL_NAME,
      description: FILTER_CATALOG_RESULTS_DESCRIPTION,
      parameters: filterCatalogResultsParameters,
      handler: async (input, ctx) =>
        runFilterCatalogResults(
          input,
          ctx?.agent?.messages ?? [],
          storeRef.current?.setFilter ?? (() => {}),
        ),
      render: ({ status, result }) => (
        <CatalogFilterToolResult status={status} result={result} />
      ),
      followUp: true,
    },
    [],
  );
}
