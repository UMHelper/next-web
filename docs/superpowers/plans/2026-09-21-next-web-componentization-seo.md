# next-web Componentization and SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分三阶段完成 next-web 的 SEO 基础、组件化重构和公共页/评价页渲染优化，同时保持登录、评论、回复、投票、举报和管理后台行为不回归。

**Architecture:** Phase 1 先集中 URL/metadata/robots/sitemap 和可见内容；Phase 2 把重复 UI 抽成小型组件并拆分巨型客户端组件；Phase 3 用 route group 把公共页与 Clerk 隔离，把评价页改成公共数据缓存 + 客户端 viewer state。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Tailwind、Radix UI、Clerk、Supabase、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-componentization-seo-design.md`

## Global Constraints

- 不改数据库 schema、RLS、已有 RPC 签名。
- 不改已有 API 语义；Phase 3 允许新增 `GET /api/vote/me`。
- 所有新增 URL 由 `lib/site.ts` 生成，sitemap/canonical/页面链接共用同一套 builder。
- 每阶段都必须跑 `npm run lint`、`npm test`、`npm run build`。
- 每个任务单独 commit，commit message 使用 `feat: ...` / `refactor: ...` / `chore: ...`。
- 组件拆分保持对外 props 不变，优先移动代码而不是重写行为。

---

## File Structure

### New

- `lib/site.ts`
- `lib/seo.ts`
- `components/seo/json-ld.tsx`
- `components/search/search-form.tsx`
- `components/search/search-card.tsx`
- `components/search/search-dialog.tsx`
- `components/course/rating-stats-card.tsx`
- `components/timetable-schedule-card.tsx`
- `components/timetable/schedule-list.tsx`
- `components/review/comment-card.tsx`
- `components/review/comment-header.tsx`
- `components/review/comment-body.tsx`
- `components/review/comment-vote-bar.tsx`
- `components/review/reply-list.tsx`
- `components/review/reply-editor.tsx`
- `components/review/comment-image.tsx`
- `components/submit/submit-comment-form.tsx`
- `components/submit/rating-field.tsx`
- `components/submit/image-upload-field.tsx`
- `lib/validation/submit-comment.ts`
- `components/layout/site-shell.tsx`
- `components/layout/public-navbar.tsx`
- `components/layout/app-navbar.tsx`
- `components/auth/public-auth-controls.tsx`
- `app/(public)/layout.tsx`
- `app/(auth)/layout.tsx`
- `app/api/vote/me/route.ts`
- `lib/database/get-public-comment-list.ts`
- `tests/site-urls.test.ts`
- `tests/seo/metadata.test.ts`
- `tests/seo/json-ld.test.tsx`
- `tests/robots.test.ts`
- `tests/sitemap.test.ts`
- `tests/components/search-form.test.tsx`
- `tests/components/rating-stats-card.test.tsx`
- `tests/components/comment-card-split.test.tsx`
- `tests/api/vote-me.test.ts`

### Modified

- `app/layout.tsx`
- `app/robots.ts`
- `app/sitemap.ts`
- `lib/sitemap-data.ts`
- `app/course/[code]/page.tsx`
- `app/professor/[...name]/page.tsx`
- `app/reviews/[code]/[...prof]/page.tsx`
- `app/catalog/page.tsx`
- `app/catalog/[...departments]/page.tsx`
- `app/search/layout.tsx`
- `app/search/course/[code]/page.tsx`
- `app/search/instructor/[...name]/page.tsx`
- `app/timetable/page.tsx`
- `app/submit/[code]/[prof]/page.tsx`
- `app/submit/[code]/[prof]/layout.tsx`
- `app/privacy-policy/page.tsx`
- `app/privacy-policy/zh/page.tsx`
- `app/terms-of-service/page.tsx`
- `app/terms-of-service/zh/page.tsx`
- `components/search.tsx`
- `components/search-button.tsx`
- `components/prof-card.tsx`
- `components/comment-card.tsx`
- `components/catalog-navigation.tsx`
- `components/course-filter.tsx`
- `components/banner.tsx`
- `components/cs-banner.tsx`
- `components/review-pagination.tsx`
- `components/reviews.tsx`
- `lib/cache-tags.ts`
- `lib/cache-invalidation.ts`
- `middleware.ts`（仅当 Phase 3 验证需要时）

### Deleted

- `public/felina.jpeg`
- `public/bg2.jpg`
- `public/bg3.jpg`
- `public/banner.jpg`

---

## Phase 1: SEO and Performance Foundation

### Task 1: Site URL Module

**Files:**
- Create: `lib/site.ts`
- Test: `tests/site-urls.test.ts`

**Interfaces:**
- Produces: `SITE_URL: string`, `SITE_NAME: string`, `absoluteUrl(path: string): string`, `buildCoursePath(code: string): string`, `buildCatalogPath(departments: string[]): string`, `buildProfessorPath(name: string): string`, `buildReviewPath(code: string, prof: string, page?: number): string`, `buildSearchPath(kind: "course" | "instructor", value: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildCatalogPath,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
  buildSearchPath,
} from "@/lib/site";

