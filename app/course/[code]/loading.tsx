import React from "react";
import { CourseGridSkeleton, CourseHeaderSkeleton } from "@/components/loading-skeletons";

export default function Loading() {
  return (
    <>
      <CourseHeaderSkeleton />
      <CourseGridSkeleton count={6} />
    </>
  );
}
