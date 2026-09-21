import React from "react";
import { ReviewCommentsSkeleton, ReviewHeaderSkeleton } from "@/components/loading-skeletons";

export default function Loading() {
  return (
    <>
      <ReviewHeaderSkeleton />
      <ReviewCommentsSkeleton count={6} />
    </>
  );
}
