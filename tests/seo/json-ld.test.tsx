import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "@/components/seo/json-ld";

describe("JsonLd", () => {
  it("serializes schema data", () => {
    const html = renderToStaticMarkup(
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "What2Reg" }} />,
    );
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"WebSite"');
  });
});
