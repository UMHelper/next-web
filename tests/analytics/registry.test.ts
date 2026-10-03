import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENTS, FORBIDDEN_PARAM_NAMES } from "@/lib/analytics/registry";

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const RESERVED_PREFIXES = ["ga_", "google_", "firebase_"];
const RECOMMENDED_WHITELIST = ["search", "view_search_results", "select_item", "login"];
const PHASE_1_EVENTS = ["search", "view_search_results", "filter_apply", "select_item"];

describe("analytics registry", () => {
  it("declares the phase 1 events", () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual([...PHASE_1_EVENTS].sort());
  });

  it("keeps every event and parameter name ga4-compatible", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      expect(eventName, eventName).toMatch(NAME_PATTERN);
      expect(eventName.length, eventName).toBeLessThanOrEqual(40);
      for (const prefix of RESERVED_PREFIXES) {
        expect(eventName.startsWith(prefix), eventName).toBe(false);
      }
      expect(Object.keys(spec.params).length, eventName).toBeLessThanOrEqual(25);

      for (const [paramName, param] of Object.entries(spec.params)) {
        expect(paramName, `${eventName}.${paramName}`).toMatch(NAME_PATTERN);
        expect(paramName.length, `${eventName}.${paramName}`).toBeLessThanOrEqual(40);
        expect(["string", "number"], `${eventName}.${paramName}`).toContain(param.type);
        expect(typeof param.required, `${eventName}.${paramName}`).toBe("boolean");
        expect(param.note.length, `${eventName}.${paramName}`).toBeGreaterThan(0);
      }
    }
  });

  it("never registers a forbidden pii parameter", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      for (const paramName of Object.keys(spec.params)) {
        expect(FORBIDDEN_PARAM_NAMES, `${eventName}.${paramName}`).not.toContain(paramName);
      }
    }
  });

  it("never registers a parameter name that collides with the payload shape or Object.prototype", () => {
    // emit() 预填了 event / um_name，注册表若也允许这两个名字，
    // 必填校验会被预填值自动满足（还可能是 GTM 保留前缀）；
    // 同理，原型链上的成员名会让"参数已注册 / 必填未填"的判断失效。
    const RESERVED_PARAM_NAMES = ["event", "um_name"];
    const PROTOTYPE_MEMBER_NAMES = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      for (const paramName of Object.keys(spec.params)) {
        const where = `${eventName}.${paramName}`;
        expect(RESERVED_PARAM_NAMES, where).not.toContain(paramName);
        expect(PROTOTYPE_MEMBER_NAMES, where).not.toContain(paramName);
        expect(paramName.startsWith("um_"), where).toBe(false);
        expect(paramName.startsWith("gtm"), where).toBe(false);
      }
    }
  });

  it("only uses whitelisted ga4 recommended event names", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      if (spec.ga4 === "recommended") {
        expect(RECOMMENDED_WHITELIST, eventName).toContain(eventName);
      }
    }
  });

  it("points every event at wiring files that exist", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      const files = spec.wiring.split(",").map((value) => value.trim());
      expect(files.length, eventName).toBeGreaterThan(0);
      for (const file of files) {
        expect(existsSync(join(process.cwd(), file)), `${eventName} → ${file}`).toBe(true);
      }
    }
  });

  it("keeps the data source importable by plain node", () => {
    const source = readFileSync(join(process.cwd(), "lib/analytics/registry-data.mjs"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(/);
  });
});
