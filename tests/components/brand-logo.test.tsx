import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 同 Task 3：mock 工厂先于 import 执行，工厂内必须动态 import react
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(
        "a",
        { href: href as string, ...props },
        children as React.ReactNode,
      ),
  };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: () => ({ activePlan: null }),
}));

import NavbarList from "@/components/navbar-list";
import Footer from "@/components/footer";

afterEach(() => cleanup());

describe("brand logo", () => {
  it("drives the cat icon from the brand-logo token", () => {
    const view = render(React.createElement(NavbarList));
    const svg = view.container.querySelector("svg");

    expect(svg?.getAttribute("class")).toContain("text-brand-logo");
    expect(svg?.getAttribute("color")).toBeNull();
  });

  it("uses wordmark gradient tokens in the navbar", () => {
    const view = render(React.createElement(NavbarList));
    const wordmark = view.container.querySelector(".bg-clip-text");

    const className = wordmark?.getAttribute("class") ?? "";
    expect(className).toContain("from-wordmark-from");
    expect(className).toContain("to-wordmark-to");
    expect(className).not.toContain("from-sky-500");
  });

  it("uses the same tokens in the footer", async () => {
    const html = renderToStaticMarkup(await Footer());

    expect(html).toMatch(/<svg[^>]*class="[^"]*text-brand-logo/);
    expect(html).toContain("from-wordmark-from");
    expect(html).toContain("to-wordmark-to");
  });
});
