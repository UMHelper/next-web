import { addOfferSchedule, addProfCourse, addTimeLocation } from "@/lib/update/tasks/apply-schedule";
import { checkCourses } from "@/lib/update/tasks/check-courses";
import { resetOffered } from "@/lib/update/tasks/reset-offered";
import { setOffered } from "@/lib/update/tasks/set-offered";
import type { UpdateTask } from "@/lib/update/task-types";

export const UPDATE_TASKS: Record<string, UpdateTask> = {
  "reset-offered": resetOffered,
  "check-courses": checkCourses,
  "set-offered": setOffered,
  "add-time-location": addTimeLocation,
  "add-prof-course": addProfCourse,
  "add-offer-schedule": addOfferSchedule,
};
