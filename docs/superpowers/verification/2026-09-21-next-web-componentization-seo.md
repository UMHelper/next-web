# next-web Componentization and SEO Verification

> 日期：2026-09-21
> 分支：`feat/next-web-componentization-seo`
> Spec：`docs/superpowers/specs/2026-09-21-next-web-componentization-seo-design.md`
> Plan：`docs/superpowers/plans/2026-09-21-next-web-componentization-seo.md`

## Commands Run

```bash
npm run lint
npm test
npm run build
```

## Results

- `npm run lint`: 0 warnings / 0 errors.
- `npm test`: 46 test files, 122 tests, all passed.
- `npm run build`: passed.

## Build Route Highlights

- `/`: static `○` (was dynamic `ƒ` before Clerk client-boundary split).
- `/catalog`: static `○`.
- `/catalog/[...departments]`: SSG `●`, 44 catalog paths.
- `/privacy-policy`, `/privacy-policy/zh`, `/terms-of-service`, `/terms-of-service/zh`: static `○`.
- `/timetable`: static `○`.
- `/reviews/[code]/[...prof]`: dynamic `ƒ`, First Load JS reduced from 243 kB to 206 kB after lazy-loading Fancybox.
- `/submit/[code]/[prof]`: dynamic `ƒ`, First Load JS 173 kB.
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`: static `○`.

## SEO Changes Verified

- Root metadata has `metadataBase`, title template, description, Open Graph, Twitter Card, canonical.
- Course page renders Course Description / ILO in normal HTML and includes `Course` JSON-LD.
- Professor, course, review, catalog pages have canonical metadata.
- Search, submit, admin, sign-in/up, timetable have noindex metadata.
- `robots.txt` disallows `/admin/`, `/api/`, `/submit/`, `/search/`, `/sign-in`, `/sign-up`.
- Sitemap URLs use centralized `lib/site.ts` builders with encoded path segments and no trailing subpath slash.
- Homepage hero uses optimized `public/images/hero-*.jpg` instead of the 4 MB `felina2.jpeg` CSS background.

## Componentization Changes Verified

- `SearchForm` is shared by homepage, navbar dialog, search header, and timetable.
- `RatingStatsCard` is shared by `ProfCard` and `ProfCourseCard`.
- `TimetableScheduleCard` and `TimetableCartItem` have distinct names.
- `CommentCard` moved to `components/review/comment-card.tsx`; Fancybox is dynamically imported.
- Submit page metadata/form split into `components/submit/submit-comment-form.tsx` and `lib/validation/submit-comment.ts`.
- Catalog root now renders a faculty index instead of empty content.

## Remaining Follow-up

- `CourseFilter` is still client-side full-list filtering; URL-driven filtering and server pagination remain a follow-up optimization.
- Review page pagination still uses `?page=`; path-based `/page/{n}` canonical pagination remains a follow-up.
- Manual signed-in smoke test for Clerk client-boundary auth controls is recommended before deploy.
