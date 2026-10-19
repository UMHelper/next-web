// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type PanelWidthModule = typeof import("@/lib/assistant/panel-width");
let mod: PanelWidthModule;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("@/lib/assistant/panel-width");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("maxPanelWidth", () => {
  it("leaves the page at least 480px and caps at 560", () => {
    expect(mod.maxPanelWidth(1024)).toBe(544);
    expect(mod.maxPanelWidth(1440)).toBe(560);
  });

  it("never goes below the 320 minimum on narrow windows", () => {
    expect(mod.maxPanelWidth(780)).toBe(320);
  });
});

describe("clampPanelWidth", () => {
  it("keeps in-range widths and rounds them", () => {
    expect(mod.clampPanelWidth(400.4, 1440)).toBe(400);
  });

  it("clamps to the minimum and to the viewport-aware maximum", () => {
    expect(mod.clampPanelWidth(100, 1440)).toBe(320);
    expect(mod.clampPanelWidth(900, 1440)).toBe(560);
    expect(mod.clampPanelWidth(560, 1024)).toBe(544);
  });

  it("treats a non-finite width as the default", () => {
    expect(mod.clampPanelWidth(Number.NaN, 1440)).toBe(380);
  });
});

describe("stored width", () => {
  it("defaults to 380 when nothing is stored", () => {
    installFakeStorage();
    expect(mod.readStoredPanelWidth()).toBe(380);
  });

  it("round-trips a stored width", () => {
    const storage = installFakeStorage();
    mod.storePanelWidth(452);
    expect(storage.getItem(mod.PANEL_WIDTH_STORAGE_KEY)).toBe("452");
    expect(mod.readStoredPanelWidth()).toBe(452);
  });

  it("returns an unparsable stored value as the default", () => {
    installFakeStorage().setItem("umeh-assistant-width", "wide");
    expect(mod.readStoredPanelWidth()).toBe(380);
  });

  it("falls back to 380 and keeps the width in memory when storage throws", () => {
    const fail = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    expect(mod.readStoredPanelWidth()).toBe(380);
    mod.storePanelWidth(420);
    expect(mod.readStoredPanelWidth()).toBe(420);
  });
});
