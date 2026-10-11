// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadIslandMock } = vi.hoisted(() => ({ loadIslandMock: vi.fn() }));
vi.mock("@/lib/island-loader", () => ({ loadIsland: loadIslandMock }));

import { SkinRating } from "@/components/skin-rating";
import { setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const rateProps = vi.fn();
const fakeLib = {
  Rate: (props: Record<string, unknown>) => {
    rateProps(props);
    return React.createElement("div", { "data-testid": "island-rate" });
  },
};
const fallback = React.createElement("div", { "data-testid": "default-rating" });

async function mount(props: Partial<React.ComponentProps<typeof SkinRating>> = {}) {
  const view = render(
    <SkinRating value={4} {...props}>
      {fallback}
    </SkinRating>,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  installFakeStorage();
  loadIslandMock.mockResolvedValue(fakeLib);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("SkinRating", () => {
  it("renders the default rating under the default skin without loading the library", async () => {
    const { queryByTestId } = await mount();
    expect(queryByTestId("default-rating")).not.toBeNull();
    expect(queryByTestId("island-rate")).toBeNull();
    expect(loadIslandMock).not.toHaveBeenCalled();
  });

  it("swaps to the library Rate under the island skin and forwards value, readonly and size", async () => {
    setSkin("island");
    const { queryByTestId } = await mount({ readOnly: true, size: "middle" });
    expect(queryByTestId("island-rate")).not.toBeNull();
    expect(queryByTestId("default-rating")).toBeNull();
    expect(rateProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 4, readonly: true, size: "middle", allowClear: false }),
    );
  });
});
