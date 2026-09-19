import { describe, expect, it } from "vitest";
import { buildEvents } from "@/lib/timetable-events";

const sample = [
  {
    code: "ACCT1000",
    prof: "TEACHER",
    section: "001",
    color: "2563eb",
    schedules: [
      { date: "MON", time: "09:00-10:30", location: "E11-1001" },
      { date: "WED", time: "09:00-10:30", location: "E11-1001" },
    ],
  },
];

describe("buildEvents", () => {
  it("builds one calendar event per schedule", () => {
    const events = buildEvents(sample);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.event_id)).size).toBe(2);
    expect(events[0].title).toContain("ACCT1000");
  });

  it("returns an empty array when schedules are missing", () => {
    expect(buildEvents([{ code: "X", prof: "Y", section: "001" }])).toEqual([]);
  });
});
