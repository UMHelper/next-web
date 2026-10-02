import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Masonry } from "@/components/masonry";

function renderMasonry(col = 3): string {
  return renderToStaticMarkup(
    React.createElement(
      Masonry,
      { col },
      React.createElement("div", null, "alpha"),
      React.createElement("div", null, "beta"),
    ),
  );
}

describe("Masonry", () => {
  it("renders children into the server HTML", () => {
    const html = renderMasonry();

    expect(html).toContain("alpha");
    expect(html).toContain("beta");
    expect(html).toContain("grid-cols-1 md:grid-cols-2 xl:grid-cols-3");
  });

  it("carries the class that upgrades the grid to native lanes", () => {
    // `app/globals.css` turns this into `display: grid-lanes` for browsers that
    // support it (Safari 26.4+ today); everywhere else the grid stays as-is.
    expect(renderMasonry()).toContain("masonry-lanes");
  });

  it("keeps the plain grid as the fallback layout", () => {
    const html = renderMasonry(2);

    expect(html).toContain("grid");
    expect(html).toContain("items-start");
    expect(html).toContain("gap-4");
    expect(html).toContain("grid-cols-1 md:grid-cols-2");
  });
});
