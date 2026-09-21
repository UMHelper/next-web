import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function GridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-4 p-4">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <GridSkeleton count={6} className="pt-4" />
    </div>
  );
}

export function HomeSearchSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-3 p-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-36" />
      </div>
    </div>
  );
}

export function HomeStatisticsSkeleton() {
  return (
    <section className="mx-auto max-w-screen-xl p-4 py-8">
      <Skeleton className="mx-auto h-8 w-56 max-w-full" />
      <Skeleton className="mx-auto mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </section>
  );
}

export function CatalogGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <GridSkeleton count={count} />
    </div>
  );
}

export function CourseHeaderSkeleton() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-500 p-3">
      <div className="mx-auto flex max-w-screen-xl flex-col justify-between gap-6 p-4 md:flex-row">
        <div className="space-y-3 py-6">
          <Skeleton className="h-4 w-24 bg-white/30" />
          <Skeleton className="h-9 w-52 bg-white/30" />
          <Skeleton className="h-6 w-72 max-w-full bg-white/25" />
          <Skeleton className="h-4 w-60 max-w-full bg-white/20" />
          <div className="flex gap-3 pt-3">
            <Skeleton className="h-10 w-32 bg-white/25" />
            <Skeleton className="h-10 w-36 bg-white/25" />
          </div>
        </div>
        <Skeleton className="h-56 w-full rounded-xl bg-white/20 md:w-80" />
      </div>
    </div>
  );
}

export function CourseGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mx-auto max-w-screen-xl p-4">
      <GridSkeleton count={count} />
    </div>
  );
}

export function ProfessorHeaderSkeleton() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-500 p-3">
      <div className="mx-auto max-w-screen-xl p-4">
        <Skeleton className="h-9 w-2/3 max-w-full bg-white/30" />
      </div>
    </div>
  );
}

export function ReviewHeaderSkeleton() {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-500 p-6">
      <div className="mx-auto flex max-w-screen-xl flex-col justify-between gap-6 p-4 md:flex-row">
        <div className="space-y-3 py-3">
          <Skeleton className="h-4 w-24 bg-white/30" />
          <Skeleton className="h-6 w-28 bg-white/30" />
          <Skeleton className="h-5 w-64 max-w-full bg-white/25" />
          <Skeleton className="h-4 w-52 max-w-full bg-white/20" />
          <Skeleton className="h-10 w-72 max-w-full bg-white/30" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-36 bg-white/25" />
            <Skeleton className="h-10 w-32 bg-white/25" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-xl bg-white/20 md:w-80" />
      </div>
    </div>
  );
}

export function ReviewCommentsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mx-auto max-w-screen-xl p-4">
      <GridSkeleton count={count} />
      <div className="mt-6 flex justify-center gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

export function AdminTableSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b">
            {Array.from({ length: columns }).map((_, index) => (
              <th key={index} className="p-3">
                <Skeleton className="h-4 w-24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-0">
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <td key={columnIndex} className="p-3">
                  <Skeleton className="h-4 w-full max-w-32" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminTableRowsSkeleton({ columns = 6, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b last:border-0">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="p-3">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CompareTimetableSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}