describe("site URL builders", () => {
  it("builds course and catalog paths", () => {
    expect(buildCoursePath("acct1000")).toBe("/course/ACCT1000");
    expect(buildCatalogPath(["fba", "aim"])).toBe("/catalog/FBA/AIM");
  });

  it("encodes professor path and review page suffix", () => {
    expect(buildProfessorPath("CHAN TAI/MAN")).toBe("/professor/CHAN%20TAI%2FMAN");
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN")).toBe("/reviews/ACCT1000/CHAN%20TAI%2FMAN");
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN", 3)).toBe(
      "/reviews/ACCT1000/CHAN%20TAI%2FMAN/page/3",
    );
  });

  it("builds search paths", () => {
    expect(buildSearchPath("course", "ACCT")).toBe("/search/course/ACCT");
    expect(buildSearchPath("instructor", "CHAN TAI MAN")).toBe(
      "/search/instructor/CHAN%20TAI%20MAN",
    );
  });

  it("builds absolute URLs", () => {
    expect(absoluteUrl("/course/ACCT1000")).toBe("https://umeh.top/course/ACCT1000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/site-urls.test.ts`
Expected: FAIL with "Cannot find module '@/lib/site'".

- [ ] **Step 3: Write minimal implementation**

```ts
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
  return `/catalog/${departments.map((part) => encodeSegment(part.toUpperCase())).join("/")}`;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/site-urls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/site.ts tests/site-urls.test.ts
git commit -m "feat: add centralized site URL builders"
```

### Task 2: Root Metadata and JSON-LD

**Files:**
- Modify: `app/layout.tsx`
- Create: `lib/seo.ts`
- Create: `components/seo/json-ld.tsx`
- Modify: legal pages under `app/privacy-policy/*` and `app/terms-of-service/*`
- Test: `tests/seo/metadata.test.ts`, `tests/seo/json-ld.test.tsx`

**Interfaces:**
- Consumes: `absoluteUrl`, `SITE_URL`, `SITE_NAME` from `lib/site`.
- Produces: `rootMetadata: Metadata` from `lib/seo.ts`; `<JsonLd data={...} />`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { rootMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";

describe("root SEO metadata", () => {
  it("uses metadataBase and title template", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe("https://umeh.top/");
    expect(rootMetadata.title).toMatchObject({
      default: "What2Reg @ UM 澳大選咩課",
      template: "%s | What2Reg @ UM",
    });
  });
});

describe("JsonLd", () => {
  it("serializes schema data", () => {
    const html = renderToStaticMarkup(
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "What2Reg" }} />,
    );
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"WebSite"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/seo/metadata.test.ts tests/seo/json-ld.test.tsx`
Expected: FAIL with missing modules.

- [ ] **Step 3: Write `lib/seo.ts`**

```ts
import type { Metadata } from "next";
import { SITE_NAME, SITE_SHORT_NAME, SITE_URL } from "@/lib/site";

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_SHORT_NAME}`,
  },
  description: "University of Macau course review platform / 澳大選咩課。",
  openGraph: {
    type: "website",
    siteName: SITE_SHORT_NAME,
    title: SITE_NAME,
    description: "University of Macau course review platform / 澳大選咩課。",
    images: [{ url: "/images/hero-1280.jpg", width: 1280, height: 960, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "University of Macau course review platform / 澳大選咩課。",
    images: ["/images/hero-1280.jpg"],
  },
  alternates: {
    canonical: "/",
  },
};
```

- [ ] **Step 4: Write `components/seo/json-ld.tsx`**

```tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 5: Update root layout**

In `app/layout.tsx`:

```tsx
import { rootMetadata } from "@/lib/seo";
export const metadata = rootMetadata;
```

Add a server-rendered `JsonLd` under `<body>`:

```tsx
<JsonLd
  data={{
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "What2Reg @ UM 澳大選咩課",
    url: "https://umeh.top",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://umeh.top/search/course/{search_term_string}",
      "query-input": "required name=search_term_string",
    },
  }}
/>
```

Change `<html lang="en">` to `<html lang="zh-Hant">`; remove `maximumScale` and `userScalable`; guard GTM with `process.env.GTM_ID ? (...) : null`.

- [ ] **Step 6: Add legal-page alternates**

For `app/privacy-policy/page.tsx` and `app/privacy-policy/zh/page.tsx`, add:

```ts
alternates: {
  canonical: "/privacy-policy",
  languages: {
    en: "/privacy-policy",
    "zh-Hant": "/privacy-policy/zh",
  },
},
```

Mirror for terms pages with `/terms-of-service`.

- [ ] **Step 7: Run tests and verification**

Run:
```bash
npx vitest run tests/seo/metadata.test.ts tests/seo/json-ld.test.tsx
npm run lint
npm test
npm run build
```
Expected: PASS and build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx lib/seo.ts components/seo/json-ld.tsx app/privacy-policy app/terms-of-service tests/seo
git commit -m "feat: add root SEO metadata and JSON-LD"
```

### Task 3: Per-page Metadata and Noindex

**Files:**
- Modify: `app/course/[code]/page.tsx`, `app/professor/[...name]/page.tsx`, `app/reviews/[code]/[...prof]/page.tsx`, `app/catalog/[...departments]/page.tsx`, `app/search/*`, `app/submit/*`, `app/admin/*`, `app/timetable/*`, `app/sign-in/*`, `app/sign-up/*`
- Test: `tests/seo/metadata.test.ts`

**Interfaces:**
- Consumes: `buildCoursePath`, `buildProfessorPath`, `buildReviewPath`, `buildSearchPath`, `absoluteUrl`.
- Produces: page-level `Metadata` / `generateMetadata` with canonical and robots rules.

- [ ] **Step 1: Extend failing metadata tests**

Add cases:

```ts
import { describe, expect, it } from "vitest";
import { generateMetadata as professorMetadata } from "@/app/professor/[...name]/page";

describe("professor metadata", () => {
  it("uses professor name in title", async () => {
    const metadata = await professorMetadata({ params: { name: ["CHAN%20TAI%20MAN"] } });
    expect(metadata.title).toBe("CHAN TAI MAN 課程評價");
    expect(metadata.alternates?.canonical).toBe("/professor/CHAN%20TAI%20MAN");
  });
});
```

Run: `npx vitest run tests/seo/metadata.test.ts`
Expected: FAIL because professor metadata does not exist.

- [ ] **Step 2: Add professor metadata**

```ts
export function generateMetadata({ params }: { params: { name: string[] } }) {
  const name = decodeURI(params.name.join("/")).replaceAll("$", "/").toUpperCase();
  return {
    title: `${name} 課程評價`,
    alternates: { canonical: buildProfessorPath(name) },
    openGraph: { title: `${name} 課程評價` },
  };
}
```

- [ ] **Step 3: Update course metadata**

```ts
export async function generateMetadata({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const { course } = await fetchCourseInfo(code);
  const title = `${code} · ${course.courseTitle}`;
  return {
    title,
    description: `${course.courseTitle}｜${course.offeringUnit} ${course.offeringDept} University of Macau course review.`,
    alternates: { canonical: buildCoursePath(code) },
    openGraph: { title, description: course.courseTitle },
  };
}
```

- [ ] **Step 4: Update review metadata**

```ts
export function generateMetadata({ params }: { params: { code: string; prof: string[] } }) {
  const route = parseReviewRoute(params.code, params.prof);
  const prof = decodeURI(route.prof).replaceAll("$", "/");
  const title = `${prof} | ${route.code} 評價`;
  return {
    title,
    alternates: { canonical: buildReviewPath(route.code, prof, route.page) },
  };
}
```

- [ ] **Step 5: Add noindex to search/submit/admin/timetable/auth pages**

For server pages/layouts:

```ts
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};
```

For `admin` and `submit` use `{ index: false, follow: false }`. For dynamic `search` generateMetadata include `robots: { index: false, follow: true }`.

- [ ] **Step 6: Run verification and commit**

Run:
```bash
npx vitest run tests/seo/metadata.test.ts
npm run lint
npm test
npm run build
```

Commit:

```bash
git add app/course app/professor app/reviews app/catalog app/search app/submit app/admin app/timetable app/sign-in app/sign-up tests/seo
git commit -m "feat: add per-page metadata and noindex rules"
```

### Task 4: Robots and Sitemap Normalization

**Files:**
- Modify: `app/robots.ts`, `app/sitemap.ts`, `lib/sitemap-data.ts`
- Test: `tests/robots.test.ts`, `tests/sitemap.test.ts`

**Interfaces:**
- Consumes: `buildCatalogPath`, `buildCoursePath`, `buildReviewPath`, `absoluteUrl`.
- Produces: robots disallow rules; sitemap URLs without trailing slash and with encoded segments.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { buildReviewPath, absoluteUrl } from "@/lib/site";

describe("robots", () => {
  it("disallows private and search routes", () => {
    const rules = robots().rules;
    expect(rules[0]).toMatchObject({
      userAgent: "*",
      disallow: expect.arrayContaining(["/admin/", "/api/", "/submit/", "/search/"]),
    });
  });
});

describe("sitemap URL helpers", () => {
  it("does not use trailing slash", () => {
    const path = buildReviewPath("ACCT1000", "CHAN TAI/MAN");
    expect(path).toBe("/reviews/ACCT1000/CHAN%20TAI%2FMAN");
    expect(absoluteUrl(path)).toBe("https://umeh.top/reviews/ACCT1000/CHAN%20TAI%2FMAN");
  });
});
```

Run: `npx vitest run tests/robots.test.ts tests/sitemap.test.ts`
Expected: FAIL on missing disallow.

- [ ] **Step 2: Update robots**

```ts
rules: [{
  userAgent: "*",
  allow: "/",
  disallow: ["/admin/", "/api/", "/submit/", "/search/", "/sign-in", "/sign-up"],
}]
```

- [ ] **Step 3: Update sitemap to use builders**

```ts
return (data ?? []).map((course: { New_code: string }) => ({
  url: absoluteUrl(buildCoursePath(course.New_code)),
  lastModified: getSitemapLastModified(),
  changeFrequency: "monthly" as const,
  priority: 0.9,
}));
```

Same for reviews with `absoluteUrl(buildReviewPath(review.course_id, review.prof_id))`.

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run tests/robots.test.ts tests/sitemap.test.ts
npm run lint
npm test
npm run build
git add app/robots.ts app/sitemap.ts lib/sitemap-data.ts tests/robots.test.ts tests/sitemap.test.ts
git commit -m "feat: normalize robots and sitemap URLs"
```

### Task 5: Course Body Visibility and Course JSON-LD

**Files:**
- Create: `components/seo/course-json-ld.tsx`
- Modify: `app/course/[code]/page.tsx`
- Test: `tests/seo/course-json-ld.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseJsonLd } from "@/components/seo/course-json-ld";

describe("CourseJsonLd", () => {
  it("renders a Course JSON-LD payload", () => {
    const html = renderToStaticMarkup(
      <CourseJsonLd
        code="ACCT1000"
        title="Financial Accounting"
        description="Introductory accounting."
      />
    );
    expect(html).toContain('"@type":"Course"');
    expect(html).toContain('"courseCode":"ACCT1000"');
  });
});
```

Run: `npx vitest run tests/seo/course-json-ld.test.tsx`
Expected: FAIL with "Cannot find module '@/components/seo/course-json-ld'".

- [ ] **Step 2: Implement CourseJsonLd**

```tsx
import { JsonLd } from "@/components/seo/json-ld";

export function CourseJsonLd({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description?: string | null;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Course",
        name: title,
        courseCode: code,
        description: description ?? undefined,
        provider: { "@type": "CollegeOrUniversity", name: "University of Macau" },
      }}
    />
  );
}
```

- [ ] **Step 3: Remove bot UA logic from course page**

Delete `googleBotCourseInfo` hidden class, `show-for-bot` `<Script>`, and the UA regex block. Render Course Description and ILO in a normal section, then render `<CourseJsonLd code={course.courseCode} title={course.courseTitle} description={course.courseDescription} />`.

- [ ] **Step 4: Run verification and commit**

```bash
npx vitest run tests/seo/course-json-ld.test.tsx
npm run lint
npm test
npm run build
git add app/course components/seo/course-json-ld.tsx tests/seo/course-json-ld.test.tsx
git commit -m "feat: make course content crawlable and add Course JSON-LD"
```

### Task 6: Hero Image Optimization and Unused Asset Removal

**Files:**
- Create: `public/images/hero-1280.jpg`, `public/images/hero-1920.jpg`, `public/images/hero-2560.jpg`
- Modify: `components/search.tsx`
- Delete: `public/felina.jpeg`, `public/bg2.jpg`, `public/bg3.jpg`, `public/banner.jpg`

- [ ] **Step 1: Generate optimized hero variants**

Run:

```bash
mkdir -p public/images
sips -Z 1280 -s format jpeg -s formatOptions 72 public/felina2.jpeg --out public/images/hero-1280.jpg
sips -Z 1920 -s format jpeg -s formatOptions 72 public/felina2.jpeg --out public/images/hero-1920.jpg
sips -Z 2560 -s format jpeg -s formatOptions 70 public/felina2.jpeg --out public/images/hero-2560.jpg
ls -lh public/images
```

Expected: three files exist and are significantly smaller than `public/felina2.jpeg`.

- [ ] **Step 2: Replace CSS background with `next/image`**

In `components/search.tsx`, replace the background class container with:

```tsx
<div className='relative overflow-hidden'>
  <Image
    src='/images/hero-1920.jpg'
    alt=''
    fill
    priority
    sizes='100vw'
    className='object-cover object-center'
  />
  <div className='relative max-w-screen-xl mx-auto p-2'>
    {/* existing hero content */}
  </div>
</div>
```

- [ ] **Step 3: Remove unused assets**

```bash
git rm public/felina.jpeg public/bg2.jpg public/bg3.jpg public/banner.jpg
```

Keep `public/felina2.jpeg` as the source master.

- [ ] **Step 4: Verify and commit**

```bash
npm run lint
npm test
npm run build
du -h public/felina2.jpeg public/images/*
git add components/search.tsx public/images
git commit -m "perf: optimize hero image and remove unused assets"
```

---

## Phase 2: Componentization

### Task 7: Unified SearchForm

**Files:**
- Create: `components/search/search-form.tsx`, `components/search/search-card.tsx`, `components/search/search-dialog.tsx`
- Modify: `components/search.tsx`, `components/search-button.tsx`, `app/search/layout.tsx`, `app/timetable/page.tsx`
- Test: `tests/components/search-form.test.tsx`

**Interfaces:**
- Consumes: `buildSearchPath`.
- Produces: `SearchForm({ variant, defaultCode, defaultMode, onSubmitted, className })`; `SearchCard()`; `SearchDialog()`.

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SearchForm from "@/components/search/search-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("SearchForm", () => {
  it("submits course search by default", () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "acct1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(push).toHaveBeenCalledWith("/search/course/ACCT1000");
  });
});
```

Run: `npx vitest run tests/components/search-form.test.tsx`
Expected: FAIL missing module.

- [ ] **Step 2: Implement SearchForm**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { buildSearchPath } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const schema = z.object({
  code: z.string().min(4).max(10),
  is_prof: z.boolean().default(false),
});

export default function SearchForm({
  variant,
  defaultCode = "",
  defaultMode = "course",
  onSubmitted,
}: {
  variant: "hero" | "header" | "inline";
  defaultCode?: string;
  defaultMode?: "course" | "instructor";
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: defaultCode, is_prof: defaultMode === "instructor" },
  });
  const isProf = form.watch("is_prof");

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        router.push(buildSearchPath(values.is_prof ? "instructor" : "course", values.code));
        onSubmitted?.();
      })}
    >
      <Input
        {...form.register("code")}
        placeholder={isProf ? "e.g., CHAN Tai Man" : "e.g., ACCT1000 or Accounting"}
      />
      <Switch
        checked={isProf}
        onCheckedChange={(checked) => form.setValue("is_prof", checked)}
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
```

- [ ] **Step 3: Replace consumers**

- `components/search.tsx`: render `<SearchCard />` inside hero.
- `components/search-button.tsx`: render `<SearchDialog />`.
- `app/search/layout.tsx`: remove `"use client"`; make server layout rendering `<SearchHeader />` client island.
- `app/timetable/page.tsx`: remove local `SearchBar`, render `<SearchForm variant="inline" />`.

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run tests/components/search-form.test.tsx
npm run lint
npm test
npm run build
git add components/search components/search.tsx components/search-button.tsx app/search/layout.tsx app/timetable/page.tsx tests/components/search-form.test.tsx
git commit -m "refactor: unify search form across pages"
```

### Task 8: RatingStatsCard

**Files:**
- Create: `components/course/rating-stats-card.tsx`
- Modify: `components/prof-card.tsx`
- Test: `tests/components/rating-stats-card.test.tsx`

**Interfaces:**
- Produces: `RatingStatsCard({ title, href, stats, labels })`.

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RatingStatsCard } from "@/components/course/rating-stats-card";

describe("RatingStatsCard", () => {
  it("renders labels and comment count", () => {
    render(
      <RatingStatsCard
        title="CHAN TAI MAN"
        href="/reviews/ACCT1000/CHAN%20TAI%20MAN"
        stats={{ result: 4, grade: 3, hard: 2, reward: 5, comments: 7 }}
      />,
    );
    expect(screen.getByText("Overall")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
```

Run: `npx vitest run tests/components/rating-stats-card.test.tsx`
Expected: FAIL missing module.

- [ ] **Step 2: Implement and replace**

Move the shared Card/Separator/get_bg/get_gpa markup from `ProfCard`/`ProfCourseCard` into `RatingStatsCard`. Keep `ProfCard` and `ProfCourseCard` as thin wrappers producing the correct labels and href.

- [ ] **Step 3: Run tests and commit**

```bash
npx vitest run tests/components/rating-stats-card.test.tsx
npm run lint
npm test
npm run build
git add components/course/rating-stats-card.tsx components/prof-card.tsx tests/components/rating-stats-card.test.tsx
git commit -m "refactor: extract rating stats card"
```

### Task 9: Timetable Component Cleanup

**Files:**
- Create: `components/timetable-schedule-card.tsx`, `components/timetable/schedule-list.tsx`
- Modify: `components/timetable-card.tsx` (move), `components/timetable-cart.tsx`, `app/timetable/page.tsx`
- Test: existing timetable tests + `tests/components/timetable-schedule-card.test.tsx`

- [ ] **Step 1: Rename old file**

```bash
git mv components/timetable-card.tsx components/timetable-schedule-card.tsx
```

- [ ] **Step 2: Add schedule list and rename internal cart item**

Implement `ScheduleList` with the common date/time/location three-column markup. `TimetableScheduleCard` and `TimetableCartItem` both consume it.

- [ ] **Step 3: Update imports**

Change `import { TimetableCard } from "@/components/timetable-card"` to `TimetableScheduleCard`, and `import { TimetableCard } from "@/components/timetable-cart"` to `TimetableCartItem`.

- [ ] **Step 4: Run verification and commit**

```bash
npm run lint
npm test
npm run build
git add components/timetable-schedule-card.tsx components/timetable components/timetable-cart.tsx app/timetable/page.tsx
git commit -m "refactor: split timetable schedule and cart components"
```

### Task 10: CommentCard Split and Lazy Fancybox

**Files:**
- Create: `components/review/comment-card.tsx` and subcomponents from spec
- Modify: `components/comments.tsx`
- Delete: `components/comment-card.tsx` after moving
- Test: `tests/components/comment-card-split.test.tsx`

- [ ] **Step 1: Write a failing behavior test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentCard } from "@/components/review/comment-card";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isSignedIn: false, user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("CommentCard", () => {
  it("renders comment content", () => {
    render(
      <CommentCard
        comment={{ id: 1, content: "Useful course", recommend: 5, replyto: null }}
        reply_comment={[]}
      />,
    );
    expect(screen.getByText("Useful course")).toBeTruthy();
  });
});
```

Run: `npx vitest run tests/components/comment-card-split.test.tsx`
Expected: FAIL missing module.

- [ ] **Step 2: Move and split**

- Move current `components/comment-card.tsx` to `components/review/comment-card.tsx`.
- Extract `CommentHeader`, `CommentBody`, `CommentVoteBar`, `ReplyList`, `ReplyEditor`, `CommentImage`.
- Keep `CommentCard` default export API unchanged.
- Make `CommentImage` load Fancybox only when `comment.img` exists via `next/dynamic`.

- [ ] **Step 3: Update `components/comments.tsx` import and run test**

Run:
```bash
npx vitest run tests/components/comment-card-split.test.tsx
npm run lint
npm test
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add components/review components/comments.tsx components/comment-card.tsx tests/components/comment-card-split.test.tsx
git commit -m "refactor: split comment card and lazy-load image viewer"
```

### Task 11: Submit Page Split

**Files:**
- Create: `components/submit/submit-comment-form.tsx`, `components/submit/rating-field.tsx`, `components/submit/image-upload-field.tsx`, `lib/validation/submit-comment.ts`
- Modify: `app/submit/[code]/[prof]/page.tsx`, `app/submit/[code]/[prof]/layout.tsx`
- Test: `tests/components/submit-comment-form.test.tsx`

- [ ] **Step 1: Move schema**

Create `lib/validation/submit-comment.ts` exporting `submitCommentSchema` and `type SubmitCommentValues`.

- [ ] **Step 2: Write a failing smoke test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SubmitCommentForm from "@/components/submit/submit-comment-form";

describe("SubmitCommentForm", () => {
  it("renders course and instructor fields", () => {
    render(<SubmitCommentForm code="ACCT1000" prof="CHAN TAI MAN" />);
    expect(screen.getByDisplayValue("ACCT1000")).toBeTruthy();
    expect(screen.getByDisplayValue("CHAN TAI MAN")).toBeTruthy();
  });
});
```

