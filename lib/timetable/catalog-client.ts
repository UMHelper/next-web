import type { PlanSection } from "@/lib/timetable/schema";

export type CatalogCourse = {
  course_code: string;
  course_title_eng: string;
  course_title_chi?: string;
  offering_unit: string;
  offering_department: string;
  credits?: string;
  is_offered?: number;
  total_count?: number;
};

export type CatalogInstructor = {
  prof_id: string;
  course_count: number;
  total_count?: number;
};

const json = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

export const searchCatalog = async (query: {
  type: "course" | "instructor";
  q: string;
  faculty?: string;
  department?: string;
  page?: number;
}) => {
  const params = new URLSearchParams({ type: query.type, q: query.q });
  if (query.faculty) params.set("faculty", query.faculty);
  if (query.department) params.set("department", query.department);
  if (query.page) params.set("page", String(query.page));
  return json<{ items: Array<CatalogCourse | CatalogInstructor>; page: number; total: number }>(
    `/api/timetable/catalog/search?${params.toString()}`,
  );
};

export const getCourseDetail = (code: string) =>
  json<{ course: any; profList: any[]; isOffer: boolean }>(
    `/api/timetable/catalog/courses/${encodeURIComponent(code)}`,
  );

export const getSections = (code: string, prof: string) =>
  json<{ sections: Array<{ section: string; schedules: PlanSection["schedules"] }> }>(
    `/api/timetable/catalog/courses/${encodeURIComponent(code)}/${encodeURIComponent(prof).replaceAll("%2F", "$")}/sections`,
  );

export const getInstructorCourses = (prof: string) =>
  json<{ courses: any[] }>(
    `/api/timetable/catalog/instructors/${encodeURIComponent(prof).replaceAll("%2F", "$")}/courses`,
  );
