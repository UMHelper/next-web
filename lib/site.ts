export const SITE_URL = "https://umeh.top";
export const SITE_NAME = "What2Reg@UM 澳大選咩課";
export const SITE_SHORT_NAME = "What2Reg@UM";

/**
 * 已上架 iOS App 的 App Store 商品 ID。
 * 公告條的下載連結（components/banner.tsx）與 iOS Safari 頂部的系統橫幅
 * （lib/seo.ts 的 `itunes` → `<meta name="apple-itunes-app">`）共用此值，
 * 免得兩處各自硬編碼後走音。
 */
export const IOS_APP_ID = "6804686377";
export const IOS_APP_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;

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
  return page > 1 ? `${base}/${page}` : base;
}

/**
 * 提交评价页的路径。与 `buildReviewPath` 一样期望**已解码**的教授姓名：
 * 路由片段由 Next 传进来时仍是百分号编码形态（见 `lib/review-route.ts` 的
 * `normalizeProf`，它还得专门还原 `%2C`），所以调用方必须先解码一次，
 * 否则会对已编码的片段再编码一次，产生 `/submit/…%2520…` 这第二种 URL 形态。
 */
export function buildSubmitPath(code: string, prof: string) {
  return `/submit/${encodeSegment(code.toUpperCase())}/${encodeSegment(prof.toUpperCase())}`;
}

export function buildSearchPath(kind: "course" | "instructor", value: string) {
  return `/search/${kind}/${encodeSegment(value.toUpperCase())}`;
}
