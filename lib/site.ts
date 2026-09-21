export const SITE_URL = "https://umeh.top";
export const SITE_NAME = "What2Reg @ UM 澳大選咩課";
export const SITE_SHORT_NAME = "What2Reg @ UM";

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function buildCoursePath(code: string) {
  return `/course/${encodeSegment(code.toUpperCase())}`;
}

export function buildCatalogPath(departments: string[]) {
  return `/catalog/${departments
    .map((part) => {
      const upper = part.toUpperCase();
      return encodeSegment(upper === "GECOURSE" ? "gecourse" : upper);
    })
    .join("/")}`;
}

export function buildProfessorPath(name: string) {
  return `/professor/${encodeSegment(name.toUpperCase())}`;
}

export function buildReviewPath(code: string, prof: string, page = 1) {
  const base = `/reviews/${encodeSegment(code.toUpperCase())}/${encodeSegment(prof.toUpperCase())}`;
  return page > 1 ? `${base}/page/${page}` : base;
}

export function buildSearchPath(kind: "course" | "instructor", value: string) {
  return `/search/${kind}/${encodeSegment(value.toUpperCase())}`;
}
