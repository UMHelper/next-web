export interface CalendarEvent {
  event_id: number | string;
  title: string;
  start: Date;
  end: Date;
  disabled?: boolean;
  color?: string;
  editable?: boolean;
  deletable?: boolean;
  draggable?: boolean;
  allDay?: boolean;
  data: any;
}

const WEEK_DAY: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
};

export const convertToDate = (time: string[], day: string) => {
  const today = new Date();
  const date = new Date(
    new Date(
      new Date(
        new Date(new Date().setHours(parseInt(time[0]))).setMinutes(parseInt(time[1])),
      ).setDate(today.getDate() + (WEEK_DAY[day] - today.getDay())),
    ),
  );
  return date;
};

export const convertToEvents = (timetable: any, index: number): CalendarEvent[] => {
  if (!Array.isArray(timetable?.schedules)) return [];

  const eventTitle = `${timetable.code} ${timetable.prof} ${timetable.section}`;
  return timetable.schedules.flatMap((schedule: any, scheduleIndex: number) => {
    if (typeof schedule?.time !== "string" || typeof schedule?.date !== "string") {
      return [];
    }

    const times = schedule.time.split("-");
    if (times.length !== 2) return [];
    const startTime = times[0].split(":");
    const endTime = times[1].split(":");

    return [{
      event_id: `${index}-${scheduleIndex} ${eventTitle}`,
      title: eventTitle,
      start: convertToDate(startTime, schedule.date),
      end: convertToDate(endTime, schedule.date),
      color: `#${timetable.color}`,
      data: { ...schedule, ...timetable },
      editable: false,
      deletable: false,
      draggable: false,
    }];
  });
};

export const buildEvents = (timetables: any[]): CalendarEvent[] =>
  timetables.flatMap((timetable, index) => convertToEvents(timetable, index));
