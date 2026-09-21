import React from "react";
import { CatalogGridSkeleton } from "@/components/loading-skeletons";

export default function Loading() {
  return <CatalogGridSkeleton count={9} />;
}