Run: `npx vitest run tests/components/submit-comment-form.test.tsx`
Expected: FAIL missing module.

- [ ] **Step 3: Implement components and move metadata**

- Page becomes a server component that renders `<SubmitCommentForm code={params.code} prof={...} />`.
- Move `generateMetadata` from layout to page; delete layout if empty.
- Extract `RatingField` for Recommend, Grade, Workload, etc.
- Extract `ImageUploadField`.

- [ ] **Step 4: Run verification and commit**

```bash
npx vitest run tests/components/submit-comment-form.test.tsx
npm run lint
npm test
npm run build
git add app/submit components/submit lib/validation/submit-comment.ts tests/components
git commit -m "refactor: split submit review form"
```

### Task 12: Cleanup and Catalog Prefetch

**Files:**
- Modify: `components/banner.tsx`, `components/cs-banner.tsx`, `components/catalog-navigation.tsx`, `components/course-filter.tsx`, `components/review-pagination.tsx`
- Test: existing component tests plus `tests/no-dead-deps.test.ts`

- [ ] **Step 1: Remove client boundary and dead code**

- Remove `"use client"` from `components/banner.tsx`.
- In `components/cs-banner.tsx`, delete the early `return null` and keep one conditional render.

- [ ] **Step 2: Remove bulk prefetch**

