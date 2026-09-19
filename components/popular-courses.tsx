import React from "react";
import { MessageSquare, Star } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { PopularCourseRow } from "@/lib/database/types";

type PopularCoursesProps = {
  courses: PopularCourseRow[];
};

export function PopularCourses({ courses }: PopularCoursesProps) {
  if (courses.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No recent activity yet.
      </Card>
    );
  }

  return (
    <ol className="space-y-3">
      {courses.map((course, index) => (
        <li key={course.courseCode}>
          <Link href={`/course/${course.courseCode}`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md dark:bg-gray-800">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {course.courseCode}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {course.courseTitleEng}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{course.offeringUnit}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {course.commentCount} comments in 30 days
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" />
                    {course.avgResult > 0 ? course.avgResult.toFixed(1) : "N/A"}
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ol>
  );
}
