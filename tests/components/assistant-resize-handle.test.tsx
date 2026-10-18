import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ResizeHandle, { PANEL_WIDTH_VAR } from "@/components/assistant/resize-handle";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const cssWidth = () => document.documentElement.style.getPropertyValue(PANEL_WIDTH_VAR);
let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
});

describe("ResizeHandle", () => {
  it("starts at 380 and exposes the width to assistive tech", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator", { name: "調整助手寬度" });
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    expect(handle.getAttribute("aria-valuemin")).toBe("320");
    expect(handle.getAttribute("aria-valuemax")).toBe("560");
    expect(cssWidth()).toBe("380px");
  });

  it("restores the stored width and clamps out-of-range values", () => {
    storage.setItem("umeh-assistant-width", "900");
    render(<ResizeHandle visible />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("560");
    expect(cssWidth()).toBe("560px");
  });

  it("widens with ArrowLeft and narrows with ArrowRight by 16px, within bounds", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("396");
    expect(storage.getItem("umeh-assistant-width")).toBe("396");
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("320");
  });

  it("resets to 380 on double-click", () => {
    storage.setItem("umeh-assistant-width", "500");
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    expect(storage.getItem("umeh-assistant-width")).toBe("380");
  });

  it("keeps the width variable but hides the handle while the panel is closed", () => {
    storage.setItem("umeh-assistant-width", "420");
    const { rerender } = render(<ResizeHandle visible />);
    rerender(<ResizeHandle visible={false} />);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(cssWidth()).toBe("420px");
  });

  it("re-clamps when the window shrinks and removes the variable on unmount", () => {
    storage.setItem("umeh-assistant-width", "560");
    const { unmount } = render(<ResizeHandle visible />);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
    expect(cssWidth()).toBe("544px");
    unmount();
    expect(cssWidth()).toBe("");
  });
});
