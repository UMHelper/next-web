import React, { Suspense } from "react";
import { FacultyStatistics } from "@/components/faculty-statistics";
import { PopularCourses } from "@/components/popular-courses";
import { Skeleton } from "@/components/ui/skeleton";
import { getPopularCourses } from "@/lib/database/get-popular-courses";
import { getStatistics } from "@/lib/database/get-statistics";

async function FacultyStatisticsSection() {
  const statistics = await getStatistics();
  return <FacultyStatistics statistics={statistics} />;
}

async function PopularCoursesSection() {
  const popularCourses = await getPopularCourses();
  return <PopularCourses courses={popularCourses} />;
}

export default function HomeStatistics() {
  return (
    <section className="mx-auto max-w-screen-xl p-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Course Statistics</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Faculty coverage and the most discussed courses in the last 30 days.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="order-2 min-w-0 lg:order-1">
          <h3 className="mb-4 text-lg font-semibold">By Faculty</h3>
          <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
            <FacultyStatisticsSection />
          </Suspense>
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <h3 className="mb-4 text-lg font-semibold">Trending in 30 Days</h3>
          <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
            <PopularCoursesSection />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