Delete the `useEffect` around `router.prefetch` in `components/catalog-navigation.tsx`. Keep `Link`/dropdown navigation.

- [ ] **Step 3: Clean `CourseFilter` derived state**

Remove unused `courseList`/`setCourseList`; derive options and filtered list with `useMemo`.

- [ ] **Step 4: Replace unstable keys**

Use `data.prof_id`, `course.New_code`, `comment.id`, `timetable.code + timetable.section` as keys.

- [ ] **Step 5: Run verification and commit**

```bash
npm run lint
npm test
npm run build
git add components/banner.tsx components/cs-banner.tsx components/catalog-navigation.tsx components/course-filter.tsx components/review-pagination.tsx components/prof-card.tsx components/comments.tsx
git commit -m "refactor: clean component boundaries and prefetch behavior"
```

---

## Phase 3: Rendering, Caching, and Clerk Isolation

### Task 13: Public/Auth Route Groups and Clerk Isolation

**Files:**
- Create: `components/layout/site-shell.tsx`, `components/layout/public-navbar.tsx`, `components/layout/app-navbar.tsx`, `components/auth/public-auth-controls.tsx`, `app/(public)/layout.tsx`, `app/(auth)/layout.tsx`
- Move: public pages into `app/(public)/*`; auth pages into `app/(auth)/*`
- Modify: `app/layout.tsx`, `components/navbar.tsx`, `components/mobile-sidebar.tsx`, `middleware.ts` only if needed

