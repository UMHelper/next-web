import React from "react";
import {
  BookMarked,
  Bot,
  CircleDollarSign,
  Microscope,
  Newspaper,
  School,
  Scale,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { FacultyStatisticRow } from "@/lib/database/types";

const FACULTY_ICONS = {
  FAH: Newspaper,
  FBA: CircleDollarSign,
  FED: School,
  FHS: Microscope,
  FLL: Scale,
  FSS: BookMarked,
  FST: Bot,
} as const;

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
        const Icon = FACULTY_ICONS[row.name as keyof typeof FACULTY_ICONS] ?? School;

        return (
          <Card
            key={row.id}
            className="flex flex-col items-center p-4 text-center dark:bg-gray-800"
          >
            <Icon size={56} strokeWidth={1.25} className="pb-3" />
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
