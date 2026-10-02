import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MasonryColumns } from "@/components/masonry-columns";

function setWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function setLanesSupport(supported: boolean): void {
  Object.defineProperty(window, "CSS", {
    configurable: true,
    writable: true,
    value: { supports: vi.fn(() => supported) },
  });
}

function cards(count: number): React.ReactElement[] {
  return Array.from({ length: count }, (_, index) => (
    <div key={`card-${index}`} data-card={index}>
      card {index}
    </div>
  ));
}

function laneContents(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll(":scope > div.flex")).map((lane) =>
    Array.from(lane.querySelectorAll("[data-card]")).map(
      (card) => card.getAttribute("data-card") ?? "",
    ),
  );
}

beforeEach(() => {
  setWidth(1400);
  setLanesSupport(false);
});

afterEach(() => {
  cleanup();
});

describe("MasonryColumns", () => {
  it("renders the plain list on the server so hydration matches the grid", () => {
    const html = renderToStaticMarkup(
      <MasonryColumns col={3}>{cards(6)}</MasonryColumns>,
    );

    expect(html).toContain('data-card="0"');
    expect(html).toContain('data-card="5"');
    expect(html).not.toContain('class="flex flex-col gap-4"');
  });

  it("groups the cards round-robin when native lanes are unavailable", () => {
    const { container } = render(<MasonryColumns col={3}>{cards(7)}</MasonryColumns>);

    expect(laneContents(container)).toEqual([
      ["0", "3", "6"],
      ["1", "4"],
      ["2", "5"],
    ]);
  });

  it("uses two lanes below the xl breakpoint", () => {
    setWidth(900);
    const { container } = render(<MasonryColumns col={3}>{cards(5)}</MasonryColumns>);

    expect(laneContents(container)).toEqual([
      ["0", "2", "4"],
      ["1", "3"],
    ]);
  });

  it("stays a single list on small screens", () => {
    setWidth(500);
    const { container } = render(<MasonryColumns col={3}>{cards(4)}</MasonryColumns>);

    expect(laneContents(container)).toEqual([]);
    expect(Array.from(container.querySelectorAll("[data-card]")).map((c) => c.getAttribute("data-card"))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
  });

  it("leaves the list alone where the browser renders grid lanes itself", () => {
    setLanesSupport(true);
    const { container } = render(<MasonryColumns col={3}>{cards(4)}</MasonryColumns>);

    expect(laneContents(container)).toEqual([]);
    expect(container.querySelectorAll("[data-card]")).toHaveLength(4);
  });

  it("re-splits when the viewport crosses a breakpoint", async () => {
    const { container } = render(<MasonryColumns col={3}>{cards(6)}</MasonryColumns>);
    expect(laneContents(container)).toHaveLength(3);

    setWidth(900);
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(laneContents(container)).toEqual([
      ["0", "2", "4"],
      ["1", "3", "5"],
    ]);
  });
});
