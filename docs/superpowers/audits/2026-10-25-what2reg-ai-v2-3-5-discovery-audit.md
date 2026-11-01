# What2Reg AI — V2.3.5 Discovery Audit

**Repository:** `/Users/thomaswu/workspace/next-web`  
**Branch / HEAD:** `feat/global-assistant-v2` @ `6c956a7`  
**Audit date:** 2026-10-25  
**Mode:** Read-only repository and documentation audit. No application source, tests, prompts, schemas, migrations, or configuration were changed. No live model calls, browser sessions, or data mutations were performed.

> **Evidence limits.** The real student transcript named in the brief is **not present in this workspace**. Its observations are treated as supplied product evidence, not as independently reproduced turns. The repository contains no saved production logs, prompts, replies, or conversation records, and production environment values are not committed. Claims below therefore distinguish source-verified behavior from interpretation. Token counts are character-based estimates, not provider-reported usage.

---

## 1. Executive Summary

### Overall diagnosis

What2Reg AI is not primarily failing because DeepSeek is too weak. It is failing because a capable model is being asked to behave like a state machine through a 20,319-character procedural prompt, while the application withholds the structured state, discovery tools, and feedback it would need to behave intelligently.

The strongest description is **a deterministic academic data platform wrapped in an over-specified conversational layer**:

- The platform already owns high-quality catalog, instructor, review, section, and timetable data, plus a deterministic conflict engine.
- The assistant layer is heavily orchestrated: deterministic page context, course referents, timetable digests, preview scenario resolution, and rich renderers.
- But the model's instructions encode product policy in prose, contradict each other, and make rich UI opt-in by exact phrasing.
- The tools can answer one-course-at-a-time questions but cannot discover candidates under real planning constraints such as weekday, time window, rating, difficulty, workload, or exam format.
- Conversation state lives only in browser memory, is truncated to eight prior user turns, loses old tool results, and rejects requests over 30 user turns.
- The assistant has no server-visible notion of a rendered card, a student preference ledger, or a stable conversation identity.
- Rate limits and execution settings are deployment-only, while the quota unit is an internal model run rather than a student turn, so a single turn can consume several quota units.

### Major strengths

