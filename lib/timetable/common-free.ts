import { timeToMinutes } from "@/lib/timetable/conflicts";
import type { PlanSection } from "@/lib/timetable/schema";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
const START = 8 * 60;
const END = 20 * 60;
const MIN_GAP = 30;

type Interval = { start: number; end: number };
export type CommonFreeSlot = { date: (typeof DAYS)[number]; start: string; end: string };

const merge = (intervals: Interval[]) => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }
  return merged;
};

const busyForDay = (sections: PlanSection[], date: string) => {
  const busy: Interval[] = [];
  for (const section of sections) {
    for (const schedule of section.schedules) {
      if (schedule.date !== date) continue;
      const [start, end] = schedule.time.split("-").map(timeToMinutes);
      busy.push({
        start: Math.max(start, START),
        end: Math.min(end, END),
      });
    }
  }
  return merge(busy.filter((interval) => interval.start < interval.end));
};

const minutesToTime = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const computeCommonFree = (
  planA: PlanSection[],
  planB: PlanSection[],
): CommonFreeSlot[] => {
  const result: CommonFreeSlot[] = [];

  for (const date of DAYS) {
    const busy = merge([...busyForDay(planA, date), ...busyForDay(planB, date)]);
    let cursor = START;
    for (const interval of busy) {
      if (interval.start - cursor >= MIN_GAP) {
        result.push({
          date,
          start: minutesToTime(cursor),
          end: minutesToTime(interval.start),
        });
      }
      cursor = Math.max(cursor, interval.end);
    }
    if (END - cursor >= MIN_GAP) {
      result.push({ date, start: minutesToTime(cursor), end: minutesToTime(END) });
    }
  }

  return result;
};
