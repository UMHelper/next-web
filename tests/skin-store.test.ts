// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SKIN_STORAGE_KEY,
  applySkinAttribute,
  effectiveSkin,
  getSkin,
  setSkin,
  subscribe,
} from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  document.documentElement.removeAttribute("data-skin");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("skin store", () => {
  it("defaults to 'default'", () => {
    expect(getSkin()).toBe("default");
  });

  it("round-trips a written value", () => {
    setSkin("island");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("island");
    expect(getSkin()).toBe("island");
    setSkin("default");
    expect(getSkin()).toBe("default");
  });

  it("treats an invalid stored value as 'default'", () => {
    storage.setItem(SKIN_STORAGE_KEY, "neon");
    expect(getSkin()).toBe("default");
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getSkin()).toBe("default");
    expect(() => setSkin("island")).not.toThrow();
  });

  it("keeps the chosen skin for the session when storage is unavailable", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const cb = vi.fn();
    const off = subscribe(cb);
    setSkin("island");
    expect(getSkin()).toBe("island");
    expect(cb).toHaveBeenCalledTimes(1);
    setSkin("default");
    expect(getSkin()).toBe("default");
    off();
  });

  it("notifies subscribers on setSkin and stops after unsubscribe", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    setSkin("island");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSkin("default");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on a cross-tab storage event for its key only", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    window.dispatchEvent(new StorageEvent("storage", { key: SKIN_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("forces the default skin on /admin and below, but not look-alikes", () => {
    expect(effectiveSkin("/admin", "island")).toBe("default");
    expect(effectiveSkin("/admin/update", "island")).toBe("default");
    expect(effectiveSkin("/adminfoo", "island")).toBe("island");
    expect(effectiveSkin("/", "island")).toBe("island");
    expect(effectiveSkin(null, "island")).toBe("island");
    expect(effectiveSkin("/", "default")).toBe("default");
  });

  it("applySkinAttribute sets and removes data-skin", () => {
    applySkinAttribute("island");
    expect(document.documentElement.getAttribute("data-skin")).toBe("island");
    applySkinAttribute("default");
    expect(document.documentElement.hasAttribute("data-skin")).toBe(false);
  });
});
