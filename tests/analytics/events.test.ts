/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  trackFilterApply,
  trackSearch,
  trackSearchResults,
  trackSelectItem,
} from "@/lib/analytics/events";
import { ANALYTICS_EVENTS } from "@/lib/analytics/registry";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

describe("analytics events", () => {
  it("maps search arguments onto ga4 parameters", () => {
    trackSearch({ term: "ACCT1000", scope: "course", entryPoint: "hero" });
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "search",
        search_term: "ACCT1000",
        search_scope: "course",
        entry_point: "hero",
      },
    ]);
  });

  it("maps instructor search scope and the header entry point", () => {
    trackSearch({ term: "CHAN TAI MAN", scope: "instructor", entryPoint: "header" });
    expect(pushed()[0]).toMatchObject({ search_scope: "instructor", entry_point: "header" });
  });

  it("reports zero results as has_results = 0", () => {
    trackSearchResults({ term: "NOPE", scope: "instructor", resultCount: 0 });
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("reports non-zero results as has_results = 1", () => {
    trackSearchResults({ term: "ACCT1000", scope: "course", resultCount: 7 });
    expect(pushed()[0]).toMatchObject({ result_count: 7, has_results: 1 });
  });

  it("maps filter arguments", () => {
    trackFilterApply({ name: "Offering_Department", value: "FAH", resultCount: 12 });
    expect(pushed()[0]).toMatchObject({
      um_name: "filter_apply",
      filter_name: "Offering_Department",
      filter_value: "FAH",
      result_count: 12,
    });
  });

  it("omits the optional faculty parameter when it is absent", () => {
    trackSelectItem({ itemId: "COMP1001", listName: "catalog", position: 3 });
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });

  it("includes faculty when it is provided", () => {
    trackSelectItem({ itemId: "COMP1001", listName: "catalog", position: 3, faculty: "FST" });
    expect(pushed()[0]).toMatchObject({ item_id: "COMP1001", item_list_name: "catalog", position: 3, faculty: "FST" });
  });

  it("only ever emits parameters that the registry knows", () => {
    // emit() 在 dev 下会对未注册参数抛错，因此这一条同时守住"语义函数的参数名与注册表一致"。
    trackSearch({ term: "ACCT1000", scope: "course", entryPoint: "hero" });
    trackSearchResults({ term: "ACCT1000", scope: "course", resultCount: 1 });
    trackFilterApply({ name: "Credits", value: "3", resultCount: 1 });
    trackSelectItem({ itemId: "COMP1001", listName: "professor_courses", position: 0 });

    const payloads = pushed();
    expect(payloads.map((payload) => payload.um_name)).toEqual([
      "search",
      "view_search_results",
      "filter_apply",
      "select_item",
    ]);

    for (const payload of payloads) {
      const spec = ANALYTICS_EVENTS[payload.um_name as keyof typeof ANALYTICS_EVENTS];
      expect(spec, String(payload.um_name)).toBeTruthy();
      for (const key of Object.keys(payload)) {
        if (key === "event" || key === "um_name") continue;
        expect(Object.keys(spec.params), `${String(payload.um_name)}.${key}`).toContain(key);
      }
      for (const [paramName, paramSpec] of Object.entries(spec.params)) {
        if (!paramSpec.required) continue;
        expect(payload, `${String(payload.um_name)}.${paramName}`).toHaveProperty(paramName);
      }
    }
  });
});
