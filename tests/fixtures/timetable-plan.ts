import type { GetCourseSectionsOutput } from "@/lib/mcp/schemas";
import { normalizePlanSection } from "@/lib/timetable/schema";
import type { LocalPlan } from "@/lib/timetable/store";

const section = (input: Parameters<typeof normalizePlanSection>[0]) =>
  normalizePlanSection(input);

export const FIXTURE_PLAN: LocalPlan = {
  clientRef: "plan-1",
  name: "My plan",
  year: 2026,
  sem: 1,
  revision: 3,
  syncState: "idle",
  payload: {
    schemaVersion: 1,
    sections: [
      section({
        courseCode: "CISC2001",
        prof: "WONG KA KI",
        section: "001",
        schedules: [{ date: "TUE", time: "09:00-10:15", location: "E11-1002" }],
      }),
      section({
        courseCode: "ECON1001",
        prof: "CHEUNG WAI",
        section: "001",
        schedules: [
          { date: "TUE", time: "10:00-11:15", location: "E21-2001" },
          { date: "THU", time: "10:00-11:15", location: "E21-2001" },
        ],
      }),
      section({
        courseCode: "CISC3014",
        prof: "CHAN TAI MAN",
        section: "001",
        schedules: [{ date: "MON", time: "10:00-11:15", location: "E11-1001" }],
      }),
      section({
        courseCode: "MATH1010",
        prof: "HO SIU MING",
        section: "002",
        schedules: [
          { date: "MON", time: "14:00-15:15", location: "E22-3001" },
          { date: "WED", time: "14:00-15:15", location: "E22-3001" },
        ],
      }),
      section({
        courseCode: "GEND1001",
        prof: "LAM",
        section: "001",
        schedules: [],
      }),
    ],
  },
};

export const FIXTURE_CATALOG_SECTIONS: GetCourseSectionsOutput[] = [
  {
    courseCode: "MATH1010",
    instructor: "HO SIU MING",
    courseUrl: "https://umeh.top/course/MATH1010",
    sections: [
      {
        section: "001",
        courseUrl: "https://umeh.top/course/MATH1010",
        schedules: [
          { weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E22-3001" },
          { weekday: "WED", startTime: "09:00", endTime: "10:15", location: "E22-3001" },
        ],
      },
      {
        section: "002",
        courseUrl: "https://umeh.top/course/MATH1010",
        schedules: [
          { weekday: "MON", startTime: "14:00", endTime: "15:15", location: "E22-3001" },
          { weekday: "WED", startTime: "14:00", endTime: "15:15", location: "E22-3001" },
        ],
      },
      {
        section: "003",
        courseUrl: "https://umeh.top/course/MATH1010",
        schedules: [{ weekday: "SAT", startTime: "09:00", endTime: "12:00", location: "E22-3001" }],
      },
    ],
  },
  {
    courseCode: "ECON1001",
    instructor: "CHEUNG WAI",
    courseUrl: "https://umeh.top/course/ECON1001",
    sections: [
      {
        section: "001",
        courseUrl: "https://umeh.top/course/ECON1001",
        schedules: [
          { weekday: "TUE", startTime: "10:00", endTime: "11:15", location: "E21-2001" },
          { weekday: "THU", startTime: "10:00", endTime: "11:15", location: "E21-2001" },
        ],
      },
      {
        section: "002",
        courseUrl: "https://umeh.top/course/ECON1001",
        schedules: [
          { weekday: "TUE", startTime: "15:00", endTime: "16:15", location: "E21-2001" },
          { weekday: "THU", startTime: "15:00", endTime: "16:15", location: "E21-2001" },
        ],
      },
    ],
  },
];
