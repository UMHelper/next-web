import { describe, expect, it } from "vitest";

import { evaluateTimeRules, type Meeting } from "@/lib/assistant/discovery/constraints";

const mon = (start: string, end: string): Meeting => ({ day: "MON", start, end });

describe("evaluateTimeRules startAfter", () => {
  const rules = { startAfter: "10:00" as const };

  it("met when every meeting starts at or after the threshold", () => {
    const [outcome] = evaluateTimeRules([mon("10:00", "11:15")], true, rules);
    expect(outcome).toMatchObject({ rule: "startAfter", status: "met" });
  });

  it("violated when a meeting starts before the threshold", () => {
    const [outcome] = evaluateTimeRules([mon("08:30", "09:45")], true, rules);
    expect(outcome).toMatchObject({ rule: "startAfter", status: "violated" });
  });

  it("unknown when meetings are incomplete and no violation is known", () => {
    const [outcome] = evaluateTimeRules([mon("11:00", "12:15")], false, rules);
    expect(outcome).toMatchObject({ rule: "startAfter", status: "unknown" });
  });

  it("violated when incomplete but a known meeting violates", () => {
    const [outcome] = evaluateTimeRules([mon("08:30", "09:45")], false, rules);
    expect(outcome).toMatchObject({ rule: "startAfter", status: "violated" });
  });
});

describe("evaluateTimeRules endBefore", () => {
  it("violated when a meeting ends after the threshold", () => {
    const [outcome] = evaluateTimeRules([mon("16:00", "17:15")], true, { endBefore: "17:00" });
    expect(outcome).toMatchObject({ rule: "endBefore", status: "violated" });
  });
});

describe("evaluateTimeRules avoidDays", () => {
  const rules = { avoidDays: ["FRI" as const] };

  it("met when section does not meet on avoided days", () => {
    const meetings: Meeting[] = [
      { day: "MON", start: "10:00", end: "11:15" },
      { day: "THU", start: "10:00", end: "11:15" },
    ];
    const [outcome] = evaluateTimeRules(meetings, true, rules);
    expect(outcome).toMatchObject({ rule: "avoidDays", status: "met" });
  });

  it("violated with label no FRI when section meets on Friday", () => {
    const meetings: Meeting[] = [
      { day: "TUE", start: "10:00", end: "11:15" },
      { day: "FRI", start: "10:00", end: "11:15" },
    ];
    const [outcome] = evaluateTimeRules(meetings, true, rules);
    expect(outcome).toMatchObject({ rule: "avoidDays", status: "violated", label: "no FRI" });
  });
});

describe("evaluateTimeRules avoidWindows", () => {
  const rules = { avoidWindows: [{ start: "12:00", end: "14:00" }] };

  it("violated on strict overlap", () => {
    const [outcome] = evaluateTimeRules([mon("11:30", "12:45")], true, rules);
    expect(outcome).toMatchObject({ rule: "avoidWindows", status: "violated" });
  });

  it("met when meeting only touches the window end", () => {
    const [outcome] = evaluateTimeRules([mon("10:30", "12:00")], true, rules);
    expect(outcome).toMatchObject({ rule: "avoidWindows", status: "met" });
  });

  it("met on other weekdays when window is limited to MON", () => {
    const windowRules = { avoidWindows: [{ start: "12:00", end: "14:00", days: ["MON" as const] }] };
    const [outcome] = evaluateTimeRules(
      [{ day: "THU", start: "12:30", end: "13:45" }],
      true,
      windowRules,
    );
    expect(outcome).toMatchObject({ rule: "avoidWindows", status: "met" });
  });
});

describe("evaluateTimeRules fewerDays", () => {
  it("met when section meets on at most two days", () => {
    const meetings: Meeting[] = [
      { day: "MON", start: "10:00", end: "11:15" },
      { day: "THU", start: "10:00", end: "11:15" },
    ];
    const [outcome] = evaluateTimeRules(meetings, true, undefined, true);
    expect(outcome).toMatchObject({ rule: "fewerDays", status: "met" });
  });

  it("violated when section meets on more than two days", () => {
    const meetings: Meeting[] = [
      { day: "MON", start: "10:00", end: "11:15" },
      { day: "WED", start: "10:00", end: "11:15" },
      { day: "FRI", start: "10:00", end: "11:15" },
    ];
    const [outcome] = evaluateTimeRules(meetings, true, undefined, true);
    expect(outcome).toMatchObject({ rule: "fewerDays", status: "violated" });
  });
});

describe("evaluateTimeRules incomplete data", () => {
  it("unknown for every rule when there are no meetings and times are incomplete", () => {
    const outcomes = evaluateTimeRules([], false, { startAfter: "10:00", endBefore: "17:00" });
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((o) => o.status === "unknown")).toBe(true);
  });
});
