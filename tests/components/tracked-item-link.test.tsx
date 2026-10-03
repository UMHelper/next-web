import React from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { TrackedItemLink } from "@/components/analytics/tracked-link";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
  push.mockClear();
});

afterEach(() => {
  debug.mockRestore();
  cleanup();
});

describe("TrackedItemLink", () => {
  it("keeps the destination href untouched", () => {
    render(
      <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={2}>
        COMP1001
      </TrackedItemLink>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/course/COMP1001");
  });

  it("reports select_item with the list and position on click", () => {
    render(
      <TrackedItemLink
        href="/course/COMP1001"
        itemId="COMP1001"
        listName="catalog"
        position={2}
        faculty="FST"
      >
        COMP1001
      </TrackedItemLink>,
    );
    fireEvent.click(screen.getByRole("link"));

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "select_item",
        item_id: "COMP1001",
        item_list_name: "catalog",
        position: 2,
        faculty: "FST",
      },
    ]);
  });

  it("omits faculty when the caller does not have it", () => {
    render(
      <TrackedItemLink href="/reviews/COMP1001/CHAN" itemId="CHAN" listName="professor_courses" position={0}>
        CHAN
      </TrackedItemLink>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });

  it("does not block the default navigation", () => {
    render(
      <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={0}>
        COMP1001
      </TrackedItemLink>,
    );
    const link = screen.getByRole("link") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("reports once per click, not twice under StrictMode", () => {
    render(
      <React.StrictMode>
        <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={0}>
          COMP1001
        </TrackedItemLink>
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()).toHaveLength(1);
  });
});
