const UM_RESOURCES: Record<string, string> = {
  course_catalog: "course_catalog/all",
  course_catalog_v1: "course_catalog/v1.0.0/all",
  courses: "courses/all",
};

export function resolveUmResource(resource: string | null): string | null {
  if (!resource) return null;
  return UM_RESOURCES[resource] ?? null;
}