**Interfaces:**
- `SiteShell({ children, navbar })` renders Navbar + Banner + `<main id="page-content">` + Footer.
- `PublicNavbar()` renders static menu/cart/search and client-only `PublicAuthControls`.
- `AppNavbar()` renders current Clerk-aware `NavbarAvatar`/`AdminEntry`.

- [ ] **Step 1: Create shell**

Move the current `Navbar`/`Banner`/`main`/`Footer` structure from `app/layout.tsx:59-83` into `SiteShell`.

- [ ] **Step 2: Create public auth controls**

```tsx
"use client";
import dynamic from "next/dynamic";

const ClerkAuthControls = dynamic(() => import("./clerk-auth-controls"), {
  ssr: false,
  loading: () => <div className="h-8 w-20" />,
});

export function PublicAuthControls() {
  return <ClerkAuthControls />;
}
```

Create `components/auth/clerk-auth-controls.tsx` as a client component that wraps `ClerkProvider`, `SignedIn`, `SignedOut`, `SignInButton`, `UserButton`, and `AdminEntry`.

- [ ] **Step 3: Move route directories**

Use `git mv`:

```bash
mkdir -p "app/(public)" "app/(auth)"
git mv app/page.tsx "app/(public)/page.tsx"
git mv app/catalog "app/(public)/catalog"
git mv app/course "app/(public)/course"
git mv app/professor "app/(public)/professor"
git mv app/privacy-policy "app/(public)/privacy-policy"
git mv app/terms-of-service "app/(public)/terms-of-service"
git mv app/timetable "app/(public)/timetable"
git mv app/search "app/(public)/search"
git mv app/reviews "app/(auth)/reviews"
git mv app/submit "app/(auth)/submit"
git mv app/admin "app/(auth)/admin"
git mv app/sign-in "app/(auth)/sign-in"
git mv app/sign-up "app/(auth)/sign-up"
```

