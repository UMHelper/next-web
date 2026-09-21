import type { PlanSection } from "./schema";

export type ScheduleConflict = { a: PlanSection; b: PlanSection; date: string };

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export const schedulesOverlap = (
  a: { date: string; time: string },
  b: { date: string; time: string },
) => {
  if (a.date !== b.date) return false;
  const [aStart, aEnd] = a.time.split("-").map(timeToMinutes);
  const [bStart, bEnd] = b.time.split("-").map(timeToMinutes);
  return aStart < bEnd && bStart < aEnd;
};

export const detectScheduleConflicts = (
  sections: PlanSection[],
): ScheduleConflict[] => {
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < sections.length; i += 1) {
    for (let j = i + 1; j < sections.length; j += 1) {
      const a = sections[i];
      const b = sections[j];
      for (const scheduleA of a.schedules) {
        for (const scheduleB of b.schedules) {
          if (schedulesOverlap(scheduleA, scheduleB)) {
            conflicts.push({ a, b, date: scheduleA.date });
          }
        }
      }
    }
  }

  return conflicts;
};

export const findSameCourseSections = (
  sections: PlanSection[],
  incoming: PlanSection,
) =>
  sections.filter(
    (section) =>
      section.courseCode === incoming.courseCode && section.key !== incoming.key,
  );
