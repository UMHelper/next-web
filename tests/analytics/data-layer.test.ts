/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emit } from "@/lib/analytics/data-layer";

type Payload = Record<string, unknown>;

function layer(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SEARCH = { search_term: "ACCT1000", search_scope: "course", entry_point: "hero" };

describe("emit", () => {
  it("pushes the canonical payload shape", () => {
    emit("search", SEARCH);
    expect(layer()).toEqual([{ event: "um_event", um_name: "search", ...SEARCH }]);
  });

  it("initialises window.dataLayer when it is missing", () => {
    delete (window as unknown as { dataLayer?: Payload[] }).dataLayer;
    emit("search", SEARCH);
    expect(layer()).toHaveLength(1);
  });

  it("does nothing without a window (server rendering)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => emit("search", SEARCH)).not.toThrow();
  });

  it("rejects unknown events in development", () => {
    expect(() => emit("not_registered", {})).toThrow(/unknown event/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects unregistered parameters in development", () => {
    expect(() => emit("search", { ...SEARCH, nope: "x" })).toThrow(/not registered/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects missing required parameters in development", () => {
    expect(() => emit("search", { search_term: "ACCT1000" })).toThrow(/missing required parameter/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects reserved parameter names", () => {
    expect(() => emit("search", { ...SEARCH, um_name: "hijack" })).toThrow(/reserved/);
    expect(layer()).toHaveLength(0);
  });

  it("drops and warns once instead of throwing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    emit("production_drop_probe", {});
    emit("production_drop_probe", {});
    expect(layer()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("normalises booleans to 1/0 and keeps numbers as numbers", () => {
    emit("view_search_results", {
      search_term: "ACCT1000",
      search_scope: "course",
      result_count: 3,
      has_results: true,
    });
    expect(layer()[0]).toMatchObject({ result_count: 3, has_results: 1 });

    emit("view_search_results", {
      search_term: "NOPE",
      search_scope: "course",
      result_count: 0,
      has_results: false,
    });
    expect(layer()[1]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("omits undefined and null parameters", () => {
    emit("select_item", { item_id: "COMP1001", item_list_name: "catalog", position: 0, faculty: undefined });
    expect(layer()[0]).not.toHaveProperty("faculty");
  });

  it("truncates long string values to 100 characters", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    emit("search", { search_term: "x".repeat(140), search_scope: "course", entry_point: "hero" });
    expect((layer()[0].search_term as string).length).toBe(100);
    expect(warn).toHaveBeenCalled();
  });

  it("stays silent in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    emit("search", SEARCH);
    expect(debug).not.toHaveBeenCalled();
    expect(layer()).toHaveLength(1);
  });
});