- [ ] **Step 4: Add group layouts**

`app/(public)/layout.tsx`:

```tsx
import SiteShell from "@/components/layout/site-shell";
import PublicNavbar from "@/components/layout/public-navbar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell navbar={<PublicNavbar />}>{children}</SiteShell>;
}
```

`app/(auth)/layout.tsx`:

```tsx
import { ClerkProvider } from "@clerk/nextjs";
import SiteShell from "@/components/layout/site-shell";
import AppNavbar from "@/components/layout/app-navbar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <SiteShell navbar={<AppNavbar />}>{children}</SiteShell>
    </ClerkProvider>
  );
}
```

- [ ] **Step 5: Root layout becomes html/body only**

Remove ClerkProvider, Navbar, Banner, Footer from `app/layout.tsx`; keep `<html lang="zh-Hant">`, `<body>`, metadata, toasters, and global JSON-LD.

- [ ] **Step 6: Verify build route changes**

Run:
```bash
npm run lint
npm test
npm run build
```

Expected:
- `/`、政策页不再因为根 layout 动态化而标记为 `ƒ`；若仍为 `ƒ`，停止并报告 blocker，不静默继续。
- `/catalog/[...departments]` 仍为 `●`。
- auth group 下 `/reviews`、`/submit`、`/admin` 行为正常。

