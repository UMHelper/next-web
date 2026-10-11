import React from "react";
import Link from "next/link";

import { SkinIcon } from "@/components/skin-icon";
import { Card } from "@/components/ui/card";
import type { FacultyStatisticRow } from "@/lib/database/types";

type FacultyStatisticsProps = {
  statistics: FacultyStatisticRow[];
};

export function FacultyStatistics({ statistics }: FacultyStatisticsProps) {
  if (statistics.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Statistics are not available yet.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {statistics.map((row) => {
        return (
          <Card
            key={row.id}
            className="flex flex-col items-center p-4 text-center"
          >
            <SkinIcon name={row.name} size={56} strokeWidth={1.25} className="pb-3" />
            <Link
              href={`/catalog/${encodeURIComponent(row.name)}`}
              className="text-lg font-medium hover:underline"
            >
              {row.name}
            </Link>
            <div className="text-sm text-muted-foreground">
              {row.course_num} courses
            </div>
            <div className="text-sm text-muted-foreground">
              {row.comment_num} comments
            </div>
          </Card>
        );
      })}
    </div>
  );
}
