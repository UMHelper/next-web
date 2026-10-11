// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SKIN_INIT_SCRIPT, SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const run = () => (0, eval)(SKIN_INIT_SCRIPT);
const attr = () => document.documentElement.getAttribute("data-skin");

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  document.documentElement.removeAttribute("data-skin");
  history.pushState({}, "", "/");
});

describe("SKIN_INIT_SCRIPT", () => {
  it("applies the island skin when stored", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    run();
    expect(attr()).toBe("island");
  });

  it.each([[""], ["default"], ["neon"]])("ignores %j", (value) => {
    if (value) storage.setItem(SKIN_STORAGE_KEY, value);
    run();
    expect(attr()).toBeNull();
  });

  it("does nothing on /admin paths", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    history.pushState({}, "", "/admin/update");
    run();
    expect(attr()).toBeNull();
  });

  it("still applies on look-alike paths such as /adminfoo", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    history.pushState({}, "", "/adminfoo");
    run();
    expect(attr()).toBe("island");
  });

  it("swallows storage errors", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(run).not.toThrow();
    expect(attr()).toBeNull();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
