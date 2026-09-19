# Phase 2 SSR / Bundle Verification — 2026-09-19

## Status

Phase 2A / 2B / 2C are implemented and committed locally. Not pushed (per request, to avoid triggering a build).

## Commits

- `27ad3a1 perf: render masonry content on the server and drop bbs dead code`
- `57735fb perf: lazy load timetable scheduler`
- `43a1ed6 perf: replace sparkles interval and remove dead dependencies`

## Commands run

- [x] `npm run test` — 21 files / 49 tests passed
- [x] `npm run lint` — no warnings or errors
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 60 static pages generated
- [x] Isolated `npm ci --ignore-scripts` — passed without `--legacy-peer-deps`

## Bundle before / after

| Route | Before route | Before First Load | After route | After First Load |
|---|---:|---:|---:|---:|
| `/timetable` | 410 kB | 555 kB | 3.46 kB | 149 kB |
| `/reviews/[code]/[...prof]` | 47.4 kB | 264 kB | 49.4 kB | 212 kB |
| shared First Load JS | — | 87.5 kB | — | 87.6 kB |

## Behavior verification

- [x] Masonry renders children into server HTML (`tests/components/masonry.test.tsx`)
- [x] No source references to `bbs-updates` / `BBSAd` (`tests/no-bbs-imports.test.ts`)
- [x] Timetable event builder handles schedules and missing schedules (`tests/timetable-events.test.ts`)
- [x] No `setInterval` in `SparklesText`; dead dependencies removed (`tests/no-dead-deps.test.ts`)
- [x] Build-time catalog generation still passes
- [x] `axios`, `embla-carousel-react`, `motion`, `framer-motion`, `@radix-ui/themes`, `three`, `hastscript` removed

## Manual smoke checklist (pending browser/deployed verification)

- [ ] Comments, course, professor, catalog, search cards still render and are present before hydration
- [ ] Timetable: empty cart does not load scheduler chunk; cart with events renders week view
- [x] SparklesText removed entirely; search hero and Offered badges use plain text
- [ ] Mobile catalog/comment layout under CSS columns
- [ ] No unexpected ordering regressions from Masonry → CSS columns
