export type ScheduleMode = "add-drop" | "pre-enrollment";

export type ScheduleRow = {
  offeringUnit: string;
  offeringDept: string;
  code: string;
  title: string;
  section: string;
  mediumInstruction: string;
  teacherRaw: string;
  day: string | null;
  times: string | null;
  location: string | null;
};
