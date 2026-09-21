import React from "react";
import { CourseGridSkeleton, ProfessorHeaderSkeleton } from "@/components/loading-skeletons";

export default function Loading() {
  return (
    <>
      <ProfessorHeaderSkeleton />
      <CourseGridSkeleton count={6} />
    </>
  );
}
