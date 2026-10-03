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

  // SSR 早退必须发生在校验之前，否则服务端渲染遇到脏数据会抛错。
  it("does not throw on an invalid event without a window (server rendering)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => emit("not_registered", {})).not.toThrow();
  });

  it("rejects unknown events in development", () => {
    expect(() => emit("not_registered", {})).toThrow(/unknown event/);
    expect(layer()).toHaveLength(0);
  });

  // 注册表是对象字面量，原型链上的键（constructor / toString / …）不是事件。
  it("treats prototype-key event names as unknown events in development", () => {
    const names = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

    for (const name of names) {
      expect(() => emit(name, {}), name).toThrow(/unknown event/);
      expect(() => emit(name, { nope: "x" }), name).toThrow(/unknown event/);
    }
    expect(layer()).toHaveLength(0);
  });

  it("drops prototype-key event names in production instead of throwing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => emit("constructor", { nope: "x" })).not.toThrow();
    expect(layer()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rejects unregistered parameters in development", () => {
    expect(() => emit("search", { ...SEARCH, nope: "x" })).toThrow(/not registered/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects prototype-key parameter names in development", () => {
    const keys = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

    for (const key of keys) {
      expect(() => emit("search", { ...SEARCH, [key]: "x" }), key).toThrow(/not registered/);
    }
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

  // 注册表声明了每个参数的类型，值必须与之匹配，否则会把字符串塞进 GA4 的数值指标。
  it("rejects a string value for a numeric parameter in development", () => {
    expect(() =>
      emit("view_search_results", {
        search_term: "ACCT1000",
        search_scope: "course",
        result_count: "3",
        has_results: true,
      }),
    ).toThrow(/parameter "result_count" of event "view_search_results" must be type "number", got "string"/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects a numeric value for a string parameter in development", () => {
    expect(() => emit("search", { ...SEARCH, search_scope: 5 })).toThrow(
      /parameter "search_scope" of event "search" must be type "string", got "number"/,
    );
    expect(layer()).toHaveLength(0);
  });

  it("rejects a boolean value for a string parameter in development", () => {
    expect(() => emit("search", { ...SEARCH, entry_point: true })).toThrow(
      /parameter "entry_point" of event "search" must be type "string", got "boolean"/,
    );
    expect(layer()).toHaveLength(0);
  });

  it("drops a wrongly typed value in production instead of throwing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      emit("view_search_results", {
        search_term: "ACCT1000",
        search_scope: "course",
        result_count: "3",
        has_results: true,
      }),
    ).not.toThrow();
    expect(layer()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
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