1. **Read-only grounding is real and layered.** Clerk authentication and access checks guard every CopilotKit request ([app/api/copilotkit/[[...slug]]/route.ts:123-137](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L123)), the assistant tool list contains no mutating academic operations, and a source-level read-only guard test exists ([tests/assistant/read-only-planner.test.ts](file:///Users/thomaswu/workspace/next-web/tests/assistant/read-only-planner.test.ts)). Supabase service-role access is server-only ([lib/supabase/server.ts:1-5](file:///Users/thomaswu/workspace/next-web/lib/supabase/server.ts#L1)).
2. **The timetable foundation is unusually strong.** Saved plans are local-first with server sync and optimistic revisions; timetables are analyzed deterministically for conflicts, gaps, day parts, and unscheduled sections ([lib/timetable/analysis.ts](file:///Users/thomaswu/workspace/next-web/lib/timetable/analysis.ts)); the assistant receives a capped digest rather than raw plan data ([lib/assistant/timetable-context.ts:14-15](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-context.ts#L14)); saved-versus-preview scenario resolution is deterministic ([lib/assistant/timetable-scenario.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-scenario.ts)).
3. **The rich UI primitives are good.** Search results, course detail, section cards, catalog filtering, and a compact timetable preview all exist and are driven by typed parsers rather than free-form model HTML.
4. **Safety and operational boundaries are mostly deliberate.** Approved access modes, fail-closed rate limiting, body/message caps, prohibited system/developer roles, telemetry without prompt/reply logging, and a dev-only rate-limit bypass all show security awareness.
5. **The automated suite is broad for plumbing.** It proves authentication, access, tool wiring, schema validation, prompt presence, deterministic helpers, and jsdom rendering. It does not prove academic advice quality, but it is a real foundation.

### Blockers

| Blocker | Why it matters | Strongest evidence |
|---|---|---|
| Contradictory review instructions | The model is told to read reviews before recommending, and also not to read them unless asked what reviews say | Prompt rules 18, 26, and final paragraph: [lib/assistant/prompt.ts:20,26,37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L20) |
| Presentation is phrase-gated and unverified | The model can receive `accepted` from `present_response` while no card exists; the student sees no failure | [lib/assistant/presentation.ts:56-102,195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L56); [components/assistant/assistant-chat-view.tsx:185](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat-view.tsx#L185) |
| No constraint-aware discovery | `search_catalog` cannot filter by day, time, rating, difficulty, workload, exam format, or saved-plan conflict; section lookup is one instructor at a time | [lib/assistant/tool-schemas.ts:16-30](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L16); [lib/mcp/data/get-course-sections.ts:122-139](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-sections.ts#L122) |
| Long-session amnesia | Only the current plus eight prior user turns survive; older tool results shrink to 200 characters; there is no persistence | [lib/assistant/conversation.ts:3-5,60-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3); [components/assistant/assistant-chat.tsx:102-109](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L102) |
| Error flattening | Tool failures are reported to the model as "no matching data"; the model is instructed to say the same, even when a different search succeeded | [lib/assistant/tools.ts:61,69-88](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L61); [lib/assistant/prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5) |
| Quota unit is a run, not a turn | `navigate` and `filter_catalog_results` trigger follow-up runs; every run consumes hourly and daily quota, and failed runs are not refunded | [app/api/copilotkit/[[...slug]]/route.ts:90-114](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L90); [components/assistant/use-catalog-results-tool.tsx:104-119](file:///Users/thomaswu/workspace/next-web/components/assistant/use-catalog-results-tool.tsx#L104) |

### Recommendations in one page

1. **Refactor the instruction architecture before touching the model.** Replace procedural policy with a small principle-based core plus deterministic enforcement. Do not write the replacement prompt during this audit.
2. **Make presentation a state contract, not a phrase list.** The model should express presentation intent semantically; the renderer should own mounting, deduplication, and visibility, and the tool should return a truthful receipt (including "no matching lookup").
3. **Add one bounded read-only planning-discovery capability.** It should accept day/time/rating/difficulty/sample-size/offered constraints and return capped candidate courses with matching sections and plan-conflict status. Extend existing tables/RPCs; do not add a framework.
4. **Make academic semantics machine-readable.** Put scale direction, sample size, truncation, term, and "data unavailable" next to the data. Never require the model to remember a prose scale across eight turns.
5. **Separate durable planning state from volatile facts.** Persist explicit goals/preferences/decisions; refresh catalog and timetable facts every turn; never persist a stale timetable as truth.
6. **Fix quota accounting and make bounded runtime settings administrative.** Charge one unit per user turn, not per internal follow-up; expose safe quota/model/budget settings through the existing admin boundary.
7. **Rebuild verification around student journeys.** Add planning-quality, preference-consistency, long-session, browser, and cost assertions. Then benchmark the model. A model swap now would confound prompt, tool, and context defects.

**Bottom line:** V2.3.5 should be a correctness and capability release. It should not be a visual reskin, a keyword expansion, a larger prompt, or a model replacement.

---

## 2. Current Project State

### 2.1 Repository state

| Item | Verified state |
|---|---|
| Branch | `feat/global-assistant-v2` |
| HEAD | `6c956a7 fix(assistant): harden V2.3 scenario context and lifecycle tests` |
| Relationship to `dev` | 70 commits ahead, 3 commits behind; **not merged** |
| Working tree | Modified: `.env.example`, `lib/database/get-course-info.ts`, `lib/rate-limit.ts`, `tests/rate-limit.test.ts` |
| Audit changes | Only this report was created under `docs/superpowers/audits/` |
| Production configuration | Not committed and not read; deployment values are not verifiable from the repository |

The uncommitted changes are pre-existing, not audit edits:

- `.env.example` and `lib/rate-limit.ts` add a development-only `DISABLE_RATE_LIMIT=1` bypass guarded by `NODE_ENV !== "production"` ([lib/rate-limit.ts:19-21,56](file:///Users/thomaswu/workspace/next-web/lib/rate-limit.ts#L19)).
- `lib/database/get-course-info.ts` changes the `course_catalog` error path to log and fall back to `course_noporf`.
- `tests/rate-limit.test.ts` covers the bypass.

The fallback is relevant to audit findings because it changes whether a catalog read failure can be distinguished from a legitimate empty or missing result. It must be reviewed and committed or reverted deliberately before V2.3.5 work begins.

### 2.2 Stack and deployment

| Layer | Technology | Version / evidence |
|---|---|---|
| Application | Next.js App Router | 15.5.28 (`package.json:79`) |
| UI | React / React DOM | declared `^18.2.0`, installed 18.3.1 |
| Language | TypeScript | 5.2.2 |
| AI runtime | CopilotKit React Core / Runtime v2 | 1.79.1 |
| Model SDK | `@ai-sdk/deepseek` | 2.0.76; model `deepseek-flash` |
| Auth | Clerk | `@clerk/nextjs` 7.9.10 |
| Data | Supabase JS | declared `^2.38.4`, installed 2.94.1; service-role access server-only |
| Validation | Zod | 3.25.76 installed (`^3.22.2`) |
| Deployment | Cloudflare Workers via OpenNext | `@opennextjs/cloudflare` 1.16.6, Wrangler 4.62.0 |
| Tests | Vitest | 2.1.9; jsdom for component tests |

Deployment builds with `--dangerouslyUseUnsupportedNextVersion`; Next 15.5.28 is outside the officially supported OpenNext matrix. This is an operational risk, not an assistant-specific defect.

### 2.3 Verified implementation history

The brief's V1 → V2.3 history is directionally accurate but not identical to the actual commit and verification record.

| Phase | Evidence | What shipped | Verification status |
|---|---|---|---|
| V1 | Plan `c46bd59`; implementation `f3c47c5`–`b21a386` | `/timetable` pilot panel, DeepSeek through CopilotKit, five read-only MCP tools, browser conflict check, access modes, rate limits, history shaping, no persistence | Manual acceptance section was left unfilled; verification records are incomplete |
| V1-A | `9b01ca7`–`b1e9a66` | Global mount, desktop gate, panel lifecycle, page-neutral prompt | Preview and all 11 browser checks not run |
| V1-B | `feedfc7`, `afe4ed4` | URL→page context, context publication, prompt rule | All seven signed-in checks unobserved |
| V1-C | `1b30a12`–`37b1fa4` | Allowlisted `navigate`, existence checks, landing confirmation, one navigation per message | All 17 acceptance scenarios unobserved |
| V1-D | `9ebbf85`, `56b1bf4`, `deb63e0` | Narrow-panel rule, per-step metrics, preview deploy | Browser checklist not run |
| V1-E | `5c8ca13`–`f2ee52f` | Semantic action policy, navigation clarification, Korean/Japanese hints, eval harness | S4 language gate failed at 97/108; phase 2 concluded "V2 readiness: Not yet" |
| V2.0 | `c8668c3`–`46d4fab` | `search_catalog` parser, course/instructor cards, headless-chat rendering | No dedicated V2.0 verification document |
| V2.1 | `b5556d2`–`454263c` | Course-detail/section cards, All/Offered filter, result sets, deterministic referents, activity rows | 232 files / 1749 tests reported; browser A–E unverified; later P1 ordinal fixes |
| V2.2 | `78b0cce`–`d44d8e5` | Text-first default, opt-in cards, Markdown comparisons, discussed-course follow-ups, no comparison widgets | Live presentation first missed, then tuned to 39/39; holdout 10/10; browser partly unverified |
| V2.3 | Spec `8fe9be8`; code `1d9a18a`–`d009d8a` | Live timetable digest, server conflict tools, preview cards, read-only guard, eval suite | Initial release blocked on live eval/browser; later conversation scores 66.7–77.8%, below 90% |
| V2.3 scenario patch | `a31c962`, `6c956a7` | Saved-versus-preview scenario referents, change/morning conflicts, lifecycle tests | Best scenario runs 9/9, cleanup run 6/9; last document calls it an engineering checkpoint, not final acceptance |
| V2.3.5 | None | No branch, commit, tag, plan, or code uses this label | — |
| V2.4 / V3 | None | No implementation; five V2.3 documents say V2.4 not started | — |

**Important:** V2.1 in the brief was described as "page awareness, navigation," but those capabilities actually landed in V1-B/V1-C. V2.1 delivered rich cards, referent correctness, filtering, activity rows, and UX compaction. The assistant's core request path has grown by accretion; no prompt-consolidation attempt exists in the record.

### 2.4 Documentation drift that affects planning

The assurance documents are not a reliable description of HEAD:

| Claim in documentation | HEAD reality | Evidence |
|---|---|---|
| `maxSteps` is 5 | 8 | [lib/assistant/agent.ts:25](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L25) |
| Output budget is 1200 | Default and both deployed workers use 2000; `.env.example` still says 1200 | [lib/assistant/config.ts:29](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L29); [wrangler.jsonc:80,123](file:///Users/thomaswu/workspace/next-web/wrangler.jsonc#L80); [.env.example:66](file:///Users/thomaswu/workspace/next-web/.env.example#L66) |
| Five academic tools | Nine academic tools plus `present_response`, two timetable tools, and two frontend tools | [lib/assistant/tools.ts:106-252](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L106) |
| `search_catalog` has no offered-only filter | `offeredOnly` is supported | [lib/assistant/tool-schemas.ts:29](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L29) |
| V2.3 conversation acceptance is settled | Documents disagree: 77.8%, 8–9/9, then 6/9; test counts also disagree | V2.3 verification documents |

This matters for V2.3.5: any plan based on the old documents will understate the current step budget, overstate the verified conversation quality, and miss post-V2.3 tool additions.

---

## 3. Platform Architecture

### 3.1 High-level shape

```text
Browser (Next.js App Router, React 18, CopilotKit client)
  ├─ Catalog / course / professor / reviews / search / submit
  ├─ Timetable planner (React context + localStorage, local-first)
  │    └─ server sync → /api/timetable/plans → Supabase timetable_plan
  ├─ Compare / share / command palette / admin console
  └─ Assistant panel (desktop >= 1024px)
       ├─ /api/assistant/access
       └─ /api/copilotkit
            ├─ Clerk auth + canUseAssistant
            ├─ rate limit → Supabase consume_rate_limit
            ├─ CopilotKit runtime + BuiltInAgent (DeepSeek)
            ├─ server tools → lib/mcp/data + lib/assistant/data
            └─ frontend tools (navigate, filter_catalog_results)

Server data
  ├─ Supabase service role (server-only)
  │    ├─ course_noporf / course_catalog / course_equivalences
  │    ├─ prof_with_course (aggregates per course × instructor)
  │    ├─ comment / vote / reports
  │    ├─ timetable_plan (owner_clerk_id)
  │    ├─ app_config / assistant_testers
  │    └─ admin_users / admin_audit_log / request_rate_limits
  └─ Cached reads: unstable_cache + tags (300/3600s), R2/D1 OpenNext caches
```

### 3.2 Platform capabilities

| Capability | Implementation | Relevant assistant reuse |
|---|---|---|
| Course catalog and detail | `course_noporf`, `course_catalog` view, aliases/equivalences | Reused through `lib/mcp/data/get-course.ts` |
| Instructor profiles | `prof_with_course`, `get_instructor` data adapter | Reused, but only by exact instructor name |
| Reviews and ratings | `comment`, visibility RPC `get_comment_page_v2`, aggregates in `prof_with_course` | Reused; no per-review structured difficulty/grade/workload |
| Search / filter / sort / pagination | Catalog RPCs + PostgREST path in `lib/assistant/data/search-catalog.ts` | Reused with a different filter surface than the public UI |
| Sections / meeting times | `get_schedule_list` current-term RPC | Reused one instructor at a time |
| Timetable planner | Local-first store, conflict analysis, saved/shared plans | Conflict engine reused; planner URL/search helpers not reused |
| Share / compare | Share tokens, reader polling, common-free computation | `computeCommonFree` not reused by the assistant |
| Auth / authorization | Clerk; platform admins from env; DB admins; tester emails | Reused |
| Admin console | Reports, comments, courses, notes, update, admins, assistant access | Only access mode is assistant-configurable |
| MCP server | Five read-only tools at `/mcp`, Clerk OAuth scope `umhelper:read` | Separate surface; shares data adapters with the assistant |
| AI assistant | CopilotKit + DeepSeek + deterministic context helpers | Subject of this audit |

### 3.3 Data ownership map

| Data | Owner / source | Write path | Assistant read path |
|---|---|---|---|
| Course metadata | UM Open Data catalog, synced into `course_noporf` | Admin sync / GitHub Action | `lib/mcp/data/get-course.ts`, search adapters |
| Course aliases/equivalences | `course_equivalences`, `course_catalog` | Admin import | `resolveCourseAlias`, `aka` |
| Instructor aggregates | `prof_with_course`, refreshed from visible comments | Comment write RPC | `get_course`, `get_instructor` |
| Reviews | User-submitted `comment` rows | Comment/vote/report APIs | `get_comment_page_v2` through `lib/mcp/data/get-course-reviews.ts` |
| Sections / schedule | UM timetable workbook via admin update pipeline → offer/schedule tables | Admin update pipeline | `get_schedule_list` through `get_course_sections` |
| Saved timetable | Browser localStorage + Supabase `timetable_plan` | Planner sync API | Client-published digest in model context; server conflict tools use the parsed digest |
| App configuration | `app_config` | Admin API with audit | `getAppConfig`, access resolver |
| Rate limits | `request_rate_limits` | `consume_rate_limit` RPC | Assistant route |
| Admin identity | Env platform admins + `admin_users` | Admin API / DB | Admin routes |

The assistant does **not** read the saved timetable directly from `timetable_plan`. It uses the browser-supplied digest and section payload. That is appropriate for freshness, but it means tool correctness depends on a trustworthy, well-shaped client context rather than a server-side plan read ([lib/assistant/agent.ts:39-77](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L39); [lib/assistant/timetable-tools.ts:47-68](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-tools.ts#L47)).

### 3.4 Frontend versus server responsibilities

| Responsibility | Where it lives |
|---|---|
| Identity, access, rate limits, request size, turn cap | Server route |
| Academic reads and data projection/truncation | Server tools |
| Prompt, model choice, step budget | Server agent |
| Page context, timetable plan, result-set filter state | Browser |
| Course/section/timetable rendering | Browser renderers |
| Presentation claim planning | Browser (`planRichBlocks`) using calls/results from the current turn |
| Conversation history | Browser memory only; re-sent with every request |
| Preferences / planning goals | Nowhere durable |

### 3.5 Existing capabilities the assistant could reuse but does not

| Capability | Location | Why it matters |
|---|---|---|
| Common-free-slot computation | `lib/timetable/common-free.ts:41-66` | Directly useful for "find a course that fits my free time" |
| Full catalog filter state/AND logic | `lib/course-filters.ts:36-73` | The assistant reimplements a narrower filter set |
| HTTP catalog search | `app/api/timetable/catalog/search/route.ts:9-47` | Existing Clerk-gated search surface; assistant bypasses it |
| Command-palette fuzzy search | `app/api/command-palette/route.ts:53-80` | Fast discovery/ranking for ambiguous names |
| Popular courses and statistics | `lib/database/get-popular-courses.ts`, `get-statistics.ts` | Could support proactive suggestions; currently unused |
| Planner query serialization | `lib/timetable/planner-query.ts:21-48` | Could deep-link a proposed plan or section filter |
| Public comment page projection | `lib/database/get-public-comment-list.ts` | Alternative review source, not needed for assistant caps |

The platform is therefore not data-poor. The assistant surface is capability-poor relative to the platform's own primitives.

### 3.6 Product boundaries that must stay explicit

The platform has **no** structured prerequisite data, degree-audit rules, exam format (midterm/final), seat availability, historical offering patterns beyond the current term, or instructor teaching preferences. The prompt correctly says prerequisites are unavailable ([lib/assistant/prompt.ts:10](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L10)). It does **not** consistently enforce the same honesty for exam format, and no schema can support E2E-04's no-midterm/no-final distinction. V2.3.5 must not pretend these data exist.

---

## 4. AI Runtime Architecture

### 4.1 End-to-end execution flow

1. **Launcher and access.** The global launcher is mounted only at `min-width: 1024px` ([components/assistant/desktop-assistant-gate.tsx:5-21](file:///Users/thomaswu/workspace/next-web/components/assistant/desktop-assistant-gate.tsx#L5)). It fetches `/api/assistant/access`, resets state when the Clerk user changes, and suppresses itself on admin, OAuth, sign-in, and sign-up routes ([components/assistant/assistant-launcher.tsx:14-92](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-launcher.tsx#L14)).
2. **Panel and provider.** Opening the panel dynamically mounts `AssistantPanel`, which creates `CopilotKitProvider` with `runtimeUrl="/api/copilotkit"` ([components/assistant/assistant-panel.tsx:160-180](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-panel.tsx#L160)). The provider is not at the root, but it stays mounted while the panel component remains open; closing the panel does not unmount `AssistantTools` ([components/assistant/assistant-panel.tsx:39-43](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-panel.tsx#L39)).
3. **Context registration.** The panel registers page context, timetable digest, timetable previews, catalog result sets, and discussed courses; it registers `navigate`, `filter_catalog_results`, and rich renderers ([components/assistant/assistant-panel.tsx:43-70](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-panel.tsx#L43); [components/assistant/use-timetable-context.tsx:40-41](file:///Users/thomaswu/workspace/next-web/components/assistant/use-timetable-context.tsx#L40)).
4. **Student send.** `assistant-chat.tsx` appends a user message to the in-memory agent and calls `copilotkit.runAgent({ agent })` ([components/assistant/assistant-chat.tsx:79-96](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L79)). The full agent message list is sent to the route.
5. **Request gate.** `handleRun` reads at most 256 KB, validates at most 200 messages, rejects more than 30 user turns with 409, consumes hour/day quota, and shapes history ([app/api/copilotkit/[[...slug]]/route.ts:78-120](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L78)).
6. **Agent construction.** Every request creates a new `BuiltInAgent` with the static prompt, 12 server tools, DeepSeek model, `maxSteps: 8`, configured output tokens, and thinking options ([lib/assistant/agent.ts:25-38](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L25)).
7. **Context middleware.** Before the model runs, middleware:
   - resolves the latest course referent from messages/page/result sets;
   - replaces raw timetable context with a capped deterministic digest;
   - resolves the saved-versus-preview timetable scenario;
   - appends script/language hints and the two referent contexts.
8. **Model loop.** The agent can call server tools or frontend tools. Frontend tools with `followUp: true` resolve in the browser, then CopilotKit starts another run request; that follow-up is a new HTTP request and is charged again.
9. **Rendering.** The client groups messages into turns. `planRichBlocks` decides which rich blocks to mount from the tool calls and results in that turn. Search/filter/preview are always rich; course detail/sections require a same-turn `present_response` claim that matches a lookup ([lib/assistant/presentation.ts:195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L195)).
10. **Persistence.** None. Messages live in the CopilotKit client registry; reload, new tab, or user change loses them.

### 4.2 Control boundaries

| Decision | Current owner | Consequence |
|---|---|---|
| Who may use the assistant | Server | Strong |
| How many runs per hour/day | Server | Strong enforcement, wrong unit (run not turn) |
| Which academic facts are read | Server tools | Strong read-only boundary; incomplete discovery |
| What the model sees as history | Server shaping | Loses old facts silently |
| What the model sees as page/timetable state | Browser context + server middleware | Fresh, but client-supplied |
| What counts as a course referent | Deterministic server module | Good for common cases; regex-limited |
| Whether to call a tool | Model | Prompt/procedure-dependent |
| Whether a card is rendered | Browser, based on model claim | Model cannot observe result |
| Whether a card exists in the model's belief | Model prose/tool `accepted` | Can diverge from UI |
| Conversation identity | Browser random thread only | Not durable, not addressable |
| Student preferences | Nowhere | Lost or inferred inconsistently |

The critical gap is the row pair "whether a card is rendered" and "whether a card exists in the model's belief." The system has no feedback loop between them.

### 4.3 Request and execution budget

| Limit | Value | Source |
|---|---|---|
| Request body | 256 KiB | [lib/assistant/conversation.ts:3](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3) |
| Messages per request | 200 | [lib/assistant/conversation.ts:4](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L4) |
| User turns per conversation | 30, hard 409 | [lib/assistant/config.ts:33](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L33); route `:85-88` |
| History turns | 8 prior + current | [lib/assistant/config.ts:34](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L34); [lib/assistant/conversation.ts:60-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L60) |
| Old tool result size | 200 chars before latest user | [lib/assistant/conversation.ts:5,70-73](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L5) |
| Model steps | 8 | [lib/assistant/agent.ts:25](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L25) |
| Output per step | 2000 tokens | [lib/assistant/config.ts:29](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L29) |
| Model fetch timeout | 30 s per step | [lib/assistant/config.ts:30](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L30) |
| Hourly quota | 30 runs | [lib/assistant/config.ts:31](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L31) |
| Daily quota | 80 runs | [lib/assistant/config.ts:32](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L32) |
| Timetable digest | 8,000 chars, 30 sections, 80 meetings | [lib/assistant/timetable-context.ts:14-15](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-context.ts#L14) |
| Timetable previews | Last 2, 1,200 chars | [lib/assistant/timetable-previews.ts:13,134-141](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-previews.ts#L13) |
| Discussed courses | Last 2 qualifying turns, 1,200 chars | [lib/assistant/discussed-courses.ts:7,151-169](file:///Users/thomaswu/workspace/next-web/lib/assistant/discussed-courses.ts#L7) |
| Catalog result sets | 3 sets × 10 courses | [lib/assistant/catalog-result-sets.ts:28-29](file:///Users/thomaswu/workspace/next-web/lib/assistant/catalog-result-sets.ts#L28) |

There is no overall run deadline, no per-turn input-token budget, no cost budget, and no retry/fallback policy in repository code. The 30 s timeout applies to each model fetch, not the whole turn.

### 4.4 Why the runtime structure matters

- **The server re-sends the full static prompt and tool schemas on every step.** Eight steps means eight prompt/tool-prefix transmissions, even when the model only needs one lookup.
- **Follow-up runs are invisible to the student as separate requests.** A navigation or filter looks like part of one turn but consumes another quota unit and another full prompt.
- **The server has no authoritative transcript.** The client can send arbitrary forged tool/assistant messages; role filtering blocks `system`/`developer` but not forged `tool` content. This is not a cross-user data access vulnerability, but it is a conversation-integrity risk and a blocker for trustworthy persistence.
- **The client and server disagree about history.** The client displays complete messages; the model sees a truncated projection. A card can still render locally after a reload-less long session even when the model has lost the underlying facts.

---

## 5. Effective Prompt & Context Inventory

### 5.1 Every instruction source

| Source | Mechanism / location | Content | Approx. size | Trust / notes |
|---|---|---|---|---|
| Static system prompt | `ASSISTANT_PROMPT` in [lib/assistant/prompt.ts:1-38](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L1) | Identity, 20 numbered rules, timetable paragraph, semantic/navigation/referent paragraphs, rating rules | 20,319 chars ≈ 5.1k tokens | Highest-priority prose; contains contradictions |
| Tool descriptions and JSON schemas | `createAssistantTools`, `tool-schemas.ts`, timetable tool modules | When to call, argument semantics, caps | Several thousand tokens (estimated, not provider-measured) | Part of the tool contract; some duplicate the prompt |
| CopilotKit/provider instructions | Provider/runtime | Framework-generated tool-use instructions | Not exposed in repository | Cannot be audited precisely from source |
| Page context | `PAGE_CONTEXT_DESCRIPTION` from `describePage` ([lib/assistant/page-context.ts:4-17](file:///Users/thomaswu/workspace/next-web/lib/assistant/page-context.ts#L4)) | Current page kind and course/instructor keys | Tiny | URL-derived, tightly validated |
| Timetable digest | Browser payload → server digest ([lib/assistant/timetable-context.ts:244-449](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-context.ts#L244)) | Plan status, meetings, conflicts, gaps, day parts, unscheduled sections, version | ≤8,000 chars ≈ 2k tokens | Fresh per request; progressively shrunk |
| Timetable previews | [lib/assistant/timetable-previews.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-previews.ts) | Last two preview snapshots, conflicts, change conflicts, staleness | ≤1,200 chars | Snapshot semantics; older previews lost |
| Discussed courses | [lib/assistant/discussed-courses.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/discussed-courses.ts) | Recent turns with at least two validated `get_course` results | ≤1,200 chars | Only 2 turns; no preferences |
| Catalog result sets | [lib/assistant/catalog-result-sets.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/catalog-result-sets.ts) | Up to 3 sets × 10 visible courses, positions, filters | Variable; roughly hundreds to low thousands of tokens | Data-only; only loaded rows |
| Course referent | Middleware ([lib/assistant/agent.ts:74](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L74)) | Latest course intent: none/explicit/page/ordinal/conversation/ambiguous/multiple | Tens of tokens | Deterministic; regex-limited |
| Timetable scenario | Middleware ([lib/assistant/agent.ts:70-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L70)) | Saved/preview/ambiguous scenario and wording | Tens of tokens | Deterministic; regex-limited |
| Reply script/language | `replyScriptContext`, `replyLanguageContext` ([lib/assistant/reply-script.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/reply-script.ts)) | Script/language hints from messages | Tiny | Deterministic |
| Conversation history | Server-shaped client messages ([lib/assistant/conversation.ts:56-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L56)) | Current + 8 prior user turns; tool results truncated | Variable; can be large within the current turn | Lossy, no summarization |
| Tool results | Per step | Catalog rows, course details, reviews, sections, timetable facts | Up to tens of thousands of tokens across steps | Some silent truncation; see tool matrix |

**Approximate ordering.** The static system prompt is the base. Client-registered contexts follow. Middleware appends script/language, course referent, and timetable scenario at the end, after replacing the raw timetable context with its digest. Tool schemas are presented by the model/provider layer. Conversation messages follow. Exact provider assembly text is not logged and cannot be reconstructed byte-for-byte from the repository.

**Token-budget conclusion.** A typical turn begins around 8–12k input tokens before tool results, and can grow substantially with a 50-row search, multiple reviews, and eight steps. The important issue is not a single context-window overflow; it is repeated prompt/schema transmission, cost, latency, and the fact that the model must reconcile a very large prose contract.

### 5.2 Contradictions and conflicts

| ID | Conflict | Exact evidence | Likely behavioral effect |
|---|---|---|---|
| C1 | Read reviews before recommending vs do not read reviews unless asked what they say | Rule 18: [prompt.ts:20](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L20); final paragraph: [prompt.ts:37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L37) | Model may skip evidence before a recommendation, or ignore an explicit review-oriented request. The two instructions are mutually exclusive on their face. |
| C2 | Mandatory three-tool batch for every referent vs review/step economy | Rule 26 requires `get_course`, `get_course_sections`, and `get_course_reviews` for explicit/page/ordinal/conversation referents ([prompt.ts:26](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L26)); rule 19 says not to read every option's reviews; step cap is 8 | Wastes steps and quota, especially for simple "tell me more"; can crowd out schedule checks |
| C3 | Answer only from this turn's tool results vs use page, timetable, previews, discussed courses, and catalog context | Rule 3: [prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5) vs context rules at [prompt.ts:23-26,37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L23) | Model may distrust or underuse the deterministic context the application spent significant code building |
| C4 | Tool failure/nothing ⇒ say "no matching data" vs renderer and tool error taxonomy | Rule 3 vs `ToolFailure` types and failure alerts ([lib/assistant/tools.ts:61](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L61); [components/assistant/search-catalog-tool-render.tsx:27-47](file:///Users/thomaswu/workspace/next-web/components/assistant/search-catalog-tool-render.tsx#L27)) | A failed review/section lookup can become a false global "no courses" statement while a populated search list is visible |
| C5 | Default omit cards vs "tell me more" is an inspect request | Rule 11 repeatedly defaults to omission ([prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13)); `present_response` description says "Default: omit this tool" ([lib/assistant/tools.ts:238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L238)) | Natural exploration yields prose/links; only exact card/inspect language reliably produces cards |
| C6 | `present_response` is "accepted" but may render nothing | Shape-only validation ([lib/assistant/presentation.ts:56-102](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L56)); renderer requires same-turn matching lookup ([presentation.ts:220-235](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L220)) | Model can truthfully report tool success and falsely claim a card is visible |
| C7 | Prompt says the chat is about 380px vs actual 450px default/resizable 380–800px | [prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13); [components/assistant/panel-width.ts:1-38](file:///Users/thomaswu/workspace/next-web/lib/assistant/panel-width.ts#L1) | Stale formatting constraint; contributes to overly terse answers but is not the main card problem |
| C8 | "Do not assume every client renders cards" vs the actual client always rendering search/filter/preview | Rule 15 ([prompt.ts:17](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L17)); [lib/assistant/rich-tools.ts:16-20](file:///Users/thomaswu/workspace/next-web/lib/assistant/rich-tools.ts#L16) | Model hedges or avoids cards even where rendering is deterministic |
| C9 | "Do not repeat facts" vs "always name the review count" and comparison requirements | Rule 11 vs rule 37 ([prompt.ts:13,37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13)) | Tension between brevity and evidence; model may omit the count or repeat fields |

The single most damaging pair is **C1 + C2**: the prompt simultaneously mandates review retrieval for referents and forbids it unless the student asks what reviews say, while a step cap makes the mandatory batch expensive. A model cannot satisfy all three consistently.

### 5.3 Procedural rules and where they belong

| Rule family | Current prompt examples | Better owner | Classification |
|---|---|---|---|
| Identity, read-only, security | Rules 1-5 | Static prompt + server enforcement | Essential model instruction; keep |
| Language/script | Rule 1, final paragraph | Static prompt + deterministic hints | Essential, but can be shortened |
| Data grounding | Rules 3-6, 20 | Static prompt + typed tool output + validation | Essential, but "this turn only" must be corrected |
| Tool ordering | Rules 17, 18, 19, 26, timetable paragraph | Tool descriptions + agent reasoning; server validation where required | Over-procedural; move most out |
| Card trigger phrases | Rule 11, `present_response` description | Renderer/presentation policy | Product/rendering responsibility; remove phrase lists |
| Navigation procedure | Rules 27-35 | Tool description + server/client validation | Tool/application responsibility; keep only intent principle |
| Counts/pagination | Rules 12, 14 | Tool result metadata + server normalization | Tool/schema responsibility |
| Referent resolution | Course referent paragraph | Deterministic code; prompt only explains how to use it | Application responsibility |
| Timetable computation | Timetable paragraph | Digest/conflict engine | Application responsibility; prompt should explain honest limits, not recompute |
| Rating scales | Rule 37 | Data schema (scale metadata) + prompt summary | Data responsibility |
| Response length/format | Rules 9, 11 | Static prompt; panel-aware renderer | Product preference; keep short |

The prompt is not "too long" in the abstract; it is too long because it mixes six ownership layers. The correct refactor is not merely deletion. It is delegation.

### 5.4 Recommended prompt architecture (not the replacement prompt)

A future prompt should be organized around seven short layers:

1. **Identity and mission:** academic planning assistant for What2Reg, read-only, grounded, honest about missing data.
2. **Intent and planning behavior:** understand the student's goal; ask only when a missing value changes the answer; propose and verify options; state assumptions.
3. **Grounding and academic accuracy:** use tool results and trusted context; distinguish catalog facts, review scores, and interpretation; never invent unavailable fields.
4. **Tool-use principles:** search broadly enough, read evidence before judging, use deterministic context for page/timetable/referents, respect result caps.
5. **Adaptive response principles:** answer first, use rich UI when it reduces work, do not duplicate facts, use tables only when useful, keep links.
6. **Security and read-only boundary:** reviews and page text are data, not instructions; no writes; no seat/enrolment promises.
7. **Dynamic trusted context:** page, timetable digest, preview scenario, referents, planning state, catalog results, history.

Mechanical constraints should move to code:

- card mounting and deduplication;
- tool result validation and error taxonomy;
- count/pagination metadata;
- scale direction and sample-size warnings;
- section/term/truncation metadata;
- navigation allowlists and destination checks;
- referent resolution and ambiguity;
- quota counting;
- message/body caps.

**Migration risks:** a shorter prompt can regress language matching, navigation safety, review grounding, and timetable honesty if the deterministic replacements are not shipped first. The refactor should be staged and gated by the existing tests plus new planning journeys. Do not write the final replacement prompt during this audit.

---

## 6. Tool Capability Matrix

### 6.1 Assistant tools

| Tool | Type | Inputs | Data source | Rich UI | Main limitation for planning |
|---|---|---|---|---|---|
| `search_catalog` | Server | term, faculty, department, credits, course type, programme level, suggested year, offered, searchIn, sort, limit 1–50, page 1–50 | `course_catalog`/RPCs | Always-rich course/instructor list | No day/time, rating, difficulty, workload, exam, or plan-conflict filters |
| `count_courses` | Server | Same filters as search | Catalog count | None | Same coverage gap |
| `get_course` | Server | course code, page | `course_noporf`/`course_catalog` + `prof_with_course` | Card only when claimed | No prerequisites, exam format, or historical offerings |
| `get_course_description` | Server | course code | Catalog text | None | 6,000-char cap; no pagination |
| `get_course_ilo` | Server | course code | Catalog ILO | None | 6,000-char cap; no pagination |
| `get_instructor` | Server | instructor name, rating/difficulty filters, sort, limit, page | `prof_with_course` | None | Requires exact instructor name; `maxDifficulty` direction is counterintuitive |
| `get_course_reviews` | Server | course code, exact instructor, limit 1–10, page | Comment RPC | None | Per-review only overall `result`; no structured difficulty/workload; exact instructor required |
| `count_reviews` | Server | course code, instructor | Comment RPC | None | No total in review payload; separate call needed |
| `get_course_sections` | Server | course code, instructor | Current-term schedule RPC | Card only when claimed | One instructor; no term echo; 20 sections/20 meetings silently sliced |
| `present_response` | Server | `show[]` ≤3 components/codes | None | Mounts existing lookup cards conditionally | Shape-only acceptance; no lookup/render verification; same-turn only |
| `check_plan_conflicts` | Server | course, instructor, optional section | Client timetable digest + current-term schedule | None | One course/instructor; depends on digest status/term; weekend meetings unsupported |
| `preview_timetable` | Server | up to 3 additions, optional focus day | Client digest + schedule | Always-rich week preview | Up to 3 additions; requires known instructor/section; aborts on any not-found |
| `filter_catalog_results` | Frontend | resultSetId, filter all/offered | Client result-set context + React store | Always-rich status/scroll | Filters only loaded rows; follow-up run consumes quota |
| `navigate` | Frontend | destination | Allowlisted route builder + existence check | None | One page per message; follow-up run consumes quota |

The assistant has 12 server tools, not five. The public MCP server exposes five read-only tools (`search_catalog`, `get_course`, `get_instructor`, `get_course_reviews`, `get_course_sections`) and shares data adapters with the assistant; it is a separate surface with different limits and auth.

### 6.2 Search filters: supported versus needed

**Supported today:** free-text term (substring matching, not true prefix), exact faculty/department/credits/course type/programme level, suggested year, offered-only, sort by code/title/credits/suggested year/offered, page/limit.

**Not supported:** weekday set, time window, instructor as a course filter, average result threshold, difficulty threshold, review-count threshold, workload/exam format, saved-plan conflict exclusion, historical term, seat/capacity.

The tool description and prompt tell the model to use a code prefix such as `ACCT` for a subject. The SQL paths use `%keyword%` substring matching, not a prefix operator ([lib/assistant/data/search-catalog.ts:107-115](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/search-catalog.ts#L107); `search_planner_courses` RPC). This usually works because a code substring is selective, but the description overstates the behavior.

### 6.3 Discovery feasibility under the current step cap

For a request such as "find three offered GE courses with Monday/Thursday morning sections, no clashes, and positive workload reviews":

1. Search can enumerate GE candidates (up to 50), but returns no ratings and no sections.
2. Ratings require `get_course` per candidate (or `get_instructor` per professor).
3. Sections require `get_course_sections` per offered instructor.
4. Workload requires `get_course_reviews` per instructor.
5. Clash checking requires `check_plan_conflicts` per course/instructor.

Even one candidate can consume six or more tool calls. Three candidates cannot be validated within eight model steps without luck. This is why the assistant tends to ask the student for candidate codes rather than doing the exploration itself (E2E-08).

### 6.4 Error taxonomy

The assistant exposes only three failure envelopes:

| Envelope | Meaning at tool layer | What the model/UI receives |
|---|---|---|
| `invalid_request` | Zod/schema failure or bad binding | Generic invalid request |
| `not_found` | MCP `not_found` or no rows in some adapters | "Not found" |
| `temporarily_unavailable` | Any other MCP/data error | "Temporarily unavailable" |

The MCP layer has richer codes (`rate_limited`, `result_too_large`, `internal_error`, auth codes), but the assistant collapses them ([lib/assistant/tools.ts:61,69-88](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L61)). Worse, several adapters turn failures into empty successes:

- `get_course_sections` can return success with an empty `sections` array for an unknown course/instructor, no data, or a data error.
- `get_instructor` returns `not_found` when filters exclude everything, which is indistinguishable from an unknown instructor.
- Reviews map a missing mapping and a DB failure to the same `not_found`.
- `get_course` can fall back to `course_noporf` and still produce a placeholder course when professor rows exist.
- Search on the MCP RPC path can report `totalCount: 0` for an out-of-range page.

The model then receives rule 3's instruction to say "there is no matching data on the site" for any empty or failed result. This institutionalizes the E2E-06 contradiction.

### 6.5 Payload and truncation summary

| Result | Cap / behavior |
|---|---|
| Search | Up to 50 rows; no ratings; aliases included |
| Course detail | 20 instructors/page; description 1,200 code points with no truncated flag |
| Course description/ILO | 6,000 code points; explicit `truncated` in the text-tool output |
| Reviews | Up to 10; each body 600 code points; no total count; `hasMore` only |
| Sections | 20 sections, 20 meetings/section, silently sliced; no `complete/truncated/term` fields |
| Timetable digest | 8,000 chars, 30 sections, 80 meetings; progressive shrinking sets `complete:false` |
| Previews | 2 snapshots, 1,200 chars |
| Discussed courses | 2 turns, 1,200 chars |
| Catalog result sets | 3 sets × 10 visible courses |

The drill-down tools are better than the discovery tools. The assistant can inspect a known course in depth; it cannot reliably find the right set of courses to inspect.

## 7. Intent Understanding & Agent Behavior

### 7.1 How intent is currently represented

There is no structured intent classifier and no durable planning goal. Intent is inferred from five narrow mechanisms plus prose rules:

| Mechanism | What it resolves | Limits |
|---|---|---|
| Page context | Current course/instructor/page type | URL-derived only; no goal state |
| Course referent (`lib/assistant/course-referent.ts`) | Explicit code, "this course," anaphora, ordinals, result-set positions, multiple codes, ambiguity | Regex/ordinal gates; English/Chinese patterns; no subject/prefix anchor, no "alternatives," no preference intent |
| Timetable scenario (`lib/assistant/timetable-scenario.ts`) | Saved vs preview vs ambiguous, staleness, wording | Regex-based; last two previews; ambiguity prompts |
| Discussed courses (`lib/assistant/discussed-courses.ts`) | Recent turns with at least two validated `get_course` results | Only two turns; no goals, preferences, or rejected options |
| Catalog result sets | Visible positions and filtered rows | Only loaded rows; max 3 sets/10 courses |
| Prompt intent paragraphs | Answer vs page vs navigate, missing values, choices | Procedural; no explicit planning schema; conflicts with other rules |

The model is therefore doing intent reconstruction every turn from a lossy transcript and a large rulebook. The deterministic modules are good at **referent naming**; they are not a **planning state**.

### 7.2 Intent-capability matrix

Ratings are audit judgments based on source capability, not live model scores.

| Student intent | Current capability | Typical result | Primary gap |
|---|---|---|---|
| Look up a known course | Strong | Correct facts and link; card only if explicitly requested | Presentation gate |
| Explore a subject's courses | Moderate | Search list appears; model interprets total/offering | No GE/subject-aware planning; cards phrase-gated |
| Understand a course's content | Strong | Description/ILO tools | No prerequisite or assessment data |
| Compare instructors | Moderate | Aggregate ratings and review text | Exact names; no schedule; scale inversion risk |
| Compare courses | Moderate | Prose/Markdown table | No comparison component; no schedule/assessment normalization |
| Recommend an easy course | Weak | Plausible suggestions from partial data | No rating/difficulty search; no sections; review contradiction |
| Find a course that fits a schedule | Absent as discovery | Asks for candidate codes, or checks one known course | No day/time search; per-instructor section lookups; 8-step cap |
| Plan around no midterm/no final | Not supportable | May infer from review text or contradict itself | No structured exam data; no preference ledger |
| Check a timetable clash | Strong | Deterministic conflict check | One course/instructor; digest dependency |
| Preview a hypothetical timetable | Moderate/strong | Deterministic preview and conflict semantics | Up to 3 additions; known section required |
| Follow up on "that course" | Moderate | Deterministic referent usually resolves | Last 8 turns, 200-char tool results, no subject anchor |
| Change preferences mid-plan | Weak | May forget or contradict earlier preference | No durable preference state |
| Navigate to a page | Strong | Allowlisted, existence-checked navigation | One page/message; follow-up quota |
| Continue a long planning session | Weak | Context loss at 8 turns; hard stop beyond 30 | No persistence or summarization |

### 7.3 Why broader planning intent is not recognized

1. **The prompt is organized around answering and navigating, not planning.** It defines "outcome: answer or page" ([prompt.ts:27-35](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L27)), but never defines a planning loop: gather constraints, generate candidates, verify schedule/ratings, compare, recommend, revise. The only recommendation instruction is a `Suggestion:` line after facts ([prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13)).
2. **The tools cannot search the planning constraint space.** Day/time, rating, difficulty, workload, exam format, and plan conflicts are not catalog search filters. The model can only drill into candidates it already knows.
3. **The step budget is smaller than the discovery algorithm.** Validating one candidate can consume most of eight steps; validating three is infeasible.
4. **The context is lossy in exactly the dimensions planning needs.** The assistant keeps recent referents but not the student's goal, constraints, rejected options, or trade-offs. Old tool results become 200-character stubs.
5. **Referent resolution is not intent resolution.** "Alternatives to GELH courses" is not a course code, ordinal, or page referent. The deterministic module returns `none` or a single code; the model must reconstruct "GELH" and "same subject/easy GE" from history.
6. **The model is told to answer only from this turn's tool results.** That discourages using accumulated context and encourages re-querying or asking the student.
7. **The presentation contract gives no feedback.** The model cannot tell whether the student sees a card, a table, or only prose, so it cannot adapt its next move.

### 7.4 Worked example: "Recommend an easy GE course that fits my Monday morning and has no midterm"

This is the brief's example, and it is a good stress test.

| Step | Available action | Problem |
|---|---|---|
| 1 | `search_catalog` for GE courses / broad faculty | Returns codes, titles, credits, offered status; no ratings, sections, or exam format |
| 2 | `get_course` for candidate A | Returns aggregate instructor ratings and 1,200-char description; no exam data |
| 3-5 | `get_course_sections` for each offered instructor | One instructor per call; up to three per prompt rule; no weekday filter |
| 6 | `get_course_reviews` for one instructor | Review text may mention exams/workload, but unstructured; rule 37 says don't call unless asked |
| 7 | `check_plan_conflicts` | Can verify clash only after candidate/section known |
| 8 | Summarize | No step budget left for a second candidate; no comparison of alternatives |

The assistant's rational behavior under these constraints is to ask the student for candidate codes or to make a tentative suggestion without full verification. Both match E2E-08 and E2E-07. The root cause is not a lack of model intelligence; it is a search space with no query interface and a budget too small for manual enumeration.

### 7.5 Clarification behavior

The system has three independent clarification sources:

- **Deterministic referents:** ambiguous ordinals, page-vs-chat conflicts, multiple course codes, ambiguous timetable scenarios.
- **Prompt procedures:** "if several remain, ask one short question"; section choices; navigation missing values.
- **Tool failures/coverage:** no bulk candidate search, exact instructor requirements, no exam data.

The first two are often appropriate. The third creates excessive clarification: the model asks for a course code because the alternative is an unbounded sequence of drill-downs. Adding more "be proactive" prose will not fix this; the tool surface must make proactive discovery cheap.

### 7.6 What the student experiences

- The assistant often answers the literal question correctly but does not advance the plan.
- It can show a search list while saying no courses exist.
- It can recommend a course without verifying the constraint that matters.
- It can forget a preference expressed a few turns earlier.
- It can claim a card was shown when it was not.
- It can stop accepting messages once a request would exceed 30 user turns, with no persistent place to resume.

These are system-design outcomes, not isolated model hallucinations.

---

## 8. Academic Correctness Analysis

### 8.1 Rating semantics

The platform's rating scales are unusual and must be interpreted carefully:

| Field | Scale | Direction | Assistant-facing metadata |
|---|---|---|---|
| `result` | Overall/aggregate | Composite of submitted sliders | Number only + prose gloss |
| `grade` | 1 = F, 5 = A | Higher = higher reported grades | Prose in rule 37 |
| `difficulty` | 1 = Very hard, 5 = Very easy | **Higher = easier** | Prose in rule 37; field name `difficulty` |
| `reward` | 1 = Waste, 5 = Useful | Higher = more useful | Prose |
| `attendance` | 1 = Always, 5 = Never | Higher = fewer checks | Prose |

`result` is not a direct "recommend" slider. The submit route writes `target_result` as the mean of seven submitted values: attendance, presentations, grade, difficulty, reward, assignment, and recommend ([app/api/comment/[code]/[prof]/route.tsx:188-195](file:///Users/thomaswu/workspace/next-web/app/api/comment/[code]/[prof]/route.tsx#L188)). The assistant-facing `RATING_SCALES` labels it "Overall" with a "Never!/Completely" gloss ([lib/assistant/rating-semantics.ts:1-7](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L1)), which is not a precise description of the composite. The model is told to treat it as Overall. This is a semantic-modeling weakness, not necessarily a data bug.

Aggregates are per `prof_with_course` row (course × instructor), averaged over visible top-level comments. `comments` is the sample size. Missing aggregates are coalesced to `0` in the refresh RPC ([supabase/migrations/20260812_comment_write_rpc.sql:22-42](file:///Users/thomaswu/workspace/next-web/supabase/migrations/20260812_comment_write_rpc.sql#L22)), so `0` can mean "no reviews" rather than a measured zero. `SMALL_REVIEW_SAMPLE = 5` is defined but unused ([lib/assistant/rating-semantics.ts:9](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L9)).

### 8.2 Difficulty inversion risk

The E2E-03 observation — a model saying 2.58 is easier than 3.88 — is consistent with the data model:

- The field is named `difficulty` but higher means easier. This is counterintuitive and easy to invert.
- Tool results return bare numbers with no scale label.
- The prompt states the direction once in a long final paragraph ([prompt.ts:37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L37)), which is subject to context loss and contradictory neighbors.
- `get_instructor`'s `maxDifficulty` filter is implemented as `hard <= value` ([lib/assistant/data/instructor.ts:86-87](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/instructor.ts#L86)). "Max difficulty = 2" therefore keeps the **harder** courses, while "easy" intuition suggests the opposite.
- Default ascending `sortBy=difficulty` lists numerically lowest (hardest) first ([lib/assistant/data/instructor.ts:91-93](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/instructor.ts#L91)).

This is a confirmed semantic trap. It is not proof that the model inverted the scale internally, but the system does nothing deterministic to prevent the inversion. Confidence: high that the risk exists; medium on the exact E2E cause without the transcript.

### 8.3 Review grounding

Strengths:

- Reviews are public, top-level, visible-only; replies and hidden rows are filtered ([lib/mcp/data/get-course-reviews.ts:42-57](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-reviews.ts#L42)).
- Review text is treated as data by prompt rule 5; an injection fixture exists in tests.
- Bodies are truncated by Unicode code points, not UTF-16 units.
- `count_reviews` provides a sample size, and `hasMore` supports pagination.

Weaknesses:

- Per-review payload exposes only overall `result`, not difficulty, grade, workload, attendance, or recommend; structured workload/exam analysis is impossible without reading prose.
- There is no total count in the review response; the model must call `count_reviews` separately or infer from `hasMore`.
- Reviews are newest-first with no recency weighting or age filter.
- Aggregates have no `insufficient_data` or small-sample flag.
- A course can have multiple instructors; reviews are keyed to exactly one course × instructor, so comparisons require multiple sequential calls.
- The contradictory prompt rules C1/C2 make review retrieval unreliable.

### 8.4 Recommendations and evidence

There is no recommendation engine. V2.2 explicitly prohibited one, and V2.2's "recommendation" is a `Suggestion:` prose line after facts. The model selects candidates from catalog rows and its own knowledge, then may check some ratings/sections. It is not required to verify the student's actual constraint before suggesting a course; only explicit "when/where" or timetable questions trigger section checks.

The resulting failure mode is **plausible but unverified advice**: a course may be offered and highly rated but have no matching section, clash with the plan, or have an exam format the student wanted to avoid. This is E2E-07. The correction is not a stronger "be accurate" instruction; it is a discovery/validation tool and a response contract that distinguishes "candidate" from "verified fit."

### 8.5 Missing academic domains

| Domain | Status | Consequence |
|---|---|---|
| Prerequisites | Not in platform; prompt says unavailable ([prompt.ts:10](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L10)) | Cannot build prerequisite chains; must defer to official system |
| Degree/program requirements | Not modeled | Cannot audit graduation progress |
| Exam format (midterm/final/assessment) | Not structured | E2E-04 cannot be answered reliably; review prose is the only hint |
| Seat/capacity | Not modeled | Prompt correctly says offering is not a seat |
| Historical offerings beyond current term | Not exposed | Cannot predict future availability |
| Workload/presentation aggregates | Not aggregated or exposed; only review text | "Easy workload" cannot be verified at scale |
| Section term metadata | RPC filters current term but DTO omits year/sem | Caller cannot state which term the section data belongs to |

V2.3.5 should not ingest or guess these domains unless an authoritative source exists. The immediate correctness fix is to say **"the site has no reliable data for that"** rather than infer from reviews.

### 8.6 Sections and timetable correctness

Strengths:

- Section schedules are parsed deterministically into weekday/start/end/location.
- Conflict detection reuses the planner's engine; saved plan sections are excluded before candidate comparison.
- `check_plan_conflicts` returns per-section conflicts, overlap windows, `unscheduled`, `planComplete`, and term mismatch.
- `preview_timetable` is read-only, builds a hypothetical plan in memory, and supports add/replace semantics.
- Saved-versus-preview scenario context prevents blending in the tested paths.

Weaknesses:

- `get_course_sections` caps at 20 sections and 20 meetings per section and slices silently; it returns no `complete`/`truncated` flag ([lib/mcp/data/get-course-sections.ts:10-11,105-110](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-sections.ts#L10)).
- The response has no term/year/sem field, so the model cannot tell the student which term the data is from ([lib/mcp/schemas.ts:467-491](file:///Users/thomaswu/workspace/next-web/lib/mcp/schemas.ts#L467)).
- Unknown course/instructor, no data, and DB error can all become `sections: []` success.
- The timetable schema is MON–FRI only; a Saturday meeting accepted by the MCP parser becomes "unsupported" and is omitted from conflict analysis ([lib/timetable/schema.ts:17,30](file:///Users/thomaswu/workspace/next-web/lib/timetable/schema.ts#L17)).
- `check_plan_conflicts` `complete` only checks that meetings exist and unsupported meetings are zero; it does not know whether the 20/20 caps dropped data.
- The three-instructor rule is prompt-only, not enforced.
- `preview_timetable` aborts the whole preview on any `not_found` and requires an exact section when an instructor has multiple sections.

These are material for a planning assistant: a "no conflict" statement can be incomplete even when the deterministic engine is correct for the data it received.

---

## 9. Rich UI Presentation Analysis

### 9.1 The rendering contract

`present_response` does not render anything. It is a same-turn **claim** that an existing lookup should be presented:

1. The model calls `get_course` and/or `get_course_sections`, then `present_response({show:[...]})`.
2. The server validates only shape: array ≤3, known component, 4-letter+4-digit code, no duplicates ([lib/assistant/presentation.ts:56-102](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L56)).
3. It returns `{status:"accepted"}` even if no matching lookup exists.
4. The client groups messages by turn; `activePresent` takes the last accepted claim; `planRichBlocks` mounts a `get_course`/`get_course_sections` renderer only if the claim matches the call's argument or canonical result code ([lib/assistant/presentation.ts:112-136,195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L112)).
5. `present_response` itself is skipped by the planner, the view, and Agent Activity. Its "Choosing a layout" labels are unreachable.
6. Rejections are invisible; unmatched or empty claims produce no card and no message.

Search, filter, and preview are different: they are always rich and render independently of `present_response` ([lib/assistant/rich-tools.ts:16-20](file:///Users/thomaswu/workspace/next-web/lib/assistant/rich-tools.ts#L16)).

### 9.2 Why E2E-01 and E2E-02 happen

E2E-01 ("the assistant claims a card was already displayed; the student says no you didn't") has several structural causes, ranked:

1. **Lookup in a previous turn.** A claim in turn N against a `get_course` from N−1 renders nothing. "Tell me more" works only when the model redoes the lookup and claim in the same turn.
2. **Wrong lookup tool.** For "tell me more," the model may call `get_course_description`/`get_course_ilo`, which have no renderer; a `course_detail` claim then has no matching `get_course`.
3. **Code mismatch.** The claim may use an alias, nickname, prior-turn code, or a code that matches neither the call argument nor the canonical result.
4. **Claim rejected or replaced.** More than three items, duplicate component/code, malformed streaming JSON, or a later accepted claim can drop the card. Only the last accepted claim wins.
5. **Resultless or interrupted run.** A claimed course call with no result can mount a permanently loading renderer; always-rich blocks disappear when a run stops without a result.
6. **Duplicate calls.** Deduplication is by tool-call id, not by course, so two lookups for one course can render two cards.

The model's belief is not necessarily a hallucination. It can receive `accepted` from a shape-only tool and never receive a render receipt. It may also independently write "shown above." The student sees prose and no card, so the two parties disagree about UI state.

E2E-02 ("rich UI requires special phrasing") is the upstream gate: both rule 11 and the `present_response` description say to default to omission unless the student asks to see/inspect a card ([prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13); [tools.ts:238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L238)). Natural evaluation produces prose and links. This is a product policy encoded as phrase matching, not a rendering bug.

### 9.3 UI inventory

| Surface | Renderer | Trigger | Strengths | Gaps |
|---|---|---|---|---|
| Catalog search | `search-catalog-tool-render.tsx` | Always | Interactive list, total/hasMore, All/Offered filter, failure alert | No ratings; model can contradict it; empty message is global |
| Course detail | `course-detail-tool-render.tsx` | Conditional claim | Credits, title, instructors, aggregate ratings, links | No full review text, no sections; 1,200-char description |
| Course sections | `course-sections-tool-render.tsx` | Conditional claim | Section cards with times/locations | Term/truncation not shown; no conflict annotation |
| Filter status | `use-catalog-results-tool.tsx` | Always | Local filter, counts, scroll-to-results | Filters only loaded rows; follow-up run |
| Timetable preview | `timetable-preview-tool-render.tsx` | Always | Compact week grid, conflicts, saved vs hypothetical | Dense weeks can clip at 380px; up to 3 additions |
| Agent Activity | `components/ai-elements/tool.tsx` | Every turn | Status, label, argument snippet, error color | Generic error text; `present_response` hidden; no render failure UI |
| Instructor/reviews | None | — | — | No card, no review list, no comparison view |

### 9.4 Lifecycle and persistence

- Cards persist while the provider/agent stays mounted. Closing the panel does not unmount the provider; client-side navigation keeps messages and cards.
- Refresh, new tab, new device, or user change loses all messages and cards.
- The panel is desktop-only at the global mount (`min-width: 1024px`). The full-width mobile layout exists in CSS but is effectively unreachable from the global launcher.
- Default width is 450px, resizable 380–800px; the prompt still says "about 380px." At 380px, dense timetable grids can clip rather than scroll (inference; no browser test).
- Historical cards can be rebuilt from stored raw tool calls/results, but **not** from server-shaped history, because `shapeConversation` truncates old tool results to 200 characters. Any persistence design must store raw messages.
- Catalog filter selection is stored in a separate React store keyed by tool-call id, not in tool results. Restoring a search list without restoring filters would show the unfiltered view.

### 9.5 Recommendation direction

The goal is "conversation first, rich UI when it adds value," not "cards only on trigger words." A viable direction:

- Replace phrase-based opt-in with a **semantic presentation intent** expressed by the model or inferred deterministically from the response shape and tool evidence. Examples: `answer_only`, `show_course_details`, `show_sections`, `comparison`, `timetable_preview`.
- Validate that every requested card has a matching same-turn successful lookup before returning success. Return a receipt such as `rendered`, `missing_lookup`, or `code_mismatch`.
- Let the renderer/deployment policy decide density: one primary card per course, optional expandable details, no duplicate cards, no card for a pure factual answer that already contains the same fields.
- Always offer a compact "view course card" affordance for a looked-up course so the student does not need to know the magic phrase. This avoids flooding while removing phrase dependency.
- Keep search/filter/preview always rich, but make their empty/error states explicit and non-contradictory.
- Do not auto-render a card for every lookup; that would flood a 450px panel and duplicate prose.
- Do not add more keyword rules.

---

## 10. Conversation History & Context

### 10.1 Current storage

| Layer | Behavior |
|---|---|
| Client messages | CopilotKit in-memory agent registry; full messages during the session |
| Thread identity | Random AG-UI thread id; not exposed as a durable conversation id |
| New Chat | Clears messages and catalog filters; does not change a persisted thread identity |
| Server runner | `InMemoryAgentRunner` bounded to 16 threads / 8 runs / 2 MB; not a persistence layer ([route.ts:30-45](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L30)) |
| Server transcript | None; the client resends messages each run |
| Database | No chat table or migration exists |
| Reload / new tab / new device | All conversation lost |
| User change | Launcher resets state |

The provider receives only `runtimeUrl`, not a durable thread id ([assistant-panel.tsx:160-164](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-panel.tsx#L160)). AG-UI generates a random thread id, so "new chat" is a client-side reset, not a server conversation boundary.

### 10.2 Server shaping

`shapeConversation` does the following ([lib/assistant/conversation.ts:56-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L56)):

1. Drops `system`/`developer` messages.
2. Drops unanswered tool calls (to avoid a provider rejection loop).
3. Keeps the current turn plus the last `historyTurns` user turns (default 8 prior + current).
4. Replaces every tool result before the latest user message with a one-line, 200-character excerpt.

The last step is the most consequential. On the turn after a lookup, the model retains the prose answer and the assistant's text, but the structured tool result is a stub. The client still displays the full card from its own copy. The model and the student therefore have different evidence.

### 10.3 Context modules

| Module | Content | Freshness | Caps | What it does not preserve |
|---|---|---|---|---|
| Page context | Current page kind, course/instructor | Every route change | Tiny | Goals, prior page history |
| Course referent | Latest referent | Every request | Tiny | Subject anchors, multiple alternatives, preferences |
| Timetable digest | Current saved plan facts | Every request | 8k chars/30 sections/80 meetings | Previews, historical plans, plan edits before sync |
| Timetable previews | Last two previews | Every request | 1.2k chars | Older previews, detailed section lists |
| Discussed courses | Recent courses from turns with ≥2 `get_course` results | Every request | 2 turns/1.2k chars | Single-course turns, rejected options, goals |
| Catalog result sets | Recent search sets and visible positions | Every request | 3 sets × 10 courses | Unloaded rows, full 50-row page, ratings, sections |
| Conversation history | User/assistant text + tool stubs | Every request | 8 prior turns/200 chars | Old tool facts, preferences, decisions |
| Planning state | None | — | — | Everything |

### 10.4 Long-session failure timeline

A realistic planning session:

- **Turns 1–3:** The student states constraints ("no finals," "Monday/Thursday mornings," "easy GE"). The model answers; the constraints are only in prose.
- **Turn 4:** The assistant searches; a 50-row search result set is stored (but context keeps only 10).
- **Turn 5:** A `get_course` result is full. The student asks for alternatives; the model still has the recent referent.
- **Turn 6:** The previous turn's tool results shrink to 200 chars. The model must rely on prose and catalog result sets.
- **Turn 8–9:** Older constraints fall outside the 8-turn window. The model may contradict a preference stated at turn 2.
- **Turn 10+:** `discussed-courses` may retain two recent turns, but with no preferences. The model asks again or guesses.
- **Turn 30:** The route returns 409 `conversation_limit`; the only recovery is a new chat, which loses everything.

This is exactly the kind of session the brief describes. The system's deterministic referents help with "that course"; they do not help with "I said no midterms" or "I want something in the same subject as GELH."

### 10.5 Quota and execution interaction

- Each user turn can trigger multiple runs via `navigate` and `filter_catalog_results` follow-ups.
- Every run consumes hour/day quota before the model is called.
- A failed or timed-out run still consumes quota.
- A long planning session with navigation/filtering can exhaust 30/hour before the student has sent 30 turns.
- The 30-turn hard cap is independent of history shaping; once a request would carry more than 30 user messages, history is irrelevant because the request is rejected.

### 10.6 Scaling concerns

- Each step re-sends the prompt, tool schemas, context, and accumulated tool results.
- Cost and latency scale with steps and result size, not just turns.
- No per-turn input-token cap, cost budget, or overall deadline exists.
- The runner's in-memory limits are not a conversation limit, but they are also not durability. A worker restart loses runtime state; the client's messages are the only copy.
- Persistence will increase storage and privacy obligations; it must be designed with retention and deletion, not just added as a table.

### 10.7 Minimum persistence design direction

A minimum viable design should:

- Create an assistant conversation/message schema owned by the Clerk user, following the existing `timetable_plan` pattern: `text` Clerk id, RLS enabled, anon/authenticated revoked, service-role writes.
- Store a stable `conversation_id`, title, timestamps, and raw messages/tool calls/tool results (or a compact serialization that preserves renderer inputs).
- Add a server-side load endpoint or a server-fetching layer; hydrate `agent.setMessages()` on open.
- Make the server authoritative when a conversation id is present: ignore or validate client-supplied history instead of trusting it.
- Store tool result summaries for old turns, but keep raw results for the most recent N turns so cards and references can be reconstructed.
- Persist catalog filters separately if restored search lists must show the student's filtered view.
- Add retention (for example 30/90 days), user deletion, and a "new chat" that creates a new id rather than only clearing memory.
- Do not use the non-durable `InMemoryAgentRunner` as the persistence layer, and do not persist the 200-character shaped history.

This is a design direction, not an implementation plan.

---

## 11. Admin & Usage-Limit Analysis

### 11.1 Current configuration surface

| Setting | Storage | Who can change | Runtime effect | Admin UI |
|---|---|---|---|---|
| Assistant access mode (`off`/`testers`/`everyone`) | `app_config.ai_assistant_access` | Normal admin may change only this field; platform admin for other config | Launcher and API gate | Yes, `/admin/assistant` |
| Tester emails | `assistant_testers` | Admin | Tester-mode access | Yes, capped at 200 |
| Model | `AI_MODEL` env | Deployer | Model choice | No |
| Thinking mode | `AI_THINKING` env | Deployer | Provider options | No |
| Max output tokens | `AI_MAX_OUTPUT_TOKENS` env | Deployer | Per-step output cap | No |
| Timeout | `AI_TIMEOUT_MS` env | Deployer | Per-step fetch timeout | No |
| Hourly/day quota | `AGENT_RATE_LIMIT_PER_HOUR/DAY` env | Deployer | Quota enforcement | No |
| Max conversation turns | `AGENT_MAX_TURNS_PER_CONVERSATION` env | Deployer | Hard 409 | No |
| History turns | `AGENT_HISTORY_TURNS` env | Deployer | Model context window | No |
| Max steps | Code constant `ASSISTANT_MAX_STEPS = 8` | Deployer/code change | Tool loop | No |
| Prompt | Code constant | Deployer/code change | Behavior | No |
| Read-only mode | `PREVIEW_DB_READONLY`, `PREVIEW_MODE` env | Deployer | Safety | No |

Admin audit logging covers config updates, but only the last 10 audit entries are shown and there is no full audit page. The assistant access page is one page with a mode selector and tester list; it has no usage, quota, model, prompt, or cost controls.

### 11.2 Enforcement details

- Hour and day quotas are consumed sequentially; a day denial after an hour consumption can still consume the hour unit.
- The quota key is a hash of the Clerk user id, so it is per account. Multiple accounts are not addressed.
- A Supabase rate-limit failure throws and is returned as 503; this is fail-closed for safety.
- Preview mode uses an in-memory limiter; a worker restart resets it.
- `DISABLE_RATE_LIMIT=1` is dev-only and guarded by `NODE_ENV !== "production"`; that guard is correct.
- Quota is consumed before the model call, so a model outage, timeout, or tool failure consumes units.
- Frontend `navigate` and `filter_catalog_results` use `followUp: true`; each follow-up is a separate run and a separate quota charge. The route logs `continuation` but does not exempt it ([route.ts:109-110](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L109)).

### 11.3 Fairness example

A single student turn that navigates once and filters once may produce three runs:

1. initial model/tool run;
2. follow-up after `navigate`;
3. follow-up after `filter_catalog_results`.

Three quota units for one turn. A 10-turn planning session with occasional navigation can approach the 30/hour quota even though the student sent only 10 messages. This is a material UX and trust problem, independent of the quota's numeric value.

### 11.4 Recommended admin matrix

| Setting | Recommended control | Bounds / default | Permission | Notes |
|---|---|---|---|---|
| Access mode | Runtime | Existing enum | Normal admin | Keep |
| Tester list | Runtime | ≤200 | Normal admin | Keep |
| Hourly/day quota | Runtime | e.g. 10–500 / 30–2,000 | Platform admin | Enforce per user turn, not run |
| Max turns | Runtime | e.g. 10–200 | Platform admin | Persistence should make this less visible |
| History turns | Runtime | e.g. 4–30 | Platform admin | Coordinate with summarization |
| Max steps | Runtime | e.g. 4–16 | Platform admin | Higher steps need cost guard |
| Max output tokens | Runtime | e.g. 500–4,000 | Platform admin | Per-step cap |
| Timeout | Runtime | e.g. 10–60 s | Platform admin | Per-step; add overall deadline |
| Model allowlist | Runtime | `deepseek-flash` + approved alternatives | Platform admin | Never accept arbitrary URLs/keys |
| Thinking mode | Runtime | off/low | Platform admin | Benchmark before default changes |
| Feature flags (planning discovery, persistence) | Runtime | boolean | Platform admin | Kill switch |
| Prompt version | Deploy-time, versioned | — | Platform/engineering | Do not expose free-form prompt editing to normal admins |
| API keys / base URL | Secret/env | — | Deployer only | Never in app_config or UI |

Use the existing `app_config` + `revalidateTag("app-config")` pattern and audit logging. Cache with a short TTL; a quota change should take effect promptly. Do not add a new configuration framework.

### 11.5 Usage analytics

Current metrics log per-step latency, first chunk, input/cached/output/reasoning tokens, finish reason, and tool names, but not prompt/reply content. There is no aggregate usage dashboard, no cost budget, and no per-user consumption view. Before raising quotas, add privacy-preserving aggregates (runs, turns, tokens, 429s, failures, average steps) and a cost estimate. Do not log conversation content for this purpose.

---

## 12. Model & Execution Budget

### 12.1 Current model setup

| Item | Value |
|---|---|
| Provider / model | DeepSeek via `@ai-sdk/deepseek`; `deepseek-flash` |
| Thinking | `off` by default; `low` supported |
| Max output tokens | 2,000 per model step |
| Timeout | 30,000 ms per model fetch |
| Max steps | 8 |
| Temperature / top-p | Not set in repository code; provider defaults apply |
| Context window | Not declared in repository; depends on provider/model |
| Fallback model | None |
| Overall turn deadline | None |
| Retry policy | Not explicit in repository code |

The production model and env values are not verifiable from the repository. `wrangler.jsonc` sets dev/preview values; `.env.example` is an example, not production truth.

### 12.2 Budget analysis

Upper bounds in repository code:

- 8 model steps × 2,000 output tokens = 16,000 output tokens per turn in theory.
- Each step re-sends the static prompt (~5k tokens), tool schemas (estimated low thousands), dynamic context (up to ~4k tokens including timetable digest), and accumulated tool results.
- A 50-row search + course details + reviews can add tens of thousands of input tokens across steps.
- 30 s per step means a slow turn can take minutes; there is no overall deadline to stop it.
- Hourly/daily quotas cap run count, not token count; a single expensive run can dominate cost.

No live token or cost measurement was performed in this audit. V1-E documentation measured roughly $0.22–$0.35 per 1,000 turns on the then-current setup, with thinking-low adding about 50%; that is historical and not a current production measurement.

### 12.3 Bottlenecks, ranked

1. **Discovery depth vs step cap.** The model spends steps on sequential lookups because no tool can search constraints.
2. **Prompt/tool-prefix repetition.** Every step re-sends a large static contract.
3. **Review/section drill-down cost.** Per-instructor calls and 10-review pages multiply steps.
4. **No input-token or cost guard.** A large search/review result can inflate every subsequent step.
5. **Per-step timeout without a turn deadline.** Latency is unbounded at the turn level.
6. **No model fallback.** A provider outage or repeated timeout fails the turn; quota is already consumed.
7. **Model reasoning.** Thinking is off; multi-step planning may benefit from low thinking, but this is unproven and should be benchmarked after prompt/tool fixes.

### 12.4 Model strategy diagnosis

The evidence does not support replacing the model first:

- The live eval failures are concentrated in conversation/planning metrics, not basic tool selection or grounding.
- The prompt contains direct contradictions that any model would struggle to satisfy.
- The tool surface cannot express the planning constraints the product promises.
- The context layer loses the preferences needed for multi-turn planning.
- The presentation layer gives the model no feedback about what the student sees.
- V1-E's cost and language results show a workable model for the current lookup tasks, not a model ceiling.

A model benchmark is still worthwhile **after** the prompt, tools, and context are corrected. At that point, compare `deepseek-flash` with a small set of approved models on the same planning journeys, with thinking off/low, fixed budgets, and cost/latency metrics. Do not treat a model swap as a substitute for architecture work.

---

## 13. Real E2E Conversation Findings

### 13.1 Evidence gap

The complete transcript referenced by the brief is **not in the workspace**. Searches found only test fixtures and documentation references, not the student session. Therefore:

- No exact turn text, timestamps, tool calls, or model outputs are reproduced here.
- The E2E-01..E2E-10 observations are treated as supplied evidence from the brief.
- Root causes below are source-based explanations consistent with those observations, not proof of the exact transcript path.
- No live reproduction was performed.

### 13.2 Findings

| ID | Student intent | Expected useful behavior | Observed behavior (supplied) | Available data/tools | Likely root cause | Confidence | Severity | Corrective area |
|---|---|---|---|---|---|---|---|---|
| E2E-01 | Get more detail/card for GELH1000 | Show a card or clearly say it cannot | Model claims a card was shown; student says it was not | `get_course`, `present_response`, conditional renderer | Same-turn claim contract; shape-only acceptance; no render receipt; prior-turn lookup; wrong tool/code | High on mechanism; medium on exact turn | P1 | UI contract + prompt |
| E2E-02 | Explore courses naturally | Rich detail when evaluating, without magic words | Short prose/links despite active evaluation | `present_response` opt-in; prompt rule 11 | Phrase-gated product policy; default omission in prompt and tool description | High | P1 | Presentation policy |
| E2E-03 | Compare difficulty | Correctly interpret higher = easier | Claims 2.58 easier than 3.88 under inverse scale | Aggregate `difficulty`; prose scale only | Counterintuitive field; no scale metadata; prompt rule buried/contradicted; `maxDifficulty`/sort traps | High risk; medium exact cause | P1 | Data semantics + prompt |
| E2E-04 | No final, then no midterm | Track preference; say exam data is unavailable | Describes a no-midterm course as opposite of preference | No exam-format fields; review text only | No structured data; no preference ledger; model infers from reviews/prose | High on missing capability | P1 | Data honesty + state |
| E2E-05 | Alternatives to GELH courses | Search same subject/constraint space | Searches unrelated courses; corrected by student | Search prefix; discussed courses; catalog sets | No subject anchor/goal state; history truncation; regex referent only | Medium | P2 | Context + intent |
| E2E-06 | Search results | Consistent list and answer | Populated list + "No matching courses on this site" | `search_catalog` always-rich; rule 3; failure alerts | Failure/empty conflation; multi-tool aggregation; model text vs renderer | High | P2 | Error taxonomy + aggregation |
| E2E-07 | Course that fits schedule | Verify sections/constraints before recommending | Suggests plausible candidates without schedule verification | Search lacks day/time; sections sequential; step cap | Missing discovery tool; prompt does not require fit validation | High | P1 | Tools + response contract |
| E2E-08 | Let assistant explore | Use tools to find options | Repeatedly asks student for course codes | Per-instructor tools; 8 steps; no bulk discovery | Tool coverage + budget; prompt's "ask one question" fallback | High | P1 | Tools |
| E2E-09 | Continue timetable discussion | Distinguish saved, preview, manual edits | Mixed; scenario context improved it | Digest, previews, scenario referent | Mostly strong; residual caps/staleness/preview limits | Medium | P3/P2 | Context refinement |
| E2E-10 | Long session | Preserve plan and continue | Context loss, then hard stop | 30-turn cap, 8 history, 200-char tool stubs, no persistence | No durable state; lossy shaping; quotas per run | High | P1/P2 | Persistence + context |

### 13.3 Cross-cutting patterns

1. **Model belief vs UI state.** The assistant can truthfully report tool success and falsely report what the student sees. E2E-01 and E2E-02 share this root.
2. **Constraint-blind discovery.** E2E-05, E2E-07, and E2E-08 are all consequences of no schedule/rating/plan-aware search.
3. **Semantic scale/data gaps.** E2E-03 and E2E-04 are not just model errors; the data layer does not make the meaning machine-readable.
4. **Lossy memory.** E2E-04, E2E-05, and E2E-10 share the absence of a durable planning ledger.
5. **Failure flattening.** E2E-06 is a direct consequence of "tool failed ⇒ no matching data" plus always-rendered search.

### 13.4 Timetable continuity (E2E-09)

This area is materially better than the rest of the session because V2.3 invested in deterministic context:

- The digest is recomputed each request from the active plan.
- Saved-versus-preview scenario resolution is deterministic and has ambiguity handling.
- Previews are snapshots with staleness flags; the model is told not to blend them with the digest.
- Manual planner edits are reflected in the next digest because the active plan is client state.

Residual risks:

- Only the last two previews and 1,200 characters survive.
- The digest can shrink and set `complete:false`; the model must caveat, and there is no guarantee it does.
- A preview can become stale after manual edits; the model must use the stale flag.
- A huge plan can lose meetings/sections from the digest; conflict-free conclusions must be limited.
- The plan is client-supplied; a malformed/stale context can produce wrong tool results.

Overall: **strongest part of the current assistant; keep and extend, do not rewrite first.**

---

## 14. Test & Evaluation Coverage

### 14.1 Inventory

| Group | What it asserts | Model |
|---|---|---|
| Unit/component tests (`tests/assistant/*`) | Prompt text, tool wiring, script/language hints, page referent, no write tools, context shaping, digest, previews, scenario, history limits | Mocked/no model |
| API tests (`tests/api/copilotkit.test.ts`, access tests) | Auth, access mode, rate limit, turn/body limits, connect/info/stop | Runtime mocked |
| Component tests (`tests/components/*`) | Markdown, GFM tables, tool traces, cards, composer, copy, filters, previews | Scripted `MockLanguageModelV3` in jsdom |
| Integration tests (`assistant-runtime`, `assistant-v2-*`) | Real panel/CopilotKit route/runtime/BuiltAgent with scripted model; cards/filters/previews render | Scripted model, jsdom |
| Eval harness (`evals/assistant/*`) | Production agent/prompt/tools with mocked data; navigation simulation; grading | Live DeepSeek only when `ASSISTANT_EVAL=1` |
| Result artifacts (`.eval-results/assistant/`) | Historical run JSON, local and gitignored | Live runs from this machine |
| Browser acceptance | Manual matrices in verification docs | Largely not run |

### 14.2 What the suite proves

- The assistant is wired to the intended prompt, tools, model config, and render conditions.
- Authentication, access modes, rate limits, body/message caps, and stop/connect behavior work.
- Data schemas validate and the assistant is read-only (including a source-level guard).
- Deterministic helpers (history shaping, digest, previews, referents, filtering) behave as unit-tested.
- Cards and tables render in jsdom with scripted tool results.
- Graders and eval cases are internally consistent.

### 14.3 What it does not prove

- That DeepSeek gives correct, useful academic advice.
- That the assistant recognizes paraphrased planning intents.
- That a recommendation follows from retrieved evidence or verifies the student's constraint.
- That preferences remain consistent across turns.
- That card/section/timetable choices are appropriate for the question (only exact expected selections).
- That the browser UI works at 380/450px, during streaming, with real network latency, or after reload.
- That long sessions, persistence, history restoration, or the 30-turn cap behave acceptably.
- That costs or latency stay within a budget.
- That error states are truthful and distinguishable.
- That real catalog scale (many courses, instructors, sections, reviews) works.

### 14.4 Fixtures and overfitting

- The eval catalog is tiny: roughly two courses, three instructors, one or two reviews each, and one injection review. The timetable is a fixed two-course plan.
- The semantic suite uses fixed phrases; the holdout was reportedly reused during tuning; the presentation benchmark was tuned to 39/39 and then its holdout scored 10/10; timetable forbid regexes were changed after observed wording.
- The conversation holdout passes ~95–96% while the full suite failed at 66.7–77.8%, suggesting the holdout is easier/differently distributed, not a clean generalization test.
- The tests reward the right tool, landing page, required mentions, language/script, exact card selection, and safety phrases. They do not score sequencing, workload reasoning, alternatives, prerequisite strategy, or explanation quality.
- A poor but compliant answer can pass: name a course, call a read-only tool, show the expected card, avoid banned words, and give generic advice.

### 14.5 Browser and long-session gaps

- No Playwright/Cypress/WebDriver dependency exists; browser matrices are manual and repeatedly marked unverified.
- Long-session tests do not exercise live turns, reload, persistence, or 30-turn behavior.
- Context projection unit tests exist, but not end-to-end quality after eight turns.
- The v2.3 acceptance documents disagree on conversation results and test counts; the release was blocked at least once on browser verification.

### 14.6 Recommended quality metrics

Add to the eval/gate set:

- **Planning outcome:** does the recommendation satisfy all stated constraints (day/time, credits, offered, no clash, rating/difficulty, exam preference when data exists)?
- **Evidence grounding:** every recommendation cites tool facts; review-based claims are supported; no invented fields.
- **Preference consistency:** a preference stated at turn 2 still holds at turn 10 unless changed.
- **Clarification efficiency:** number of avoidable clarification questions per completed task.
- **Alternative quality:** are alternatives in the requested subject/constraint scope, and are they compared on the right dimensions?
- **Rich UI appropriateness:** card/table/preview choice matches the intent; no card flooding; no duplicate card; no false "shown" claim.
- **Error honesty:** failure vs empty vs no-match are distinguished in prose and UI.
- **Long-session:** 15–30 turns with context retention; persistence reload; quota behavior.
- **Cost/latency:** tokens, steps, wall time, and cost per completed journey.
- **Browser:** real streaming, 380/450px, mobile gate, keyboard/focus, reload, historical cards.
- **Paraphrase/adversarial:** intent variants not present in the training phrases; prompt injection via reviews.

No tests or live evals were executed during this audit. Doc-reported totals range from 232 files/1,749 tests (V2.1) to 249 files/2,019 tests (V2.3 remediation), with later reports of failing `aka` drift. These are historical claims, not current audit results.

## 15. Security & Operational Risks

### 15.1 Verified protections

The security posture is materially better than the product-behavior posture:

- **Authentication and access are checked on the server for every CopilotKit method**, not only for the visible launcher ([app/api/copilotkit/[[...slug]]/route.ts:123-137](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L123)). `connect` is reduced to an empty event stream, and unknown paths return 404.
- **The assistant is read-only.** The server tool set contains catalog, instructor, review, section, presentation, and timetable-analysis tools only; no enrollment, profile, comment, or plan mutation exists ([lib/assistant/tools.ts:111-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L111)). A source-level guard test asserts the absence of write tools ([tests/assistant/read-only-planner.test.ts](file:///Users/thomaswu/workspace/next-web/tests/assistant/read-only-planner.test.ts)).
- **Access-control failures fail closed.** A missing mode, a missing tester lookup, or an access-check exception resolves to `off`/false ([lib/assistant/access.ts:26-46,71-87](file:///Users/thomaswu/workspace/next-web/lib/assistant/access.ts#L26)).
- **Rate limits are keyed by a hash of the Clerk user id, and storage failure is a 503 rather than an allow** ([lib/assistant/rate-limit.ts:14-37](file:///Users/thomaswu/workspace/next-web/lib/assistant/rate-limit.ts#L14); [route.ts:90-104](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L90)).
- **Request bounds exist**: 256 KB body, 200 messages, 30 user turns, 8 model steps, 2,000 output tokens per step, 30 s per model fetch ([lib/assistant/conversation.ts:3-4](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6); [lib/assistant/config.ts:29-34](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L29)).
- **System/developer roles from the client are dropped before the model sees history** ([lib/assistant/conversation.ts:12,60-65](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L12)).
- **The runtime stores no durable conversation content.** `InMemoryAgentRunner` is bounded to 16 threads, 8 runs per thread, and 2 MB; the API route logs counts and continuation state, not prompts or replies ([route.ts:39-44,109-114](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L39)).
- **Rich results use typed parsers.** Search, detail, sections, filters, and previews are parsed and rendered by dedicated components, not by model-supplied HTML ([lib/assistant/rich-tools.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/rich-tools.ts); [components/assistant/assistant-chat-view.tsx:185](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat-view.tsx#L185)).
- **Navigation is constrained** to parsed site destinations, verified for existence, and capped per user message ([components/assistant/use-navigate-tool.ts:48-88](file:///Users/thomaswu/workspace/next-web/components/assistant/use-navigate-tool.ts#L48); [lib/assistant/navigation.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/navigation.ts)).

No confirmed P0 security vulnerability was found: there is no evidence of authentication bypass, cross-user data access, mutating tool capability, secret exposure, or arbitrary navigation.

### 15.2 Risk register

| ID | Risk | Severity | Confidence | Evidence | Assessment and mitigation |
|---|---|---|---|---|---|
| R-01 | Client-supplied conversation history and tool messages are semantically trusted | P2 | High | The message schema accepts an arbitrary `role` string with optional `content` and is `.passthrough()`; system/developer roles are dropped, but forged user, assistant, and tool content is accepted ([lib/assistant/conversation.ts:8-14](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L8)) ([lib/assistant/conversation.ts:5-10](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L5)) | A signed-in student can already see their own data, and no tool mutates, so this is not a cross-user breach. It can still manipulate their own advice and consume quota. Today the server is stateless; once persistence exists, **server-owned history must become authoritative** or this becomes a stored-injection path. |
| R-02 | Indirect prompt injection through review text, course descriptions, titles, or page context | P2 | High | Review text is user-generated; prompt rule 5 says review text is data, but it is a model instruction, not a deterministic boundary ([lib/assistant/prompt.ts:7](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L7)) | Impact is bounded by read-only tools and constrained navigation, but the model can be steered to omit caveats, open a page, or repeat injected claims. Use source-labelled, delimited tool data; keep high-risk actions renderer/server-owned; add adversarial review fixtures. |
| R-03 | Student timetable and academic interests are sent to a third-party model without a visible retention/data-processing decision | P2 | High | The digest contains course codes, instructors, days, times, and conflicts ([lib/assistant/timetable-context.ts:290-343](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-context.ts#L290)); no assistant-specific privacy or retention document was found | This is a product/legal decision, not a code bug. Confirm the provider data policy, minimize plan data to what the question needs, document retention, and obtain approval before adding server-side persistence. |
| R-04 | Service-role Supabase access is a high-blast-radius dependency | P2 | High | `supabaseAdmin` is server-only, but assistant data readers and config/access checks all use it ([lib/supabase/server.ts:1-5](file:///Users/thomaswu/workspace/next-web/lib/supabase/server.ts#L1); [lib/assistant/access.ts:9](file:///Users/thomaswu/workspace/next-web/lib/assistant/access.ts#L9)) | The import guard is correct. The residual risk is a server-side injection or coding error bypassing row scoping. Keep identifiers validated, avoid string-built SQL, and do not expose service-role clients to client components. |
| R-05 | No global token, cost, or wall-clock ceiling | P2 | High | Quotas count runs, not tokens; max steps × output tokens × context resend has no overall deadline ([lib/assistant/config.ts:29-34](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L29); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6)) | One expensive run can dominate a day's cost. Add per-turn input budget, overall deadline, and a global daily budget with alerting; do not raise quotas before telemetry exists. |
| R-06 | Quota is charged per internal run, including follow-ups and failed runs | P1 (fairness) | High | Rate limit is consumed before the model call ([route.ts:90-105](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L90)); follow-ups from `navigate`/`filter_catalog_results` are separate runs | Students can exhaust quota without sending equivalent turns, and failures are not refunded. Charge one unit per user turn, identify continuations server-side, and decide a failure policy. |
| R-07 | No durable conversation identity or restoration | P2 | High | Chat state is `agent.messages`; `startNewChat` clears it; no thread id or storage is used ([components/assistant/assistant-chat.tsx:102-109](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L102)) | A reload or worker restart loses the plan and renders previous cards unrecoverable. This is primarily a UX/data-loss issue; it also prevents abuse investigation. |
| R-08 | Observability is insufficient for correctness incidents | P2 | High | Per-step metrics exist, but there is no run id, tool-level audit, error taxonomy dashboard, or usage page; route logs counts only ([route.ts:109-114](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L109)) | Incidents like E2E-06 or false card claims cannot be reconstructed from production. Add privacy-preserving structured events: run id, turn id, tool name/status, steps, tokens, latency, error code. Do not log content by default. |
| R-09 | Access-mode cache and preview override can delay or bypass the expected gate | P3 | Medium | Access is cached for 300 s; preview mode reads `ASSISTANT_ACCESS_OVERRIDE` ([lib/assistant/access.ts:18-23,48-51](file:///Users/thomaswu/workspace/next-web/lib/assistant/access.ts#L18)) | The cache is disclosed in the admin UI and the override requires `PREVIEW_MODE=1`. Verify preview configuration is not reused in production; keep the override out of production builds. |
| R-10 | Environment and documentation drift can make operators misjudge production | P2 | High | `.env.example` sets 1,200 output tokens while `wrangler.jsonc` and code default to 2,000; V1-E docs say `maxSteps` 5 while HEAD is 8 ([.env.example:66](file:///Users/thomaswu/workspace/next-web/.env.example#L66); [wrangler.jsonc:78-85](file:///Users/thomaswu/workspace/next-web/wrangler.jsonc#L78); [docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md:7](file:///Users/thomaswu/workspace/next-web/docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md#L7); [docs/superpowers/plans/2026-10-18-ai-assistant-v1.md:1226](file:///Users/thomaswu/workspace/next-web/docs/superpowers/plans/2026-10-18-ai-assistant-v1.md#L1226); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6)) | A deployment can differ from the audited assumptions. Make one documented source of truth, validate env at startup, and include effective settings in the admin/status surface. |

### 15.3 Trust-boundary analysis

The system has three different trust levels that the current design partly conflates:

1. **Server-owned deterministic context** — page description and timetable digest are computed from client state or app state, but the client supplies the underlying plan. They are trustworthy for *shape* because the client code computes them, but not trustworthy as a security boundary. A malicious client can send a fabricated timetable context.
2. **Tool-returned academic data** — authoritative for catalog facts, but review bodies and some descriptions are user-generated and must be treated as untrusted content. Prompt rule 5 acknowledges this but does not create a mechanical boundary.
3. **Model output and client history** — entirely untrusted. The model can be wrong, and the client can edit any message.

The most important consequence is not a remote exploit. It is **decision integrity**: a student can receive confident advice based on a forged context/history, or a malicious review can steer an answer. Because the tool set is read-only and navigation is constrained, the practical blast radius is wrong advice, wasted quota, and same-site navigation. That is still unacceptable for an academic planning product, but it should be prioritized as a correctness/trust problem rather than a critical vulnerability.

A future persistence design changes the boundary. If server history is stored, the server must own it and must not trust a client-supplied transcript for the same conversation id. If a planning ledger is persisted, every entry needs provenance (`student-stated`, `inferred`, `confirmed`) and a timestamp. A client-side ledger is a hint, never an authority for high-stakes facts.

### 15.4 Operational readiness

- **No run-level trace.** A support report cannot be tied to a specific request beyond console lines. Add a request/run id that is safe to show to a student ("reference: …") and log tool status without content.
- **No cost guardrail.** Hourly/day quotas limit requests, not spend. A single oversized context can cost more than many normal turns.
- **No fallback or retry policy.** A provider timeout or 5xx fails the turn after quota consumption. There is no secondary model, no bounded retry, and no user-visible distinction between "model unavailable" and "no data".
- **No release flag for prompt/tool behavior.** Prompt changes ship with code. A bad instruction change cannot be disabled independently of the deployment.
- **No browser-level smoke gate.** Verification remains manual for streaming, panel widths, reload, and historical cards. This is an operational risk because the highest-impact failures in the supplied E2E evidence are UI-state failures.

### 15.5 Security conclusion

The authentication, read-only, navigation, and fail-closed patterns are sound and should not be weakened for convenience. The highest-priority security-adjacent work is **not** a new sandbox or a new auth system. It is:

1. make presentation and error behavior truthful;
2. add provenance and server authority before persistence;
3. add privacy-preserving run telemetry and a global budget;
4. keep untrusted review/page content structurally separated from instructions.

---

## 16. Architecture Decision Recommendations

The eight decisions below are the implementation-shaping choices behind V2.3.5. Each is written as a proposed ADR: context, current implementation, options, recommendation, risks, confidence, and prerequisites. They are recommendations for review, not approved decisions.

### 16.1 ADR-01 — Instruction ownership: small principle core plus deterministic policy

**Status:** Proposed.

**Context.** The assistant's behavior is currently specified almost entirely in `ASSISTANT_PROMPT`, a 20,319-character string with 20 numbered rules and a long unnumbered policy block ([lib/assistant/prompt.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts)). The prompt encodes tool selection, review prerequisites, card visibility, navigation, language, table shape, and error wording.

**Current implementation and evidence.** Rule 3 tells the model to answer only from this turn's tool results and to say "no matching data" on failure ([lib/assistant/prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5)). Rule 18 requires reviews before recommendation ([line 20](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L20)). The last line forbids reviews unless the student asks what reviews say ([line 37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L37)). Rule 11 contains a phrase list for card display and says to default to omitting cards ([line 13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13)). These are not edge cases; they are direct policy conflicts.

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Continue prompt-only policy, shorten or reorganize the existing prompt | Fast; no server changes; preserves current tests | Contradictions remain; every behavior change still needs a model to obey prose; no enforcement; prompt grows again under pressure |
| B. Keep a short principle prompt for language, scope, tone, uncertainty, and explanation, and move enforceable policy into code | Testable; deterministic; less prompt cost; feedback can be explicit | Requires product decisions, tool/renderer changes, and new tests; some behaviors become less flexible |
| C. Model routing, fine-tuning, or an agent framework | Could improve specific behaviors | Premature; confounds prompt/tool defects; higher cost and operational complexity; no evidence the model is the binding constraint |

**Recommendation.** **Option B.** The prompt should state *what kind of assistant this is* and *how to explain and qualify*; code should own *what is allowed or required*. Concretely:

- Tool sequencing that is a product rule (for example, review evidence before a review-based judgment) should be enforced by requiring a review tool result in the turn, or by having a planning tool return the evidence bundle. It should not be a sentence the model can ignore.
- Card visibility should be renderer policy, not a phrase list (ADR-02).
- Empty/failure/no-match should be a typed tool result and a deterministic UI/error mapping, not a prose instruction (ADR-03 and Section 17).
- Context precedence for the timetable and course referents is already deterministic; keep it in code and state it once in the prompt.
- Review cost control should be a tool/budget rule, not the contradictory "do not call reviews" sentence.

**What should remain in prose.** Language and script choice; scope and refusal; tone; how to explain uncertainty; how to summarize evidence; when to ask one clarifying question; how to phrase a recommendation as an interpretation. These are judgment and style, not state-machine rules.

**Risks and mitigations.** Over-constraining could make the assistant rigid. Mitigate with a small set of explicit policy tests, a versioned prompt, and a rollout flag. A prompt rewrite can regress navigation or language; retain the existing deterministic language/script hints and run the full journey suite before changing defaults.

**Confidence.** High that prompt-only policy is a primary bottleneck. Medium on the exact boundary between prose and code until the product rules are ratified.

**Prerequisites.** A ratified policy inventory; agreement on the review-requirement rule; presentation contract (ADR-02); error taxonomy (Section 17); prompt-version rollout mechanism.

### 16.2 ADR-02 — Presentation: semantic intent, renderer authority, truthful receipt

**Status:** Proposed.

**Context.** Rich cards are the main way the assistant can make academic data usable in a narrow panel. The current contract makes them opt-in by phrase and gives the model no reliable knowledge of what the student actually sees.

**Current implementation and evidence.** `present_response` accepts up to three `course_detail` or `course_sections` claims ([lib/assistant/presentation.ts:8-102](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L8)). The tool description says "Default: omit this tool" and lists explicit phrases that justify a card ([lib/assistant/tools.ts:236-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L236)). The renderer mounts a course card only when the claim matches a same-turn `get_course` result, and a section card only when it matches a same-turn `get_course_sections` result ([lib/assistant/presentation.ts:195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L195)). `executePresentResponse` returns `accepted` based only on argument shape; it does not know whether a lookup exists or whether a card will render. A prior-turn lookup cannot be claimed.

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Keep the phrase gate and add more phrases | Minimal change; preserves the anti-clutter intent | Fragile; rewards magic words; still no receipt; fails exploratory evaluation |
| B. Always render every successful lookup | Guarantees visibility; simple | Card flooding; duplicates; heavy panel; poor for short factual answers |
| C. Semantic presentation intent plus a deterministic renderer policy and a truthful receipt | Matches user intent; bounded; testable; eliminates false claims | Requires contract and component work; needs a clear policy for when not to show |

**Recommendation.** **Option C.** Replace phrase-gated `present_response` with a two-layer contract:

1. **The model may state a presentation intent** (for example `detail`, `sections`, `compare`, or `none`) as part of its answer or a typed tool call. It should never need to know a width, phrase list, or renderer implementation.
2. **The renderer decides what is mounted** from the turn's tool results, the intent, and a bounded policy: search results always list; a course being evaluated/recommended may show one detail card; a schedule fit check may show sections; an explicit inspect request shows detail; a comparison uses a table or at most two compact cards; duplicates and superseded claims collapse. Do not stack cards for comparison.
3. **The receipt must be truthful.** Either rename the tool result from `accepted` to `requested`, or return a post-render visibility state. The model must not be able to say "I showed you the card" based on shape-only acceptance. A practical approach is to keep model prose non-committal ("Here are the details") and publish the rendered block list into context on the next turn for follow-ups. E2E-01 is structural: a same-turn lookup from a prior turn cannot be mounted, and the model is not told that.
4. **Expose a UI affordance** (show details / show sections / compare) so the student does not need to discover model phrases. The assistant can still choose a card for evaluation; the affordance makes intent explicit when the model is unsure.

**Risks and mitigations.** Always-on evaluation cards may feel heavy. Bound to one card per course, at most two or three candidates, and suppress when prose already answers. Keep a "show more" expansion. Preserve the existing parsers and components rather than building a new card system.

**Confidence.** High. The false-claim mechanism is directly visible in the code, independent of the missing transcript.

**Prerequisites.** Product decision on default card policy; agreement that the renderer owns mounting; updates to presentation tests and message fixtures; a way to represent rendered blocks in follow-up context.

### 16.3 ADR-03 — Academic facts: machine-readable semantics, not prose scales

**Status:** Proposed.

**Context.** Academic correctness depends on scale direction, sample size, aggregation, truncation, term, and data availability. The current system puts most of that in prose or omits it.

**Current implementation and evidence.**

- The prompt's final paragraph explains that difficulty is 1 Very hard to 5 Very easy, grade is 1 F to 5 A, and higher difficulty is easier ([lib/assistant/prompt.ts:37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L37)). The canonical scale exists in code ([lib/assistant/rating-semantics.ts:1-7](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L1)), but it is not attached to tool results.
- Instructor search's `maxDifficulty` is implemented as `hard <= value`, and the default sort is ascending difficulty ([lib/assistant/tool-schemas.ts:146-153](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L146); [lib/assistant/data/instructor.ts:87,92-93](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/instructor.ts#L87)). Numerically ascending difficulty means hardest first, which is the opposite of the intuitive reading of "max difficulty".
- `SMALL_REVIEW_SAMPLE = 5` exists but is unused ([lib/assistant/rating-semantics.ts:9](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L9)).
- Review bodies are truncated at 600 code points, with no per-review dimension fields and no total count ([lib/mcp/data/get-course-reviews.ts:14-47,122](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-reviews.ts#L14)).
- Sections are sliced to 20 sections and 20 meetings per section without a truncation flag or term echo ([lib/mcp/data/get-course-sections.ts:10-11,109,128-137](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-sections.ts#L10)).

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Keep the explanation in the prompt | No data changes | Requires the model to remember and correctly apply a counterintuitive scale; fails after history loss; filters remain traps |
| B. Invert the stored/displayed difficulty scale | Intuitive UI | Breaking change across existing UI, reviews, and legacy data; high migration risk |
| C. Attach semantics and sample metadata to tool results, fix filter/sort naming, and expose data gaps | Correct without migrating values; testable; works across models | More output fields; needs consistent adoption by all tools and renderers |

**Recommendation.** **Option C**, with a display-level fix later if product agrees.

- Every aggregate result carries its sample size (`commentCount` where present), a `smallSample` flag, and a `scale` descriptor (`minLabel`, `maxLabel`, `higherMeans`). The prompt can then say "use the scale returned with the data" instead of restating it.
- Rename or redefine `maxDifficulty` as an ease threshold (for example `minEase`) and make the sort direction explicit. At minimum, document the inversion in the schema and reject ambiguity.
- Add `truncated`, `term`, `complete`, and `totalCount` where data is sliced. An empty sections result should distinguish "course has no sections" from "no sections matched this term" when the data supports it.
- Keep the 600-code-point review cap but mark it. Do not present a partial review as complete.
- Represent unsupported data explicitly: `examFormat: unavailable`, `prerequisites: unavailable`, `seats: unavailable`. Do not let the model infer a field from review prose.

**Risks and mitigations.** More fields increase token size. Put concise scale metadata once per result or once per tool response, not per row. Avoid changing stored values in V2.3.5. Add tests that a low-sample result is caveated and that the filter direction matches its name.

**Confidence.** High on the semantic defects. Medium on whether difficulty should eventually be inverted in the UI; that is a product decision.

**Prerequisites.** Agreement on canonical scale semantics; data-owner review of review aggregates; a migration-free response-schema change plan.

### 16.4 ADR-04 — Planning discovery: bounded read-only candidate search and batch validation

**Status:** Proposed.

**Context.** Students ask for courses that satisfy constraints: a free weekday, a time window, a workload limit, a rating threshold, no clash with a saved plan, or an alternative in the same subject. The current tool surface cannot express most of these.

**Current implementation and evidence.** `search_catalog` supports a free-text query, faculty, department, credits, course type, program level, suggested year, offered-only, search scope, sort, and pagination ([lib/assistant/tool-schemas.ts:19-50](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L19)). It has no day, time, rating, difficulty, workload, exam, or plan-conflict filter. `get_course_sections` is scoped to one instructor's offering ([lib/assistant/tools.ts:221-222](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L221)), and `check_plan_conflicts` also needs an instructor. Rule 17 requires per-instructor section lookups, up to three ([lib/assistant/prompt.ts:19](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L19)). With an 8-step cap, multi-candidate validation is often impossible, which explains E2E-07 and E2E-08.

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Add many optional filters to `search_catalog` | Reuses an existing tool; familiar | The tool becomes a complex query surface; section/plan validation still requires follow-up calls; ambiguous empty results |
| B. Add one bounded planning-discovery tool that returns candidates with matching sections and plan-conflict status | Matches the product question; controls steps and output size; can state data gaps | New query/RPC work; needs normalized meeting data and careful caps; risk of false precision |
| C. Let the client filter loaded rows | Cheap; no server work | Only filters the current page; cannot discover un-loaded courses; wrong for planning |

**Recommendation.** **Option B.** Add a read-only tool whose input is a small, explicit set of planning constraints and whose output is bounded:

- criteria echo: term, weekdays, time window, credits, offered, minimum rating/ease, sample-size rule, exclude-conflict-with-saved-plan;
- at most 5–8 candidates, each with course code/title/credits/offered, aggregate rating and sample size, matching section summaries, and deterministic conflict status;
- `dataGaps` and `truncated` fields;
- no enrollment/seat claims.

The tool should reuse existing catalog tables, section/meeting data, and the deterministic timetable analysis. It must not introduce a new framework or a separate database. If section-time normalization cannot support a constraint in V2.3.5, the tool should reject that constraint explicitly rather than silently ignore it. Batch section/conflict validation for a shortlist is the minimum viable subset; day/time filtering is the higher-value extension.

**Risks and mitigations.** A single tool can become a slow, overly broad query. Cap candidates and scanned rows, use existing indexes/RPCs, time out gracefully, and return a "narrow your constraints" result. Do not let the model infer conflict-free status when `complete` is false. Measure latency before enabling by default.

**Confidence.** High that the capability gap is a primary cause of poor planning. Medium on the V2.3.5 scope for day/time filtering until the section-time data is validated for all terms.

**Prerequisites.** Verified section meeting data and term boundaries; deterministic conflict analysis (already present); a query/RPC design; step and output budgets; evaluation journeys with real constraints.

### 16.5 ADR-05 — Conversation state: durable thread plus a planning ledger, separate from volatile facts

**Status:** Proposed.

**Context.** The assistant forgets the student's plan, preferences, and prior decisions. Increasing the history window alone will not fix this, because old tool results are intentionally squeezed and there is no structured state to carry forward.

**Current implementation and evidence.** Chat state is only `agent.messages` in React; `startNewChat` clears it and resets catalog filters ([components/assistant/assistant-chat.tsx:102-109](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L102)). The server shapes history to the current plus eight prior user turns and squeezes every older tool result to 200 characters ([lib/assistant/conversation.ts:3-5,50-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3)). There is no thread id or persistence. A request with more than 30 user turns returns 409 ([route.ts:85-88](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L85)). The discussed-courses context only summarizes validated `get_course` results, not preferences or goals ([lib/assistant/discussed-courses.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/discussed-courses.ts)).

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Raise history turns and the turn cap | Trivial | More prompt cost; still loses tool facts; no reload recovery; no goals/preferences |
| B. Persist the raw transcript in localStorage only | Fast; no migration; restores after reload on one device | No cross-device; client-controlled; no server-side support; privacy surface in browser |
| C. Server-owned conversation plus a structured planning ledger | Reliable; supports reload/devices; server can validate; enables audit and summaries | Migration, retention, privacy, latency, ownership, and deletion work |

**Recommendation.** **Option C, staged.** V2.3.5 should establish the minimum durable model:

- a stable `conversationId` owned by the Clerk user;
- a server-side conversation record following the existing timetable ownership pattern, with RLS and service-role writes;
- recent raw turns plus a compact summary for older turns;
- a **planning ledger** containing only student-stated or confirmed goals and preferences, shortlisted options, decisions, rejected options with reasons, pending questions, and the plan/version reference;
- volatile catalog and timetable facts are **not** stored as truth; they are recomputed and revalidated every turn;
- server history is authoritative when a conversation id is present; client-supplied history is validated or ignored;
- retention and user deletion are part of the first schema, not a later cleanup.

If V2.3.5 cannot absorb the migration, the fallback is a client-persisted transcript plus a client-supplied ledger treated strictly as untrusted hints. That is a stopgap, not the target architecture.

**Risks and mitigations.** Persistence adds privacy obligations and storage cost. Minimize content, set a retention period, support deletion, encrypt at rest via the existing platform, and do not persist raw review text or unnecessary timetable details. A persisted ledger can become stale; every derived fact must carry a version and be recomputed.

**Confidence.** High on the need. Medium on delivery size; the migration and privacy review may push the full version past V2.3.5.

**Prerequisites.** Approved retention/privacy policy; ownership schema; migration review; a resume/hydration design; tests for server-authoritative history and deletion.

### 16.6 ADR-06 — Quota and runtime configuration: one unit per student turn, bounded admin control

**Status:** Proposed.

**Context.** Quota is currently charged per model run, and all meaningful runtime settings are deployment-only. This is both unfair to students and operationally opaque.

**Current implementation and evidence.** `consumeAgentRateLimits` runs before every model call ([route.ts:90-105](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L90)). Follow-up runs from `navigate` and `filter_catalog_results` are not exempt. The admin can change only access mode and testers; quotas, model, thinking, tokens, timeout, steps, history, and prompt are env/code ([components/admin/assistant-access-client.tsx:58-80](file:///Users/thomaswu/workspace/next-web/components/admin/assistant-access-client.tsx#L58); [app/api/admin/app-config/route.ts:42-46](file:///Users/thomaswu/workspace/next-web/app/api/admin/app-config/route.ts#L42); [lib/assistant/config.ts:24-35](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L24)).

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Keep per-run charging, raise limits | No code change | Unfair accounting; hides cost; encourages quota inflation |
| B. Charge once per user turn, with server-issued turn identity and explicit retry/failure policy | Fair; understandable; aligns with cost controls | Needs idempotency and continuation detection; follow-ups must not double-charge |
| C. Charge by token/cost budget | Most accurate | Hard to explain to students; requires reliable usage accounting and a prepaid model |

**Recommendation.** **Option B plus a global budget.** Charge one quota unit when the server accepts a new user turn, not for each internal follow-up. Use a server-issued turn id (or a signed continuation token) so a client cannot claim "continuation" to avoid charging. Define the failure policy explicitly: a failed model call should either refund the unit or allow one bounded retry within the same turn. Keep the hourly/daily quota per user and add a global daily token/cost ceiling with alerting.

Expose only bounded, validated runtime settings to platform admins through the existing `app_config` and audit log: quotas, max turns, history turns, max steps, max output tokens, timeout, approved model list, thinking mode, and feature flags. Keep API keys, base URLs, and free-form prompt editing out of the admin UI. Normal admins should retain access-mode and tester controls.

**Risks and mitigations.** Per-turn accounting can be gamed if continuation identity is client-controlled. Validate on the server and keep a per-turn run count. A global budget can cause abrupt unavailability; alert before the cap and return a clear `temporarily_unavailable` message.

**Confidence.** High on the fairness defect. Medium on the exact refund policy, which is a product decision.

**Prerequisites.** A turn/run identity contract; usage telemetry; a decision on failure refunds; a bounded settings schema.

### 16.7 ADR-07 — Verification: journey-based evaluation plus staged live-model qualification

**Status:** Proposed.

**Context.** The suite proves wiring, not academic planning quality. The eval phrases were tuned, the fixtures are tiny, and no live model or browser runs are part of a normal gate.

**Current implementation and evidence.** Tests cover auth, access, rate limits, body/message caps, prompt presence, deterministic helpers, and jsdom rendering ([tests/assistant](file:///Users/thomaswu/workspace/next-web/tests/assistant); [tests/api/copilotkit.test.ts](file:///Users/thomaswu/workspace/next-web/tests/api/copilotkit.test.ts)). The eval harness runs the production agent with mocked data and only calls DeepSeek when `ASSISTANT_EVAL=1` ([vitest.eval.config.ts](file:///Users/thomaswu/workspace/next-web/vitest.eval.config.ts)). The fixture catalog is roughly two courses and three instructors; graders reward exact tools, pages, phrases, and card selections. The holdout was reportedly reused during tuning. Browser matrices are manual.

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Keep phrase/tool assertions and add more cases | Fast; stable | Does not measure planning quality; can reward compliant but unhelpful answers |
| B. Add student-journey suites with a fixed scripted model plus deterministic data | Reproducible; cheap; can gate correctness and UI state | Does not measure model reasoning or paraphrase robustness |
| C. Add live-model qualification runs and browser E2E on a schedule | Measures the real product | Nondeterministic; costly; needs privacy and budget controls; flaky if used as a per-PR gate |

**Recommendation.** **Option B as the required gate, with Option C as a staged qualification.** Journey cases should assert:

- constraints satisfied (day/time/credits/offered/no clash/rating with sample size);
- evidence grounding and no invented fields;
- preference consistency across 10–20 turns;
- clarification efficiency;
- alternative quality within scope;
- correct rich-UI choice and no false "shown" claim;
- honest failure/empty/no-match;
- reload/persistence and quota behavior;
- cost/latency/steps.

Run deterministic journey tests on every change. Run live DeepSeek qualification before release and after prompt/tool changes, with multiple repeats and a budget. Add a small browser smoke suite for streaming, 380/450 px, reload, and historical cards. Do not add a browser framework only for a one-off manual check; choose the lightest option that can run in the existing CI.

**Risks and mitigations.** Model nondeterminism makes gates noisy; use rubrics, multiple repeats, and report distributions rather than a single pass/fail. Live runs cost money; cap them and keep them out of per-PR CI.

**Confidence.** High.

**Prerequisites.** Journey fixtures derived from real (redacted) dialogues; grading rubric; cost budget; browser test environment.

### 16.8 ADR-08 — Model strategy: keep DeepSeek through the rework, qualify alternatives after

**Status:** Proposed.

**Context.** The observed failures are concentrated in prompt contradictions, missing discovery tools, semantic traps, and state loss. There is no evidence that the model is the binding constraint.

**Current implementation and evidence.** `deepseek-flash` via `@ai-sdk/deepseek`, thinking off by default, 2,000 output tokens, 30 s per fetch, 8 steps, no fallback ([lib/assistant/config.ts:24-35](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L24); [lib/assistant/agent.ts:6-16](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6)). Live evaluation history shows the model can use the tools and follow language/script constraints; the failures are in conversation and planning metrics. The model/base URL are already configurable, so a replacement does not require an architecture rewrite.

**Options.**

| Option | Advantages | Disadvantages |
|---|---|---|
| A. Swap the model now | Quick to try; may improve some answers | Confounds prompt/tool/context defects; new cost/latency/privacy review; may hide rather than fix product bugs |
| B. Keep DeepSeek, fix the architecture, then benchmark approved alternatives on the same journeys | Clean attribution; lower risk; preserves cost profile | Delays any model benefit; requires a benchmark harness |
| C. Route tasks across multiple models | Potential cost/quality optimization | Complexity; inconsistent behavior; more provider risk; premature without evidence |

**Recommendation.** **Option B.** Set explicit qualification criteria after ADR-01 through ADR-07:

- planning-journey pass rate with constraints;
- grounding and no-invention rate;
- preference consistency over 10–20 turns;
- multilingual/script quality;
- steps, latency, and cost per completed journey;
- provider data-handling approval.

If DeepSeek fails a criterion after the architecture is corrected, test one stronger approved model on the failing journeys, and consider a planning-only fallback or router. Do not make a wholesale model swap the first move, and do not add a second provider without privacy and operational review.

**Risks and mitigations.** A benchmark can be overfit to the same phrases. Use unseen paraphrases and real anonymized journeys. Keep the prompt and tools identical across models.

**Confidence.** High that model replacement is not the first fix. Medium on whether DeepSeek remains the best choice after the rework.

**Prerequisites.** ADR-01 through ADR-07; a live qualification harness; approved provider list; budget.

## 17. Prioritized Findings P0–P3

### 17.1 Severity definitions

| Priority | Definition |
|---|---|
| P0 | Active security breach, cross-user data exposure, data loss with no recovery, or a total assistant outage |
| P1 | Repeatedly wrong or untrustworthy academic advice, a core product promise broken, or a failure with no acceptable workaround |
| P2 | Material degradation of experience, operability, fairness, or release confidence, with a workaround or bounded impact |
| P3 | Polish, documentation, minor inconsistency, or latent risk |

### 17.2 No confirmed P0

The audit found **no confirmed P0**. Authentication is enforced; the assistant is read-only; there is no cross-user data path; navigation is constrained; and the rate limiter fails closed. The severe failures are correctness and experience failures, not an active compromise.

This conclusion is limited by the evidence available: no production logs, no browser session, and no live model run was examined. A P0 could still exist in production configuration or provider-side behavior that is not committed to the repository.

### 17.3 P1 findings

| ID | Finding | Evidence | Corrective phase | Dependency | Classification |
|---|---|---|---|---|---|
| P1-01 | **Presentation claims are not tied to what the renderer shows.** `present_response` returns shape-only `accepted`; mounting requires a same-turn matching lookup; the model is not told when a claim cannot render. The student can be told a card was shown when it was not. | [lib/assistant/presentation.ts:56-102,195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L56); [lib/assistant/tools.ts:236-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L236); E2E-01, E2E-02 | Phase 1 | Phase 0 policy decision | Product/UI contract defect |
| P1-02 | **Review instructions contradict each other.** Rule 18 requires reviews before recommendation; rule 26 requires reviews for explicit referents; the final paragraph forbids reviews unless the student asks what reviews say. The model cannot satisfy all three. | [lib/assistant/prompt.ts:20,26,37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L20) | Phase 1 | Phase 0 rules ratification | Instruction defect |
| P1-03 | **Difficulty semantics are counterintuitive and the instructor filter/sort names encode the trap.** Higher difficulty means easier; instructor search `maxDifficulty` filters `hard <= value`; default ascending difficulty sorts hardest first. E2E-03 is consistent with this. | [lib/assistant/rating-semantics.ts:1-7](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L1); [lib/assistant/tool-schemas.ts:146-153](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L146); [lib/assistant/data/instructor.ts:87,92-93](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/instructor.ts#L87) | Phase 2 | Phase 1 contract | Data-semantics defect |
| P1-04 | **Discovery cannot express real planning constraints.** Search lacks day, time, rating, difficulty, workload, exam, and plan-conflict filters; sections/conflicts are per-instructor; the 8-step cap makes multi-candidate verification infeasible. This drives repeated course-code requests and unverified suggestions. | [lib/assistant/tool-schemas.ts:19-50](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L19); [lib/assistant/tools.ts:221-222](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L221); [lib/assistant/prompt.ts:19](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L19); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6); E2E-07, E2E-08 | Phase 3 | Phase 2 semantics; section-time validation | Capability gap |
| P1-05 | **Long sessions lose the plan.** History is client-memory only; only the current plus eight prior user turns survive; older tool results shrink to 200 characters; there is no durable conversation, goal, preference, or decision state; a request with more than 30 user turns returns 409. | [lib/assistant/conversation.ts:3-5,50-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3); [components/assistant/assistant-chat.tsx:102-109](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L102); [route.ts:85-88](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L85); E2E-04, E2E-10 | Phase 4 | Phase 1 presentation/state contract; retention decision | State/architecture gap |
| P1-06 | **Failure, empty, and no-match are collapsed.** Tools map all non-not-found failures to `temporarily_unavailable`; the prompt says to report "no matching data" for both empty and failure; search results still render independently, so prose can contradict a populated list. | [lib/assistant/tools.ts:61,69-88](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L61); [lib/assistant/prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5); [lib/assistant/rich-tools.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/rich-tools.ts); E2E-06 | Phase 2 | Phase 1 contract | Error-model defect |
| P1-07 | **Unsupported academic fields are treated as knowable.** There is no structured exam format, prerequisite, or seat data, yet the assistant can reason from review prose or general knowledge. The prompt only explicitly forbids inventing prerequisites and seats; exam preference has no capability boundary. | [lib/assistant/prompt.ts:9-10](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L9); [lib/assistant/tool-schemas.ts:19-50](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L19); E2E-04 | Phase 2 | Data-owner decision on unsupported fields | Data-honesty gap |
| P1-08 | **Quota is charged per internal run, not per student turn.** Follow-ups from navigation and catalog filtering consume units; failed/timed-out runs are not refunded. A small number of real turns can exhaust the hourly quota. | [route.ts:90-105](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L90); [components/assistant/use-catalog-results-tool.tsx:104-119](file:///Users/thomaswu/workspace/next-web/components/assistant/use-catalog-results-tool.tsx#L104); [components/assistant/assistant-panel.tsx:66](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-panel.tsx#L66); Section 11.3 | Phase 5 | Turn identity; usage telemetry | Fairness/operational defect |
| P1-09 | **The prompt's source hierarchy contradicts the context design.** Rule 3 says answer only from this turn's tool results and listed search results, while the page, timetable digest, discussed-courses, previews, and scenario referent are supplied as trusted context. The model is left to reconcile them. | [lib/assistant/prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5); [lib/assistant/agent.ts:39-77](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L39) | Phase 1 | Phase 0 source-of-truth policy | Instruction/context defect |

### 17.4 P2 findings

| ID | Finding | Evidence | Corrective phase | Dependency | Classification |
|---|---|---|---|---|---|
| P2-01 | **Admins cannot operate the assistant safely.** Only access mode and testers are editable; quotas, model, thinking, tokens, timeout, steps, history, and prompt are env/code. There is no usage or cost dashboard and no per-user consumption view. | [components/admin/assistant-access-client.tsx:58-80](file:///Users/thomaswu/workspace/next-web/components/admin/assistant-access-client.tsx#L58); [app/api/admin/app-config/route.ts:42-46](file:///Users/thomaswu/workspace/next-web/app/api/admin/app-config/route.ts#L42); Section 11.4 | Phase 5 | Quota/turn accounting; audit schema | Operability gap |
| P2-02 | **Section data can be silently incomplete.** 20 sections and 20 meetings are sliced without a truncation/complete flag or term echo; empty sections can be a success. This can support a false "no clash" or "no sections" conclusion. | [lib/mcp/data/get-course-sections.ts:10-11,109,128-137](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-sections.ts#L10) | Phase 2 | Section data review | Data-quality defect |
| P2-03 | **The timetable digest can shrink and hide data.** It progressively drops gaps, meetings, sections, conflicts, and day summaries, setting `complete:false`; correctness depends on the model honoring the caveat. The assistant can still state a broader conclusion if it does not. | [lib/assistant/timetable-context.ts:14-15,345-469](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-context.ts#L345) | Phase 3 | Deterministic caveat in tool/UI output | Reliability gap |
| P2-04 | **Review aggregates lack sample-size and dimension semantics.** The small-sample constant is unused; reviews expose only an aggregate `result`, not per-review difficulty/grade/workload; stored aggregates are coalesced to 0, so 0 can mean "no reviews" rather than a measured value, and the assistant gets no sample-size flag. | [lib/assistant/rating-semantics.ts:9](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L9); [lib/assistant/data/instructor.ts:60-64](file:///Users/thomaswu/workspace/next-web/lib/assistant/data/instructor.ts#L60); [supabase/migrations/20260812_comment_write_rpc.sql:22-42](file:///Users/thomaswu/workspace/next-web/supabase/migrations/20260812_comment_write_rpc.sql#L22); [lib/mcp/data/get-course-reviews.ts:14-47,92,122](file:///Users/thomaswu/workspace/next-web/lib/mcp/data/get-course-reviews.ts#L14) | Phase 2 | Data-owner semantics | Academic-correctness gap |
| P2-05 | **The 30-turn hard stop has no warning or handoff.** A long planning session ends with a 409 message that tells the student to start a new conversation, losing the plan. There is no summary export or continuation. | [route.ts:85-88](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L85); [lib/assistant/config.ts:33](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L33) | Phase 4 | Persistence/ledger | UX/state gap |
| P2-06 | **No cost, token, or wall-clock ceiling; no fallback.** Per-step timeout exists but a turn can still take minutes; quotas count runs; there is no global daily budget, no fallback model, and no retry policy. | [lib/assistant/config.ts:29-34](file:///Users/thomaswu/workspace/next-web/lib/assistant/config.ts#L29); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6); [route.ts:39-44](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L39) | Phase 5 | Telemetry; budget policy | Operational risk |
| P2-07 | **Verification does not measure the product.** Tests prove wiring, schema, and jsdom rendering; eval cases are phrase-tuned and tiny; no live model or browser is in the normal gate; long-session and planning quality are untested. | Section 14; [evals/assistant](file:///Users/thomaswu/workspace/next-web/evals/assistant); [vitest.eval.config.ts](file:///Users/thomaswu/workspace/next-web/vitest.eval.config.ts) | Phase 6 | Baseline journeys; budget | Quality-system gap |
| P2-08 | **Configuration and documentation drift.** `.env.example` says 1,200 output tokens; code and `wrangler.jsonc` say 2,000. V1-E docs say 5 steps; HEAD has 8. Older docs describe five academic tools; HEAD has nine. | [.env.example:66](file:///Users/thomaswu/workspace/next-web/.env.example#L66); [wrangler.jsonc:78-85](file:///Users/thomaswu/workspace/next-web/wrangler.jsonc#L78); [docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md:7](file:///Users/thomaswu/workspace/next-web/docs/superpowers/verification/2026-10-22-assistant-v1e-phase1.md#L7); [docs/superpowers/plans/2026-10-18-ai-assistant-v1.md:1226](file:///Users/thomaswu/workspace/next-web/docs/superpowers/plans/2026-10-18-ai-assistant-v1.md#L1226); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6) | Phase 0 | None | Documentation/operability |
| P2-09 | **The assistant is desktop-only.** The global assistant gate is `min-width: 1024px`; mobile/tablet users have no assistant even though the API and panel support a mobile overlay. | [components/assistant/desktop-assistant-gate.tsx](file:///Users/thomaswu/workspace/next-web/components/assistant/desktop-assistant-gate.tsx) | Product decision (later) | Product scope | Product gap |
| P2-10 | **Tool/results cost grows faster than the step budget.** Per-instructor section and review lookups plus 10-row review pages consume steps and re-sent context; the model is asked to validate up to three instructors with little room left. | [lib/assistant/prompt.ts:19](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L19); [lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6); [lib/assistant/tools.ts:191-222](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L191) | Phase 3 | Discovery tool | Efficiency gap |

### 17.5 P3 findings

| ID | Finding | Evidence | Corrective phase | Classification |
|---|---|---|---|---|
| P3-01 | The prompt says the chat is "about 380px" while the actual default is 450px and the panel resizes from 380 to 800. The model may over-compress answers. | [lib/assistant/prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13); [lib/assistant/panel-width.ts:1-2](file:///Users/thomaswu/workspace/next-web/lib/assistant/panel-width.ts#L1); [components/assistant/assistant-chat-view.tsx:357](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat-view.tsx#L357) | Phase 1 | Instruction hygiene |
| P3-02 | `SMALL_REVIEW_SAMPLE` is defined but unused, so the low-sample policy is not enforced anywhere. | [lib/assistant/rating-semantics.ts:9](file:///Users/thomaswu/workspace/next-web/lib/assistant/rating-semantics.ts#L9) | Phase 2 | Dead policy |
| P3-03 | The prompt says "do not assume every client renders cards" although the product has one renderer. This adds uncertainty without a real multi-client requirement. | [lib/assistant/prompt.ts:17](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L17) | Phase 1 | Instruction ambiguity |
| P3-04 | Preview scenarios can become stale after manual plan edits; the model must honor `stale`, and there is no automatic UI reconciliation. | [lib/assistant/timetable-previews.ts:13,134-139](file:///Users/thomaswu/workspace/next-web/lib/assistant/timetable-previews.ts#L13) | Phase 3 | Residual state risk |
| P3-05 | The admin audit view shows only the last 10 entries; there is no full audit page for access changes. | Section 11.1; [app/api/admin/app-config/route.ts:64-70](file:///Users/thomaswu/workspace/next-web/app/api/admin/app-config/route.ts#L64) | Phase 5 | Audit gap |
| P3-06 | Historical card behavior depends on the provider staying mounted; a reload loses both the conversation and the messages needed to reconstruct cards. | [components/assistant/assistant-chat-view.tsx:75-185](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat-view.tsx#L75) | Phase 4 | State gap |

### 17.6 Priority logic

The P1 set is deliberately narrow: it contains only defects that directly produce wrong advice, false UI state, or a broken planning session. The P2 set is mostly operability, data completeness, and verification. This distinction matters for V2.3.5: shipping a beautiful panel while P1-01 through P1-09 remain open would not improve the real student experience.

The dependency that most affects sequencing is **P1-03/P1-07 before P1-04**. Building a constraint-aware discovery tool on top of ambiguous difficulty semantics and unavailable-field guessing would automate the wrong conclusions. The second is **P1-01/P1-06 before P1-05**: persisting conversations that contain false card claims and conflated errors would preserve bad state.

---

## 18. Recommended V2.3.5 Scope

### 18.1 Release thesis

V2.3.5 should be **"the assistant tells the truth, understands planning constraints, and remembers the student's plan."** It should not be a prompt expansion, a card redesign, a model swap, or a V3 optimization release.

The recommended scope is built around four user-visible promises:

1. If the assistant says it showed something, the interface shows it.
2. If the assistant recommends something, the recommendation respects the constraints the student stated and the data the site actually has.
3. If the assistant does not have the data, it says so instead of inferring.
4. If the conversation continues, the assistant still knows the goal and the plan.

### 18.2 In scope for V2.3.5

| Workstream | Required outcome | Findings addressed | Exit criteria |
|---|---|---|---|
| A. Truthful interaction contract | Renderer owns card mounting; model prose does not claim a render it cannot verify; card policy is based on intent, not magic phrases; errors are typed | P1-01, P1-06, P1-09, P3-03 | E2E-01 and E2E-02 journeys pass; no card can render without a matching lookup; failure/empty/no-match are distinguishable in UI and prose |
| B. Instruction architecture reset | A shorter principle prompt plus deterministic policy for required lookups, presentation, errors, and context precedence; resolve the review contradiction | P1-02, P1-09, P3-01 | Prompt policy inventory approved; conflicting rules removed; no behavior depends on a phrase list; existing navigation/language tests still pass |
| C. Academic fact contract | Scale direction, sample size, truncation, term, and unsupported fields are machine-readable; fix `maxDifficulty`/sort semantics | P1-03, P1-07, P2-02, P2-04, P3-02 | A low-sample or incomplete result is caveated by construction; filter direction matches its name; unsupported exam/prerequisite/seat claims are refused |
| D. Planning discovery MVP | Add bounded read-only candidate discovery and batch section/conflict validation; accept day/time, credit, offered, and rating constraints where the data supports them; expose data gaps | P1-04, P2-03, P2-10 | A student can ask for a course that fits a stated constraint and receive candidates whose fit is verified or explicitly unverifiable |
| E. Conversation continuity | Stable conversation id, reload restoration, planning ledger, higher effective history with a summary, and a soft turn limit | P1-05, P2-05, P3-06 | Reload resumes the conversation and the ledger; a 15–20-turn session preserves stated preferences; the 30-turn stop has a handoff, not a dead end |
| F. Quota fairness | Charge per student turn, not per follow-up; define failure/retry policy; add a global daily budget | P1-08, P2-06 | One turn plus navigation/filter follow-ups consumes one unit; a failed turn is handled per policy; a budget alert exists |
| G. Journey verification | Planning-quality, preference-consistency, error-honesty, rich-UI, long-session, and browser smoke tests; staged live-model qualification | P2-07 | Release gate runs the journey suite and a small live/browser qualification; no claim of success from wiring tests alone |

### 18.3 Explicitly deferred

| Item | Why deferred | Where it belongs |
|---|---|---|
| Full constraint-aware day/time search across all terms | Depends on verified meeting-time normalization and query/RPC work; MVP batch validation delivers value first | V2.3.6 or V2.4 after Phase 3 data validation |
| Full server-side conversation store with multi-device sync | Privacy/retention approval and migration work may exceed V2.3.5; a client restoration + ledger stopgap can ship first | V2.4 |
| Full admin runtime settings surface and standalone usage/cost dashboard | Phase 5 ships only the bounded controls and aggregates needed to operate V2.3.5 safely; a full settings/dashboard product is not required to fix student-facing defects | Phase 5 (bounded) / V2.4 (full) |
| Model benchmark and possible replacement | Must follow ADR-01 through ADR-07; otherwise the result is confounded | After V2.3.5 |
| Structured exam-format, prerequisite, seat, or workload data | Requires product/data ownership and source verification, not a prompt fix | Product data roadmap |
| Mobile/tablet assistant | A product-scope decision, not a bug fix in the current desktop gate | Product decision |
| Proactive recommendations before the student asks | Requires a reliable plan ledger and consent model; premature while the basics are untruthful | V2.4+ |

### 18.4 Out of scope and guardrails

- **No model swap as the primary fix.** Keep `deepseek-flash`; benchmark later.
- **No new agent framework or orchestration library.** Reuse CopilotKit, AI SDK, existing tools, and Supabase.
- **No prompt growth.** The target is a smaller principle core, not a larger procedure.
- **No weakening of read-only, auth, access, or fail-closed behavior.**
- **No V3 work.** Degree audit, multi-agent planning, autonomous enrollment, and schedule optimization are not prerequisites for fixing intent and truthfulness.
- **No free-form admin prompt editor.** Prompt changes remain versioned engineering changes.
- **No new card system.** Reuse the existing search/detail/sections/preview components; fix the contract around them.
- **No claim of live/browser verification without running it.** The verification plan must include actual runs, or the release notes must state the gap.

### 18.5 Definition of done

V2.3.5 is done when all of the following are true on a real browser session with the production prompt/tools and a live or scripted model:

1. A student asking "show me more about this course" gets a visible card, and the model does not claim a card when none renders.
2. A student asking for a course that fits a weekday/time/credit/rating constraint gets candidates with verified or explicitly unverifiable fit.
3. A student stating "no midterms" or "I prefer morning classes" at turn 2 still has that preference honored at turn 12.
4. A failed tool and an empty result produce different, honest messages, and a populated search list cannot coexist with "no matching courses."
5. Difficulty is interpreted correctly in prose, sorting, and filtering, with sample size named.
6. A reload restores the conversation and the plan; the 30-turn stop offers a summary/handoff rather than silent loss.
7. Navigation and catalog-filter follow-ups do not multiply quota charges.
8. The journey suite, a small live qualification, and a browser smoke test pass; cost and latency are measured.

---

## 19. Phased Roadmap

The roadmap is dependency-ordered, not a commitment to dates. Durations are indicative engineering estimates for a small team already familiar with the codebase; the actual sequence matters more than the calendar.

### 19.1 Dependency graph

```text
Phase 0 (baseline & decisions)
   ├──> Phase 1 (truthful interaction contract)
   │       ├──> Phase 3 (planning discovery) ──┐
   │       └──> Phase 4 (continuity) ──────────┤
   ├──> Phase 2 (academic semantics) ──> Phase 3
   └──> Phase 5 (quota/admin/observability) ───┤
                                               └──> Phase 6 (journey verification & model qualification)
                                                         └──> release qualification
```

Phase 1 and Phase 2 can overlap after Phase 0. Phase 4 and Phase 5 can run in parallel with Phase 3. Phase 6 starts as soon as the first journey fixtures exist and runs through release.

### 19.2 Phase 0 — Baseline and decisions

- **Objective:** Remove evidence and policy ambiguity before code changes.
- **Indicative effort:** 3–5 days.
- **Scope:** Confirm production effective settings; obtain a redacted real transcript or record a new one; ratify the review-evidence rule, card-default rule, unsupported-data policy, quota fairness policy, and retention/privacy position; decide whether the uncommitted rate-limit/catalog changes are intended.
- **User value:** None directly; prevents building the wrong contract.
- **Reuse:** Existing audit, V2.3 verification docs, admin access design.
- **New capabilities:** A journey fixture set and a decision log.
- **Architectural implications:** Establishes the source of truth for policy and the evidence baseline.
- **Dependencies:** None.
- **Risks:** Decision latency; production values may be unavailable; transcript may be privacy-restricted.
- **Verification:** Signed-off decisions; a redacted journey fixture; a settings record.
- **Complexity:** S.
- **Out of scope:** Code changes.

### 19.3 Phase 1 — Truthful interaction contract

- **Objective:** Make what the assistant says about the UI and errors match what the UI actually does.
- **Indicative effort:** 2–3 weeks.
- **Scope:** Replace phrase-gated presentation with semantic intent plus renderer policy; return truthful presentation status; add rendered-block context for follow-ups; define typed tool outcomes (`ok`, `empty`, `not_found`, `unavailable`, `invalid_request`); rewrite the principle prompt and remove contradictory rules; establish context precedence.
- **User value:** No more "I showed you the card" when no card exists; no more "no matching courses" beside a populated list; natural requests produce usable cards.
- **Reuse:** Existing parsers, card components, `planRichBlocks`, `present_response` arguments, prompt language/script hints, error display.
- **New capabilities:** Renderer-owned presentation policy; truthful receipt; error taxonomy; prompt version flag.
- **Architectural implications:** The presentation layer becomes a small state machine; the prompt loses procedural policy; tool results carry status.
- **Dependencies:** Phase 0 policy decisions.
- **Risks:** Card over/under-showing; prompt regression in navigation/language; test fixtures tied to old behavior.
- **Verification:** E2E-01/02/06 journeys; component tests for card/no-card; prompt snapshot diff; navigation and language suites.
- **Complexity:** M.
- **Out of scope:** New card designs, model changes, persistence.

### 19.4 Phase 2 — Academic semantics and data honesty

- **Objective:** Make the data's meaning machine-readable and stop unsupported inference.
- **Indicative effort:** 1.5–2 weeks.
- **Scope:** Add scale/sample/truncation/term metadata; fix `maxDifficulty` and difficulty sort semantics; mark section/result truncation; attach `unavailable` capability flags for exam/prerequisite/seat data; remove the unused small-sample constant or implement it; strengthen review aggregation with counts.
- **User value:** Correct harder/easier comparisons; honest low-sample caveats; no invented exam or seat claims; no silent partial sections.
- **Reuse:** `RATING_SCALES`, existing data readers, search schemas, review/section projections.
- **New capabilities:** A consistent academic-fact envelope; capability-aware refusal; sample-size policy.
- **Architectural implications:** Tool schemas and output parsers change; the prompt can reference data-provided semantics instead of restating them.
- **Dependencies:** Phase 0 data-owner decisions; Phase 1 error/status contract.
- **Risks:** Token growth; downstream parser changes; public MCP schema compatibility.
- **Verification:** Unit tests for filter direction and scale metadata; journey tests for E2E-03/04; truncated-section fixtures.
- **Complexity:** M.
- **Out of scope:** Stored-value migration or a new review data model.

### 19.5 Phase 3 — Planning discovery and validation

- **Objective:** Let the assistant discover candidates under real constraints instead of asking for codes.
- **Indicative effort:** 3–4 weeks.
- **Scope:** Add one bounded read-only planning-discovery tool; batch section lookup and conflict validation for a shortlist; support day/time/credits/offered/rating constraints where data supports them; return explicit data gaps and truncation; add a "narrow your constraints" result; validate section-time normalization first.
- **User value:** "Find me a Tuesday/Thursday elective that does not clash and is not brutal" becomes a grounded answer.
- **Reuse:** `searchCatalog`, section readers, timetable analysis, deterministic conflict engine, existing plan data.
- **New capabilities:** Constraint-aware candidate discovery; batch validation; data-gap reporting.
- **Architectural implications:** A new read-only query/RPC path; bounded result shape; step-budget reduction; no mutation.
- **Dependencies:** Phase 2 semantics; verified meeting data; Phase 1 status/UI contract.
- **Risks:** Query latency; false precision; incomplete section data; output size; model misusing the tool.
- **Verification:** Constraint journeys (day, time, credit, rating, no-clash); performance budget; fixtures with incomplete sections; E2E-07/08.
- **Complexity:** L.
- **Out of scope:** Enrollment/seat checks, schedule optimization, degree audit, a generic query language.

### 19.6 Phase 4 — Conversation continuity and planning state

- **Objective:** Preserve the goal, constraints, and decisions across turns and reloads without treating stale facts as truth.
- **Indicative effort:** 2–3 weeks.
- **Scope:** Stable conversation id; server-owned transcript or an explicitly scoped stopgap; planning ledger with provenance and timestamps; summary of older turns; reload hydration; higher effective history budget; soft turn limit with summary/handoff; deletion and retention.
- **User value:** The assistant stops forgetting "no midterms," "mornings only," and the shortlist after a few turns or a refresh.
- **Reuse:** Existing message rendering, discussed-courses logic as a seed, timetable plan ownership pattern, Supabase.
- **New capabilities:** Durable state; preference consistency; conversation resume; plan summary.
- **Architectural implications:** Server authority over history; migration/RLS/retention; client hydration; quota tied to turn identity.
- **Dependencies:** Phase 1 contract; Phase 0 privacy/retention decision; quota turn identity from Phase 5 if per-turn accounting is required first.
- **Risks:** Privacy/storage cost; stale ledger; client/server history divergence; migration complexity.
- **Verification:** 15–30 turn journeys; reload restoration; preference consistency; deletion; conflict between stale ledger and current timetable.
- **Complexity:** L.
- **Out of scope:** Multi-device sync if the stopgap ships; long-term analytics; proactive notifications.

### 19.7 Phase 5 — Quota, admin, and observability

- **Objective:** Make usage fair, bounded, observable, and operable.
- **Indicative effort:** 2 weeks.
- **Scope:** Per-turn quota with server-issued identity; follow-up exemption; failure/retry policy; global daily budget; structured run/tool events; usage/cost aggregates; bounded admin settings via `app_config`; audit coverage.
- **User value:** Quota reflects what the student did; failures do not silently consume allowance; operators can see and control cost.
- **Reuse:** `consume_rate_limit`, `app_config`, audit log, step metrics, admin page.
- **New capabilities:** Turn idempotency; usage dashboard; budget alerts; safe runtime controls.
- **Architectural implications:** Request identity and telemetry; admin schema expansion; env/code settings migration.
- **Dependencies:** Phase 0 policy; Phase 1 run/turn contract.
- **Risks:** Double-charging or under-charging; client spoofing; admin misconfiguration; alert fatigue.
- **Verification:** API tests for one-turn-one-unit, follow-ups, failures, retries, global cap; admin bounds; telemetry redaction.
- **Complexity:** M.
- **Out of scope:** Billing, prepaid credits, per-faculty quotas.

### 19.8 Phase 6 — Journey verification and model qualification

- **Objective:** Prove the student experience, not just the wiring, and decide whether the model remains adequate.
- **Indicative effort:** 1–2 weeks, overlapping the later phases and release.
- **Scope:** Build journey fixtures from redacted real sessions; deterministic journey suite; live DeepSeek qualification; browser smoke; cost/latency measurement; model comparison only after the architecture is stable.
- **User value:** Releases are gated on real behavior; regressions in planning/truthfulness are caught.
- **Reuse:** Existing eval harness, Vitest, jsdom component tests, fixtures, graders.
- **New capabilities:** Planning-quality rubric; preference-consistency tests; browser smoke; model qualification report.
- **Architectural implications:** CI gates and release checklist; no runtime architecture change.
- **Dependencies:** Phases 1–5; budget for live calls; browser environment.
- **Risks:** Flaky model runs; eval overfitting; cost; false confidence from small samples.
- **Verification:** Multiple repeats; pass-rate distributions; human spot-check; cost per journey.
- **Complexity:** M.
- **Out of scope:** Continuous live evaluation on every PR; a full model research program.

### 19.9 Release order and decision gates

| Gate | Must be true before proceeding |
|---|---|
| G0 → Phase 1 | Policy decisions signed off; production settings recorded; uncommitted changes resolved |
| Phase 1 → Phase 3 | No false card claims in component/journey tests; error statuses distinguish empty/failure |
| Phase 2 → Phase 3 | Difficulty/filter semantics are test-locked; unsupported fields are explicit |
| Phase 3 → Phase 6 | Constraint journeys pass or return honest data gaps; latency within budget |
| Phase 4 + Phase 5 → release | Reload and 15–20-turn preference tests pass; turn identity, per-turn quota, global budget, telemetry, and admin bounds are verified |
| Phase 6 → release | Journey, live qualification, and browser smoke pass; cost/latency recorded |
| After release | Model benchmark on stable architecture; decide keep/route/replace |

## 20. Open Questions

These are decisions that cannot be resolved from the repository. They should be answered before or during Phase 0; several block implementation choices.

| ID | Question | Why it matters | Recommended default | Owner | Blocking? |
|---|---|---|---|---|---|
| Q-01 | Can a redacted real transcript (or a new recorded session) be provided for the journey fixtures? | The supplied E2E observations are the strongest product evidence, but they are not in the workspace. Without a transcript, root causes remain source-based inferences. | Record a new consented session; redact names/ids; keep turns and tool calls | Product/research | Yes for Phase 6 fidelity; no for Phase 1 |
| Q-02 | What are the effective production values for model, thinking, output tokens, timeout, steps, quotas, and history? | The repository contains examples and dev/preview values, not verified production truth. Cost and behavior conclusions depend on them. | Establish a read-only effective-settings endpoint or deployment record | Platform engineering | Yes for budget/limits |
| Q-03 | What is the approved data-handling and retention position for sending timetable/course data to DeepSeek? | The assistant already sends plan data to a third-party model. Persistence increases the obligation. | Minimize plan data, document retention, obtain approval before storing transcripts | Privacy/legal/product | Yes for Phase 4 |
| Q-04 | Should reviews be mandatory before any recommendation, or only before review-based judgments? | Rules 18, 26, and 37 currently conflict. The answer determines tool sequencing, cost, and evaluation. | Require reviews only when the answer makes a review-based claim; otherwise use aggregates with sample size | Product | Yes for Phase 1 |
| Q-05 | Should course cards appear by default when the student is evaluating a course, or only on explicit inspect? | This is the product intent behind the phrase gate. The technical fix differs depending on the answer. | Default one detail card for evaluation/recommendation; suppress for short factual answers; keep explicit inspect | Product/design | Yes for Phase 1 |
| Q-06 | Will structured exam-format, prerequisite, seat, and workload data be added, or will the assistant permanently declare them unavailable? | E2E-04 cannot be fully solved by prompts if the product wants exam filtering. | Declare unavailable in V2.3.5; evaluate data acquisition as a separate product project | Product/data | Yes for Phase 2 scope |
| Q-07 | What is the quota product policy: per turn or per run, and are failed turns refunded? | The current per-run behavior is unfair, but the replacement policy affects abuse control and cost. | One unit per new user turn; follow-ups free; one bounded retry on failure | Product/platform | Yes for Phase 5 |
| Q-08 | How durable must conversation history be in V2.3.5: client reload only, or server-owned/multi-device? | Determines migration, privacy, and delivery size. | Client restoration + ledger as a stopgap if server store cannot ship safely; server-owned target in V2.4 | Product/engineering | Yes for Phase 4 |
| Q-09 | Is the assistant intended for mobile/tablet users? | The current 1024 px gate makes the assistant desktop-only. This may be deliberate or a temporary rollout limit. | Keep desktop-only for V2.3.5; decide separately | Product | No, but affects roadmap |
| Q-10 | Which runtime settings may platform admins change without a deploy? | The current env-only surface is operationally inflexible, but broad admin control increases risk. | Bounded quotas, steps, tokens, timeout, model allowlist, thinking, feature flags; never API keys/base URL/free-form prompt | Platform/product | Yes for Phase 5 |
| Q-11 | Are section meeting times complete and normalized enough for day/time filtering in the current term? | This decides whether the discovery MVP can support day/time constraints or only batch verification. | Validate data first; ship batch section/conflict validation even if day/time filtering slips | Data engineering | Yes for Phase 3 scope |
| Q-12 | What is the acceptable cost and latency per completed planning journey? | Without a target, model qualification and global budgets have no pass/fail criterion. | Define a target from V1-E historical cost plus a latency ceiling; include in Phase 6 | Product/platform | Yes for Phase 6 |
| Q-13 | What does "proactive" mean for V2.3.5? Suggestions after a plan is stated, or unsolicited recommendations? | The brief and product language use "proactive" differently. Unsolicited advice requires consent and strong state. | Responsive-but-anticipatory: infer constraints, validate fit, offer alternatives; no unsolicited messages | Product | Yes for scope |

---

## 21. Final Assessment

### 21.1 Verdict

What2Reg AI is a **good data platform with an over-specified conversational layer**. The platform already has the hard parts: authenticated access, read-only academic data, instructor/review data, section data, a deterministic timetable conflict engine, saved and hypothetical plans, and competent rich UI primitives. The assistant layer is where the product promise breaks:

- it encodes policy as a 20,319-character procedure;
- it contradicts itself on reviews and context authority;
- it makes cards dependent on magic phrases and then cannot verify what was rendered;
- it cannot search for courses under the constraints students actually use;
- it forgets the student's plan after a few turns;
- it collapses failures into "no data";
- and it charges quota per internal model run.

The model is not the primary bottleneck. DeepSeek is being asked to compensate for missing tools, missing state, ambiguous semantics, and missing feedback. Replacing it now would be an expensive way to keep the same product defects.

### 21.2 What should be preserved

1. **The deterministic timetable foundation.** The digest, scenario referent, preview snapshots, and conflict engine are the strongest part of the assistant. Extend them; do not replace them with model reasoning.
2. **The read-only, authenticated boundary.** Clerk, access modes, fail-closed rate limiting, constrained navigation, and typed renderers are sound.
3. **The rich UI components.** Search, detail, sections, filters, and preview are worth reusing. The problem is the contract around them, not the visual primitives.
4. **Language and script handling.** The V1-E work on reply language and script is real and should survive the prompt reset.
5. **The existing test foundation.** It is broad on plumbing and gives a safe base for a journey-focused layer.

### 21.3 What must change

In order of user impact:

1. **Truthfulness.** A card claim, an error message, and a recommendation must correspond to actual UI and tool state.
2. **Instruction ownership.** Move enforceable policy out of prose; keep judgment and style in a smaller prompt.
3. **Academic semantics.** Make scale direction, sample size, truncation, term, and unsupported fields explicit in the data.
4. **Discovery.** Add one bounded read-only planning tool and batch validation so the assistant can find, not just look up.
5. **Continuity.** Persist a planning ledger and the conversation, and stop losing the student's constraints.
6. **Fairness and observability.** Charge per turn, cap global cost, and make runs diagnosable without logging content.
7. **Verification.** Gate releases on journeys and browser behavior, not just wiring tests.

### 21.4 What must not be done

- Do not expand the prompt again to patch individual phrases.
- Do not swap the model before the architecture is corrected.
- Do not add a new agent framework, vector database, or orchestration layer to solve a state/tool problem.
- Do not weaken authentication, read-only guarantees, or fail-closed behavior for convenience.
- Do not treat a passing mocked suite as evidence of student-experience quality.
- Do not persist conversations without retention, deletion, and privacy approval.
- Do not wait for V3 to fix basic intent understanding, truthful UI, or planning state.

### 21.5 Readiness

The project is **ready to plan V2.3.5 in detail after the Phase 0 decisions**, not ready to implement immediately. The code-visible defects are well understood; the missing pieces are product policy (review evidence, card defaults, unsupported fields, quota fairness, retention) and two data validations (section-time completeness and production configuration).

The recommended release scope is ambitious but coherent. If it must be cut, the non-negotiable core is:

1. truthful presentation and errors;
2. instruction reset;
3. academic semantics;
4. conversation ledger/continuity;
5. per-turn quota.

Planning discovery is the highest-value capability extension; it should not be dropped entirely, but it can ship in two steps (batch validation first, full day/time filtering second).

### 21.6 Confidence and evidence limits

| Area | Confidence | Reason |
|---|---|---|
| Prompt contradictions and over-procedural design | High | Direct source reading; rules are explicit |
| Presentation false-claim mechanism | High | Shape-only acceptance and same-turn render condition are code-visible |
| Difficulty/filter/sort defects | High | Direct code reading |
| Tool coverage gaps | High | Schema inspection |
| History/state loss | High | Code and tests show the limits |
| Quota fairness | High | Route consumes quota per run |
| Exact E2E turn behavior | Medium | Transcript absent; observations treated as supplied evidence |
| Production model/config/cost | Low | Production env not committed and not read |
| Privacy/retention posture | Low | No assistant-specific policy found; provider terms not reviewed |
| Browser behavior | Low | No browser session was run |

### 21.7 Final statement

The assistant does not need to become more elaborate. It needs to become **more honest about what it knows and shows, better equipped to discover options under constraints, and less forgetful about the student's plan**. Those are architecture and product-contract problems, not a model-capability problem. Fixing them is the right definition of V2.3.5.

---

## Appendix A — Answers to the 13 Final Questions

### A1. Is the agent too procedural?

**Yes.** The prompt is 20,319 characters, 20 numbered rules, and a long unnumbered policy block. It specifies tool order, review prerequisites, card phrases, table shape, navigation, language, and error wording. The strongest evidence is not its length alone but that the procedure contradicts itself: rule 18 requires reviews before recommending, rule 26 requires reviews for explicit referents, and the final line forbids reviews unless the student asks what reviews say ([lib/assistant/prompt.ts:20,26,37](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L20)). The model is also told to answer only from this turn's tool results while being given trusted page, timetable, preview, and discussed-course context ([lib/assistant/prompt.ts:5](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L5); [lib/assistant/agent.ts:39-77](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L39)). A procedural prompt is not inherently wrong; a procedural prompt as the *only enforcement* for contradictory policy is.

### A2. Which restrictions should remain in the prompt, and which should move to code?

**Remain in the prompt:** scope and refusal; language/script choice; tone and brevity; how to state uncertainty and interpretation; how to summarize evidence; when to ask one clarifying question; how to frame a recommendation; link style.

**Move to code:** required evidence before a review-based judgment; card mounting and visibility; failure/empty/no-match handling; context precedence; navigation validation; quota and turn limits; scale/sample/truncation metadata; unsupported-field refusal; tool output caps. Several of these are already partly in code (navigation, context precedence); the task is to finish the boundary and remove conflicting prose.

The test is simple: if violating the rule can be detected mechanically, it belongs in code. If it requires judgment about meaning or tone, it belongs in the prompt.

### A3. Why does the assistant miss broader planning intent?

Five compounding reasons:

1. **The discovery tool cannot express the intent.** Search has no day, time, rating, difficulty, workload, exam, or plan-conflict filter ([lib/assistant/tool-schemas.ts:19-50](file:///Users/thomaswu/workspace/next-web/lib/assistant/tool-schemas.ts#L19)).
2. **The context models references, not goals.** Page, course referent, timetable digest, previews, and discussed courses tell the model *what is being discussed*, not *what the student is trying to achieve* ([lib/assistant/agent.ts:39-77](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L39)).
3. **The step budget cannot validate candidates.** Sections and conflicts are per-instructor, and the model is told to check up to three instructors; 8 steps disappear quickly ([lib/assistant/agent.ts:6](file:///Users/thomaswu/workspace/next-web/lib/assistant/agent.ts#L6); [lib/assistant/prompt.ts:19](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L19)).
4. **The history loses the goal.** Eight prior user turns and 200-character old tool results cannot preserve a multi-turn plan ([lib/assistant/conversation.ts:3-5,50-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3)).
5. **The prompt falls back to asking for codes.** When the model cannot search constraints, the safe behavior is to ask for a course code, which is exactly the repeated-clarification failure in E2E-08.

The fix is not a smarter intent classifier alone. It is a planning ledger plus a discovery tool that accepts constraints.

### A4. Why do cards require special phrases?

Because the product made them explicitly opt-in:

- `present_response` says "Default: omit this tool" and lists phrases that count as permission ([lib/assistant/tools.ts:236-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/tools.ts#L236)).
- Rule 11 says to default to omitting cards, with a phrase list for "tell me more," "full details," and "section cards" ([lib/assistant/prompt.ts:13](file:///Users/thomaswu/workspace/next-web/lib/assistant/prompt.ts#L13)).
- The renderer mounts a course or section card only when a same-turn claim matches a same-turn lookup ([lib/assistant/presentation.ts:195-238](file:///Users/thomaswu/workspace/next-web/lib/assistant/presentation.ts#L195)).
- Meanwhile search results are always rich ([lib/assistant/rich-tools.ts](file:///Users/thomaswu/workspace/next-web/lib/assistant/rich-tools.ts)).

This is a deliberate anti-clutter policy encoded as a phrase gate. It is not a technical requirement. It produces E2E-02: a student evaluating a course gets prose instead of the card the product already has. The replacement is semantic intent plus renderer policy, not a longer phrase list.

### A5. How should exploration improve without card flooding?

Use a small, intent-based presentation policy:

| Student intent | Default presentation |
|---|---|
| Broad search / "what courses…" | Search list (already rich), short interpretation, no detail cards |
| Evaluating one course | One compact detail card plus a short interpretation |
| Comparing two or three | A table or at most two compact cards; never a stack of cards |
| Asking when/where it meets | Prose from section data; section cards only on explicit inspect |
| Asking "tell me more" / "show details" | Detail card |
| Asking "what if I take this section" | Timetable preview |
| Short factual question | Prose only |

The renderer should own this mapping, deduplicate, cap the number of mounted blocks, and expose "show more" rather than requiring magic words. The model may express intent, but it should not be the only guard against flooding. The existing narrow panel and components are sufficient; no new card system is needed.

### A6. Are the tools sufficient for proactive, grounded recommendations?

**No.** The current nine academic tools plus two timetable tools are lookup-oriented:

- no day/time/rating/difficulty/workload/exam filter in search;
- no batch section lookup for a shortlist;
- no plan-conflict search that takes constraints;
- no structured exam/prerequisite/seat data;
- section results can be silently truncated;
- review aggregates lack sample-size semantics;
- per-instructor calls and 8 steps make multi-candidate verification impractical.

A perfect model cannot ground "easy, no midterms, Tuesday/Thursday, no clash" with these tools. The minimum addition is one bounded planning-discovery tool plus batch section/conflict validation and explicit data gaps. That is an extension of the existing data platform, not a V3-scale project.

### A7. What limits long conversations?

The binding limits are architectural, not the model context window:

- **No persistence:** chat lives only in `agent.messages`; `startNewChat` clears it; reload loses everything ([components/assistant/assistant-chat.tsx:102-109](file:///Users/thomaswu/workspace/next-web/components/assistant/assistant-chat.tsx#L102)).
- **Eight prior turns:** shaping keeps the current plus eight prior user turns ([lib/assistant/conversation.ts:3-5,50-75](file:///Users/thomaswu/workspace/next-web/lib/assistant/conversation.ts#L3)).
- **200-character tool stubs:** older tool results are squeezed to 200 characters, destroying course/section detail.
- **No planning ledger:** goals, constraints, shortlists, and decisions are not represented.
- **Hard 409 when a request exceeds 30 user turns** ([route.ts:85-88](file:///Users/thomaswu/workspace/next-web/app/api/copilotkit/[[...slug]]/route.ts#L85)).
- **Per-run quota:** a long session can exhaust allowance before 30 turns.
- **No thread identity:** `InMemoryAgentRunner` is bounded and non-durable; it is not a persistence layer.

The model may have ample context window; the application never gives it the relevant state.

### A8. What is the minimum viable persistent-history design?

Minimum viable, in order:

1. **Stable conversation id** owned by the Clerk user; a new chat creates a new id, not only a cleared array.
2. **Server-owned record** following the existing timetable ownership pattern: user id, messages/tool calls/results (or a compact serialization), timestamps, title, schema version, RLS enabled, service-role writes.
3. **Recent raw + older summary:** keep enough recent turns for card reconstruction and references; summarize older turns deterministically or with a bounded model call.
4. **Planning ledger:** goal, explicit constraints, shortlist, decisions, rejected options with reasons, pending question, source provenance, timestamps.
5. **Server-authoritative history** when an id is present; client-supplied history is validated or ignored.
6. **Hydration on open** and restoration of the visible turns; `new chat` creates a new id.
7. **Retention, deletion, and privacy:** a defined TTL, user deletion, and no storage of unnecessary plan/review content.
8. **Volatile facts are not persisted as truth;** catalog/section/timetable facts are re-read and revalidated.

If the server store cannot ship in V2.3.5, a client-persisted transcript plus a client-supplied ledger is a stopgap. It restores the session but does not establish server authority, cross-device continuity, or strong retention control; it should be labeled as such.

### A9. Which rate, length, and model settings should admins control?

| Setting | Control | Bounds / default | Who |
|---|---|---|---|
| Access mode, testers | Runtime | Existing | Normal admin |
| Hourly/day quota | Runtime | Bounded range, default 30/80 | Platform admin |
| Global daily budget | Runtime | Cost/token ceiling | Platform admin |
| Max user turns | Runtime | 10–200, default 30 | Platform admin |
| History turns | Runtime | 4–30, default 8 | Platform admin |
| Max steps | Runtime | 4–16, default 8 | Platform admin |
| Max output tokens | Runtime | 500–4,000, default 2,000 | Platform admin |
| Timeout | Runtime | 10–60 s, default 30 s | Platform admin |
| Model allowlist | Runtime | Approved models only | Platform admin |
| Thinking mode | Runtime | off/low | Platform admin |
| Feature flags | Runtime | Boolean | Platform admin |
| Prompt | Deploy-time, versioned | No free-form editing | Engineering |
| API key, base URL | Secret/env | Never in UI | Deployer |

The admin surface should reuse `app_config`, `revalidateTag`, and the audit log. Quota accounting should be per user turn, not per internal run, and the UI should show aggregate usage without conversation content.

### A10. How should preferences be preserved without trusting stale timetable facts?

Separate **preferences** from **facts**:

- **Preferences and goals** are student statements or confirmed inferences: "no midterms," "mornings only," "3 credits," "same subject as GELH," "avoid hard grading." Store them with provenance, timestamp, and status.
- **Timetable facts** are volatile: current sections, meetings, conflicts, gaps, plan version. Recompute them every turn from the current plan; never store "no conflict" as a durable truth.
- **Decisions** (shortlist, rejected options, pending question) are durable but must reference the plan version they were made against.
- **Context precedence** is deterministic: when the current digest and an old statement disagree, the current digest wins for facts; when a preference conflicts with a fact, the assistant explains the conflict and asks.

Only promote an inferred preference after confirmation. A preference ledger without provenance becomes a new source of false beliefs.

### A11. Should the model be kept or replaced?

**Keep DeepSeek for V2.3.5.** The evidence points to prompt contradictions, missing tools, semantic traps, state loss, and presentation feedback as the dominant causes. The model already handles tool selection, navigation, language, and script at a workable level in the recorded evaluation history. Replacing it now would confound every fix and make attribution impossible.

After the architecture is corrected, benchmark `deepseek-flash` against one or two approved models on the same journeys, with identical prompts/tools, fixed budgets, multiple repeats, and cost/latency measurement. Replace or route only if DeepSeek fails the agreed planning/grounding criteria. Provider data-handling approval is part of the decision.

### A12. What must precede V2.4, and what can wait for V3?

**Before V2.4 (or in V2.3.5):** truthful presentation and error handling; instruction reset; academic semantics; planning ledger/conversation continuity; constraint-aware discovery MVP; per-turn quota; journey verification.

**V2.4:** full server persistence/multi-device sync; admin runtime controls and usage dashboard; richer exam/prerequisite/workload data if approved; proactive-but-consented suggestions; model qualification/possible routing; mobile assistant if product wants it.

**V3:** degree audit, multi-year planning, schedule optimization, autonomous enrollment actions, broad personalization. These are not prerequisites for fixing basic intent, truthfulness, or continuity. Waiting for V3 to fix those would leave the current product promise broken for another cycle.

### A13. What is the smallest sequence of changes that materially improves the real student experience?

The smallest sequence with user-visible impact is:

1. **Make cards truthful and automatic for evaluation.** Renderer policy plus truthful presentation status; remove phrase-gated card honesty. This fixes E2E-01/02 and makes existing data usable.
2. **Remove the review contradiction and collapse the instruction set.** Require reviews only for review-based claims; replace the phrase lists with principles. This is a small prompt/tool change with large behavioral effect.
3. **Make difficulty, sample size, and truncation explicit.** Fix `maxDifficulty` and sort semantics; return scale metadata and counts. This fixes E2E-03 and prevents confidently wrong comparisons.
4. **Add a planning ledger and reload restoration.** Preserve goals/constraints across turns and refreshes. This fixes the most visible long-session failure without waiting for a full persistence program.
5. **Add bounded discovery plus batch validation.** Enable constraint-based candidate finding and schedule/conflict checks. This addresses E2E-07/08.
6. **Charge per turn and gate on journeys.** Make quota fair and add journey/browser tests so the fixes are not regressions.

Steps 1–3 are the minimum for truthfulness and correctness. Steps 4–6 are the minimum for a complete V2.3.5. Constraint discovery is the largest item; if it must be staged, ship batch section/conflict validation first and add day/time filtering when section-time data is verified.

---

*End of audit. This report is documentation only. No application source, tests, prompts, schemas, migrations, or configuration were changed. No live model calls, browser sessions, or data mutations were performed.*
