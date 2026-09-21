import { describe, expect, it } from "vitest";
import {
  applyAddSection,
  applyRemoveSection,
  applyReplaceSection,
  coalesceOutbox,
  createEmptyStore,
  queueMutation,
  upsertPlanLocal,
  type LocalPlan,
} from "@/lib/timetable/store";

const plan = (): LocalPlan => ({
  clientRef: "plan-1",
  name: "我的课表",
  year: 2026,
  sem: 1,
  payload: { schemaVersion: 1, sections: [] },
  revision: 1,
  syncState: "idle",
});

const section = (key: string, code: string) => ({
  key,
  courseCode: code,
  prof: "P",
  section: key,
  color: "#2563eb",
  schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
});

describe("timetable store", () => {
  it("adds and removes sections", () => {
    const added = applyAddSection(createEmptyStoreAndPlan(), "plan-1", section("A|P|01", "A"));
    expect(added.error).toBeUndefined();
    expect(added.store.plans["plan-1"].payload.sections).toHaveLength(1);

    const removed = applyRemoveSection(added.store, "plan-1", "A|P|01");
    expect(removed.plans["plan-1"].payload.sections).toHaveLength(0);
  });

  it("rejects duplicate and same-course sections", () => {
    const base = applyAddSection(
      createEmptyStoreAndPlan(),
      "plan-1",
      section("A|P|01", "A"),
    ).store;
    expect(applyAddSection(base, "plan-1", section("A|P|01", "A")).error).toBe(
      "duplicate",
    );
    expect(applyAddSection(base, "plan-1", section("A|P|02", "A")).error).toBe(
      "same-course",
    );
  });

  it("replaces the same course section explicitly", () => {
    const base = applyAddSection(
      createEmptyStoreAndPlan(),
      "plan-1",
      section("A|P|01", "A"),
    ).store;
    const replaced = applyReplaceSection(
      base,
      "plan-1",
      "A|P|01",
      section("A|P|02", "A"),
    );
    expect(replaced.plans["plan-1"].payload.sections.map((item) => item.key)).toEqual([
      "A|P|02",
    ]);
  });

  it("coalesces pending updates for the same plan", () => {
    const withFirst = queueMutation(createEmptyStoreAndPlan(), {
      type: "update_plan",
      clientRef: "plan-1",
      baseRevision: 1,
    });
    const withSecond = coalesceOutbox(withFirst, {
      type: "update_plan",
      clientRef: "plan-1",
      baseRevision: 1,
    });
    expect(withSecond.outbox).toHaveLength(1);
  });
});

function createEmptyStoreAndPlan() {
  return upsertPlanLocal(createEmptyStore(), plan());
}
