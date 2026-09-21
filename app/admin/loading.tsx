import React from "react";
import { AdminTableSkeleton } from "@/components/loading-skeletons";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-9 w-56 animate-pulse rounded bg-muted" />
      </div>
      <AdminTableSkeleton columns={6} rows={8} />
    </div>
  );
}