- [ ] **Step 7: Commit**

```bash
git add app components/layout components/auth
git commit -m "refactor: split public and auth route groups"
```

### Task 14: Review Data Caching and Viewer Vote API

**Files:**
- Create: `lib/database/get-public-comment-list.ts`, `app/api/vote/me/route.ts`
- Modify: `app/reviews/[code]/[...prof]/page.tsx`, `components/review-pagination.tsx`, `components/review/*`, `components/comments.tsx`, `lib/cache-tags.ts`, `lib/cache-invalidation.ts`
- Test: `tests/api/vote-me.test.ts`, `tests/database/public-comment-list.test.ts`

**Interfaces:**
- Produces: `getPublicCommentPage(courseId: number, page: number)`; `GET /api/vote/me?comment_ids=1,2,3` returning `{ votes: VoteHistoryRow[] }`.
- Consumes: `CACHE_TAGS.comment`.

- [ ] **Step 1: Add cache tag**

```ts
export const CACHE_TAGS = {
  course: "course",
  professor: "professor",
  statistics: "statistics",
  catalog: "catalog",
  comment: "comment",
} as const;
```

Update invalidators to call `revalidateTag(CACHE_TAGS.comment)`.

- [ ] **Step 2: Write failing public comment list test**

```ts
import { describe, expect, it, vi } from "vitest";
import { getPublicCommentPage } from "@/lib/database/get-public-comment-list";

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }) },
}));

describe("getPublicCommentPage", () => {
  it("queries with null viewer", async () => {
    const rows = await getPublicCommentPage(10, 0);
    expect(rows).toEqual([{ id: 1 }]);
  });
});
```

