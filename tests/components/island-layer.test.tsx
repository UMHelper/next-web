// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadIslandMock, setNotifierMock, useThemeMock, usePathnameMock, notification } = vi.hoisted(() => ({
  loadIslandMock: vi.fn(),
  setNotifierMock: vi.fn(),
  useThemeMock: vi.fn(),
  usePathnameMock: vi.fn(),
  notification: { destroy: vi.fn() },
}));

vi.mock("@/lib/island-loader", () => ({ loadIsland: loadIslandMock }));
vi.mock("@/lib/notify", () => ({ setNotifier: setNotifierMock }));
vi.mock("next-themes", () => ({ useTheme: useThemeMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { IslandLayer } from "@/components/island-layer";
import { SKIN_STORAGE_KEY, setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const fakeLib = {
  Notification: notification,
  BackTop: () => React.createElement("div", { "data-testid": "backtop" }),
  Background: () => React.createElement("div", { "data-testid": "background" }),
};

function setViewport(wide: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

async function mount() {
  const view = render(React.createElement(IslandLayer));
  await act(async () => {});
  return view;
}

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  loadIslandMock.mockResolvedValue(fakeLib);
  usePathnameMock.mockReturnValue("/");
  useThemeMock.mockReturnValue({ resolvedTheme: "light" });
  setViewport(true);
  document.body.className = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("IslandLayer", () => {
  it("does nothing on the default skin — the library is never imported", async () => {
    const view = await mount();
    expect(loadIslandMock).not.toHaveBeenCalled();
    expect(view.container.innerHTML).toBe("");
    expect(document.body.classList.contains("animal-cursor")).toBe(false);
  });

  it("loads the library on island: cursor classes, notifier and BackTop", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = await mount();
    expect(loadIslandMock).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains("animal-cursor")).toBe(true);
    expect(document.body.classList.contains("animal-cursor--force")).toBe(true);
    expect(setNotifierMock).toHaveBeenCalledWith(notification);
    expect(view.queryByTestId("backtop")).not.toBeNull();
  });

  it("tears everything down when switching back to default", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = await mount();
    await act(async () => setSkin("default"));
    expect(document.body.classList.contains("animal-cursor")).toBe(false);
    expect(document.body.classList.contains("animal-cursor--force")).toBe(false);
    expect(setNotifierMock).toHaveBeenLastCalledWith(null);
    expect(notification.destroy).toHaveBeenCalled();
    expect(view.queryByTestId("backtop")).toBeNull();
  });

  it("stays inactive on /admin even when island is chosen", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    usePathnameMock.mockReturnValue("/admin/update");
    await mount();
    expect(loadIslandMock).not.toHaveBeenCalled();
  });

  it.each([
    ["light", true, true],
    ["dark", true, false],
    ["light", false, false],
  ])("background: theme=%s wide=%s → rendered=%s", async (theme, wide, shown) => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    useThemeMock.mockReturnValue({ resolvedTheme: theme });
    setViewport(wide);
    const view = await mount();
    expect(view.queryByTestId("background") !== null).toBe(shown);
  });

  it("survives a failed library load", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    loadIslandMock.mockRejectedValue(new Error("chunk failed"));
    const view = await mount();
    expect(view.container.innerHTML).toBe("");
    expect(setNotifierMock).not.toHaveBeenCalled();
  });
});
