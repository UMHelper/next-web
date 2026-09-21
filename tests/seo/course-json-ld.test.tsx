import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseJsonLd } from "@/components/seo/course-json-ld";

describe("CourseJsonLd", () => {
  it("renders a Course JSON-LD payload", () => {
    const html = renderToStaticMarkup(
      <CourseJsonLd
        code="ACCT1000"
        title="Financial Accounting"
        description="Introductory accounting."
      />
    );
    expect(html).toContain('"@type":"Course"');
    expect(html).toContain('"courseCode":"ACCT1000"');
  });
});
