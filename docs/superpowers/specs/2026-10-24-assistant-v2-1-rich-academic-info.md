# Assistant V2.1 — Rich Academic Information & Contextual Result Interactions

Condensed from the V2.1 kickoff brief (2026-10-24). Builds on V2.0 catalog cards
(`docs/superpowers/plans/2026-10-24-assistant-v2-0-catalog-cards.md`) and the V2.0
hardening diff.

## Primary acceptance flow

1. "Search for MATH courses." → `search_catalog` course cards (existing).
2. "Show me only those offered this semester." → the agent identifies the previous
   result set and applies an offered-only filter to it. Only courses with validated
   `isOffered === true` are shown. The UI and the reply say the filter covers the
   retrieved page, not the whole catalog. No new search. No Markdown re-listing.
3. "When is APAC1000 taught?" → existing `get_course_sections` → structured section
   UI with real days, times, locations and instructor. Never invent schedule data.
4. "Tell me more about APAC1000." → existing `get_course` → compact course-detail
   card. Earlier interactive results remain.

## Capabilities

A. **Course detail renderer** for `get_course` (`getCourseOutputSchema`). Show only
   fields the schema returns: code, EN/ZH titles, credits, faculty, department,
   description, offering flag, instructors, link to the course page. Compact and
   sized for the sidebar; it does not replicate the course page.

B. **Course section renderer** for `get_course_sections`
   (`getCourseSectionsOutputSchema`). Support multiple meetings per section, missing
   locations, sections with no meetings, and empty section lists. Include a navigation
   action. Read-only: no Add to Timetable.

C. **Local filtering** on `search_catalog` course results: "All" and "Offered only".
   Clicks update the UI through React and never call the model or the backend. Scope
   copy separates loaded results from totalCount, for example: "Showing 2 offered
   courses among the 10 currently loaded results. There are 127 total matches."

D. **Contextual follow-ups.** The agent knows the latest course result sets through
   a compact, bounded summary. It filters them through a small validated frontend
   capability keyed by result-set identity, which is the `search_catalog` `toolCallId`.
   It never reconstructs the list itself. It uses the newest matching set when that
   is unambiguous and otherwise asks a short clarification.

## Lifecycle and state

- Closing and reopening the sidebar, and client navigation, keep the conversation
  and the filters.
- New chat clears the previous conversation's filter state and result references.
- An account change clears all private conversation and interaction state.
- Historical tool results remain renderable. Refresh persistence is not required.
- Derive data from tool messages. Keep transient state small. Add no state library.

## Agent behaviour

- Prefer direct filtering over a repeated search. Use `get_course` for details and
  `get_course_sections` for class times.
- Never fabricate instructors or times. Do not repeat displayed cards in Markdown.
- `isOffered` is a catalog flag. It does not mean seats are open, the student is
  eligible, or enrolment will succeed.
- Do not globally suppress Markdown. Clients without rich rendering keep working.

## Non-goals

Timetable writes or approvals, optimisation, semester generation, professor
comparison UI, profiles, persistent conversations, mobile assistant, enrolment
operations, catalog SQL changes, and new MCP tools.

## Verification

`npm run lint`, `npx tsc --noEmit`, `npm run test`, and a production build where
practical. Browser scenarios A–E (details, sections, filter click, contextual
filter, lifecycle) run only if a safe authenticated browser is available. Otherwise
they are reported as unverified. Make no unnecessary paid LLM calls.
