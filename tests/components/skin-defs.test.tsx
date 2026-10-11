import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SkinDefs } from "@/components/skin-defs";

describe("SkinDefs", () => {
  const html = renderToStaticMarkup(React.createElement(SkinDefs));

  it("renders an invisible svg that defines the modal clip path", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('id="island-modal-clip"');
    expect(html).toContain('clipPathUnits="objectBoundingBox"');
  });

  it("uses the same blob outline as the library modal", () => {
    expect(html).toContain("M0.501,0.005 L0.501,0.005 L0.523,0.005");
    expect(html).toContain("C-0.006,0.365,-0.002,0.254,0.024,0.17");
  });
});
