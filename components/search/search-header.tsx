"use client";

import { usePathname } from "next/navigation";

import SearchForm from "@/components/search/search-form";

export default function SearchHeader() {
  const pathname = usePathname();
  const parts = pathname.split("/");
  const isInstructor = parts[2] === "instructor";
  const defaultCode = decodeURI(parts.slice(3).join("/"))
    .toUpperCase()
    .replaceAll("%20", " ")
    .replaceAll("$", "/");

  return (
    <SearchForm
      variant="header"
      defaultCode={defaultCode}
      defaultMode={isInstructor ? "instructor" : "course"}
    />
  );
}
