import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Masonry } from "@/components/masonry";

describe("Masonry", () => {
  it("renders children into the server HTML", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Masonry,
        { col: 3 },
        React.createElement("div", null, "alpha"),
        React.createElement("div", null, "beta"),
      ),
    );

    expect(html).toContain("alpha");
    expect(html).toContain("beta");
    expect(html).toContain("grid-cols-1 md:grid-cols-2 xl:grid-cols-3");
  });
});
