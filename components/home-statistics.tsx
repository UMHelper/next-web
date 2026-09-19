import React from "react";
import { FacultyStatistics } from "@/components/faculty-statistics";
import { PopularCourses } from "@/components/popular-courses";
import { getPopularCourses } from "@/lib/database/get-popular-courses";
import { getStatistics } from "@/lib/database/get-statistics";

export default async function HomeStatistics() {
  const [statistics, popularCourses] = await Promise.all([
    getStatistics(),
    getPopularCourses(),
  ]);

  return (
    <section className="mx-auto max-w-screen-xl p-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Course Statistics</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Faculty coverage and the most discussed courses in the last 30 days.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="order-2 lg:order-1">
          <h3 className="mb-4 text-lg font-semibold">By Faculty</h3>
          <FacultyStatistics statistics={statistics} />
        </div>

        <div className="order-1 lg:order-2">
          <h3 className="mb-4 text-lg font-semibold">Trending in 30 Days</h3>
          <PopularCourses courses={popularCourses} />
        </div>
      </div>
    </section>
  );
}
