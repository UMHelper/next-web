import React from "react";

import { JsonLd } from "@/components/seo/json-ld";

export function CourseJsonLd({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description?: string | null;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Course",
        name: title,
        courseCode: code,
        description: description ?? undefined,
        provider: { "@type": "CollegeOrUniversity", name: "University of Macau" },
      }}
    />
  );
}
