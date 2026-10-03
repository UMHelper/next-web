import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * dev 下 lib/analytics 的 emit() 遇到形状不对的上报是**直接抛错**的（有意为之：
 * 让问题在本地立刻暴露）。两个埋点叶子必须兜住这个错误，否则一次埋点失败会挡住
 * 课程卡导航、或把搜索结果页整棵子树渲染搞崩。这里把事件模块整个替换成必抛的版本，
 * 专门钉住这两条 try/catch。
 */
const trackSelectItem = vi.fn((..._args: unknown[]): void => {
  throw new Error("emit exploded");
});
const trackSearchResults = vi.fn((..._args: unknown[]): void => {
  throw new Error("emit exploded");
});

vi.mock("@/lib/analytics/events", () => ({
  trackSelectItem: (...args: unknown[]) => trackSelectItem(...args),
  trackSearchResults: (...args: unknown[]) => trackSearchResults(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { TrackedItemLink } from "@/components/analytics/tracked-link";
import { TrackSearchResults } from "@/components/analytics/track-search-results";

let error: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  error.mockRestore();
  cleanup();
  vi.clearAllMocks();
});

describe("analytics leaves resilience", () => {
  it("lets the link navigate even when the tracking call throws", () => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={0}>
        COMP1001
      </TrackedItemLink>,
    );

    // 抛错留在 onClick 里的话，React 会把它甩出事件处理函数（fireEvent 会直接炸）。
    expect(() => fireEvent.click(screen.getByRole("link"))).not.toThrow();

    expect(trackSelectItem).toHaveBeenCalledTimes(1);
    // 兜住不等于静默：日志里必须留下现场。
    expect(error).toHaveBeenCalledWith("[analytics]", expect.any(Error));
  });

  it("keeps the search results page rendering when the tracking call throws", () => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(<TrackSearchResults term="COMP1001" scope="course" resultCount={7} />),
    ).not.toThrow();

    expect(trackSearchResults).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[analytics]", expect.any(Error));
  });
});
