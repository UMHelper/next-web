export type PlannerQuery = {
  mode: "course" | "instructor";
  q: string;
  faculty: string;
  department: string;
  code: string;
  prof: string;
  page: number;
};

export const defaultPlannerQuery: PlannerQuery = {
  mode: "course",
  q: "",
  faculty: "",
  department: "",
  code: "",
  prof: "",
  page: 1,
};

export const parsePlannerQuery = (
  input: URLSearchParams | Record<string, string | undefined>,
): PlannerQuery => {
  const get = (key: string) =>
    input instanceof URLSearchParams ? input.get(key) ?? undefined : input[key];
  const page = Number.parseInt(get("page") ?? "1", 10);
  return {
    mode: get("mode") === "instructor" ? "instructor" : "course",
    q: get("q") ?? "",
    faculty: get("faculty") ?? "",
    department: get("department") ?? "",
    code: get("code") ?? "",
    prof: get("prof") ?? "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
};

export const serializePlannerQuery = (query: PlannerQuery) => {
  const params = new URLSearchParams();
  params.set("mode", query.mode);
  if (query.q) params.set("q", query.q);
  if (query.faculty) params.set("faculty", query.faculty);
  if (query.department) params.set("department", query.department);
  if (query.code) params.set("code", query.code);
  if (query.prof) params.set("prof", query.prof);
  if (query.page > 1) params.set("page", String(query.page));
  return params.toString();
};

export const getDepartmentOptions = (
  departments: string[],
  faculty: string,
  facultyToDepartments: Record<string, string[]>,
) => {
  if (!faculty) return departments;
  return facultyToDepartments[faculty] ?? departments;
};