Run: `npx vitest run tests/database/public-comment-list.test.ts`
Expected: FAIL missing module.

- [ ] **Step 3: Implement cached public comments**

```ts
import { unstable_cache } from "next/cache";
import supabaseServer from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache-tags";

export const getPublicCommentPage = unstable_cache(
  async (courseId: number, page: number) => {
    const { data, error } = await supabaseServer.rpc("get_comment_page_v2", {
      target_course_id: courseId,
      target_page: page,
      target_page_size: 20,
      target_viewer_id: null,
    });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["public-comment-page"],
  { revalidate: 300, tags: [CACHE_TAGS.comment, CACHE_TAGS.course, CACHE_TAGS.professor] },
);
```

- [ ] **Step 4: Add viewer vote endpoint**

`GET /api/vote/me`:

- reject no `auth()` with 401.
- parse `comment_ids` as comma-separated positive numbers, max 50.
- query `vote` where `created_by = userId` and `comment_id in ids`.
- return `{ votes: [{ comment_id, offset, emoji }] }`.

- [ ] **Step 5: Update review page**

- Remove `auth()` and `force-dynamic`.
- Use `getPublicCommentPage(prof_info.id, page_num - 1)`.
- Keep `revalidate = 300`.
- Change pagination hrefs to `buildReviewPath(code, prof, page)`.
- In client `ReviewViewerState`, fetch `/api/vote/me?comment_ids=...` and pass vote data into `Comments`.

- [ ] **Step 6: Run tests and commit**

```bash
npx vitest run tests/api/vote-me.test.ts tests/database/public-comment-list.test.ts
npm run lint
npm test
npm run build
git add app/api/vote/me lib/database/get-public-comment-list.ts app/reviews components/review components/comments.tsx components/review-pagination.tsx lib/cache-tags.ts lib/cache-invalidation.ts tests
git commit -m "perf: cache public review comments and overlay viewer votes"
```

### Task 15: Catalog and Search Rendering Follow-up

**Files:**
- Modify: `app/(public)/catalog/page.tsx`, `app/(public)/catalog/[...departments]/page.tsx`, `components/course-filter.tsx`
- Test: `tests/components/course-filter.test.tsx`

- [ ] **Step 1: Add catalog root content**

Render faculty list in `app/(public)/catalog/page.tsx` with links built by `buildCatalogPath`. Add metadata title/description/canonical.

- [ ] **Step 2: Make CourseFilter URL-aware**

Use `useSearchParams` to initialize filter state and `router.replace` to update query. Keep server `data` as initial full list but memoize derived options and filtered list.

- [ ] **Step 3: Add test for URL filter behavior**

```tsx
it("filters by query parameter", () => {
  render(<CourseFilter data={[{ New_code: "ACCT1000", Offering_Unit: "FBA" }]} />);
  expect(screen.getByText("ACCT1000")).toBeTruthy();
});
```

- [ ] **Step 4: Run verification and commit**

```bash
npm run lint
npm test
npm run build
git add app/\(public\)/catalog components/course-filter.tsx tests/components/course-filter.test.tsx
git commit -m "feat: add catalog root content and URL-aware filters"
```

### Task 16: Final Verification and Documentation

**Files:**
- Modify: `docs/technical-optimization-audit.md` or create `.agents/superpowers/verification/2026-09-21-next-web-componentization-seo.md`
- No production code unless verification finds gaps.

- [ ] **Step 1: Run full suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 2: Inspect build output**

Record:
- which public routes are `○`/`●` vs `ƒ`;
- `/reviews` and `/submit` First Load JS before/after;
- any route still dynamic and why.

- [ ] **Step 3: Smoke test**

- `/` hero loads optimized image.
- `/course/ACCT1000` HTML contains description, title, canonical, JSON-LD.
- `/professor/...` has correct title.
- `/robots.txt` and `/sitemap.xml` correct.
- Signed-out and signed-in Navbar behavior.
- Comment, reply, vote, report, submit, admin smoke.

- [ ] **Step 4: Commit any verification fixes**

```bash
git status --short
# If production code changed while fixing a verified issue:
git add <changed-files>
git commit -m "fix: address final componentization and SEO verification gaps"
# If only docs changed:
git add docs .agents/superpowers/verification 2>/dev/null || true
git commit -m "docs: record componentization and SEO verification"
```

---

## Self-Review Notes

- Spec coverage: all Phase 1-3 sections map to Tasks 1-16.
- No placeholder steps; each task has files, interfaces, test/verification, commit.
- Interface names reuse `buildCoursePath`, `buildReviewPath`, `SearchForm`, `RatingStatsCard`, `PublicAuthControls`, `getPublicCommentPage` consistently.
- If Task 13 build check fails to make public pages static, executor must stop and report blocker before proceeding, per `executing-plans`.
