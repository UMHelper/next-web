"use client";

import { Scheduler } from "@aldabil/react-scheduler";
import Link from "next/link";
import { useMemo } from "react";

import { buildEvents } from "@/lib/timetable-events";

export default function TimetableCalendar({ timetable }: { timetable: any[] }) {
  const events = useMemo(() => buildEvents(timetable), [timetable]);

  if (events.length === 0) return null;

  return (
    <Scheduler
      view="week"
      week={{
        weekDays: [0, 1, 2, 3, 4],
        weekStartOn: 1,
        startHour: 8,
        endHour: 20,
        step: 60,
        navigation: false,
        disableGoToDay: true,
        cellRenderer: () => <span />,
      }}
      navigation={false}
      disableViewNavigator={true}
      editable={false}
      deletable={false}
      draggable={false}
      events={events}
      eventRenderer={({ event }) => (
        <div
          className="flex flex-col justify-center items-center w-full h-full md:text-xs text-[10px]"
          style={{ backgroundColor: event.color }}
        >
          <Link href={`/reviews/${event.data.code}/${event.data.prof}`}>
            <div>{`${event.data.code}-${event.data.section}`}</div>
            <div>{event.data.time}</div>
            <div>{event.data.location}</div>
          </Link>
        </div>
      )}
    />
  );
}
