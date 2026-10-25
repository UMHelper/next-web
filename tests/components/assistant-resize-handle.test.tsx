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
  it("starts at 450 and exposes the width to assistive tech", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator", { name: "Resize assistant" });
    expect(handle.getAttribute("aria-valuenow")).toBe("450");
    expect(handle.getAttribute("aria-valuemin")).toBe("380");
    expect(handle.getAttribute("aria-valuemax")).toBe("800");
    expect(cssWidth()).toBe("450px");
  });

  it("restores the stored width and clamps out-of-range values", () => {
    storage.setItem("umeh-assistant-width", "900");
    render(<ResizeHandle visible />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("800");
    expect(cssWidth()).toBe("800px");
  });

  it("widens with ArrowLeft and narrows with ArrowRight by 16px, within bounds", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("466");
    expect(storage.getItem("umeh-assistant-width")).toBe("466");
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
  });

  it("resets to 450 on double-click", () => {
    storage.setItem("umeh-assistant-width", "500");
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("450");
    expect(storage.getItem("umeh-assistant-width")).toBe("450");
  });

  it("keeps the width variable but hides the handle while the panel is closed", () => {
    storage.setItem("umeh-assistant-width", "420");
    const { rerender } = render(<ResizeHandle visible />);
    rerender(<ResizeHandle visible={false} />);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(cssWidth()).toBe("420px");
  });

  it("updates the width variable on pointer move so the panel tracks the pointer", () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const original = {
      set: proto.setPointerCapture,
      has: proto.hasPointerCapture,
      release: proto.releasePointerCapture,
    };
    proto.setPointerCapture = vi.fn();
    proto.hasPointerCapture = vi.fn(() => true);
    proto.releasePointerCapture = vi.fn();

    const panel = document.createElement("aside");
    const panelRef = { current: panel };

    try {
      render(<ResizeHandle visible panelRef={panelRef} />);
      const handle = screen.getByRole("separator");

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 1200 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1000 });

      expect(cssWidth()).toBe("440px");
      expect(panel.style.width).toBe("440px");
      expect((handle as HTMLElement).style.right).toBe("var(--assistant-width, 450px)");

      fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(storage.getItem("umeh-assistant-width")).toBe("440");
      expect(panel.style.width).toBe("440px");
    } finally {
      proto.setPointerCapture = original.set;
      proto.hasPointerCapture = original.has;
      proto.releasePointerCapture = original.release;
    }
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
