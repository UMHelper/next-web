// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sonner } = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  });
  return { sonner: fn };
});
vi.mock("sonner", () => ({ toast: sonner }));

import { setNotifier, toast } from "@/lib/notify";
import { SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

function makeNotifier() {
  return {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    open: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Parameters<typeof setNotifier>[0] & Record<string, ReturnType<typeof vi.fn>>;
}

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  history.pushState({}, "", "/");
});
afterEach(() => {
  setNotifier(null);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("notify facade — default path", () => {
  it("forwards arguments to sonner unchanged", () => {
    toast.success("a");
    expect(sonner.success).toHaveBeenLastCalledWith("a");
    toast.error("b", { description: "d", duration: 10000, toasterId: "admin_notice" });
    expect(sonner.error).toHaveBeenLastCalledWith("b", {
      description: "d",
      duration: 10000,
      toasterId: "admin_notice",
    });
    toast.info("c");
    expect(sonner.info).toHaveBeenLastCalledWith("c");
  });

  it("forwards promise() to sonner with the same promise and messages", () => {
    const p = Promise.resolve(1);
    const msgs = { loading: "l", success: "s", error: "e" };
    toast.promise(p, msgs);
    expect(sonner.promise).toHaveBeenCalledWith(p, msgs);
  });

  it("falls back to sonner when the library is not loaded yet", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
  });
});

describe("notify facade — island path", () => {
  beforeEach(() => storage.setItem(SKIN_STORAGE_KEY, "island"));

  it("routes success / error / info to the library and converts ms to seconds", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.success("a");
    toast.error("b", { description: "d", duration: 2000 });
    toast.info("c");
    expect(n!.success).toHaveBeenCalledWith({ message: "a" });
    expect(n!.error).toHaveBeenCalledWith({ message: "b", description: "d", duration: 2 });
    expect(n!.info).toHaveBeenCalledWith({ message: "c" });
    expect(sonner.success).not.toHaveBeenCalled();
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("does not pass undefined keys (they would override the default duration)", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.success("a", { description: undefined });
    const config = (n!.success as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(config)).toEqual(["message"]);
  });

  it("keeps toasterId calls and bare calls on sonner", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.error("x", { toasterId: "admin_notice" });
    expect(sonner.error).toHaveBeenCalledTimes(1);
    expect(n!.error).not.toHaveBeenCalled();

    const node = "node";
    toast(node, { duration: 1 });
    expect(sonner).toHaveBeenCalledWith(node, { duration: 1 });
  });

  it("uses sonner on /admin even if island is chosen", () => {
    const n = makeNotifier();
    setNotifier(n);
    history.pushState({}, "", "/admin/update");
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
    expect(n!.success).not.toHaveBeenCalled();
  });

  it("goes back to sonner after setNotifier(null)", () => {
    setNotifier(makeNotifier());
    setNotifier(null);
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
  });

  it("promise(): one key, loading first, then updated in place on success", async () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.promise(Promise.resolve(7), {
      loading: "Voting...",
      success: (v: number) => `done ${v}`,
      error: "bad",
    });
    const loading = (n!.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loading).toMatchObject({ message: "Voting...", duration: 0 });
    await Promise.resolve();
    await Promise.resolve();
    const ok = (n!.success as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ok).toMatchObject({ message: "done 7", key: loading.key });
    expect(sonner.promise).not.toHaveBeenCalled();
  });

  it("promise(): updates the same key with the error message on rejection", async () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.promise(Promise.reject(new Error("boom")), {
      loading: "Submiting...",
      success: "ok",
      error: (e: unknown) => (e instanceof Error ? e.message : "Error"),
    });
    const loading = (n!.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await new Promise((r) => setTimeout(r, 0));
    const failed = (n!.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(failed).toMatchObject({ message: "boom", key: loading.key });
  });
});
