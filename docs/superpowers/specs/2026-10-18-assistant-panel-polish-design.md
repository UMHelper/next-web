# AI Assistant Panel Polish

Date: 2026-10-18
Status: Draft, awaiting review
Builds on: the sidebar width change (`width` prop on `CopilotSidebar`), `public/assistant/copilotkit-theme.css` (site-token theme bridge), and the elevated sidebar surface. Access control, tools, and the runtime are unchanged.

## 1. Problem

The assistant sidebar on `/timetable` works but feels unfinished:

1. There is no obvious way to hide it. CopilotKit's header close button sits top-right, but on localhost the dev-only CopilotKit inspector (kite icon) covers it. The only other control is CopilotKit's floating toggle (an X at the bottom-right), which reads as "close the disclaimer".
2. The header title wraps onto two lines because the header splits into three equal columns.
3. The input is about 236px wide. The sidebar wraps it in 32px of side padding, so it drops into a two-row layout, and it shows a "+" attach button that does nothing for us.
4. The disclaimer takes three lines under the input.
5. The empty state is a centered block of text with no hint of what to ask.
6. The panel is fixed at `clamp(300px, 28vw, 360px)`, which feels too narrow, but any fixed width trades off against timetable space.

## 2. Goals and non-goals

Goals:

- A clear close button in the header, plus a reopen pill when hidden. The conversation survives hiding.
- A user-resizable panel width, remembered across visits.
- A one-row header, a full-width one-row input, and a one-line disclaimer.
- An empty state with a short intro and example questions that send on click.
- Works in light, dark, and the Island skin through the existing token bridge.

Non-goals:

- Remembering open/closed across page navigation (the panel unmounts when leaving `/timetable`).
- Replacing `CopilotSidebar` with a custom shell.
- Editing `public/assistant/copilotkit-v2.css` (it must stay byte-identical to the package; see `tests/assistant/dependency-contract.test.ts`).
- Changing the mobile (under 768px) full-screen behavior.

## 3. Approach

Keep `CopilotSidebar` and customize it through its props and slots. CopilotKit keeps handling the body margin push, the mobile full-screen sheet, and the slide transition. A small amount of layout CSS goes in `copilotkit-theme.css`. Some of those selectors target CopilotKit's internal markup, which is acceptable because the package version is pinned exactly by the dependency-contract test.

Rejected: building our own shell around the bare `CopilotChat` (re-implements margin push, mobile, and transitions for little gain), and CSS-only polish (cannot add resizing, the reopen pill, or example chips).

## 4. Behavior

### 4.1 Open and close

- `AssistantPanel` owns `open` state and passes `open` / `onOpenChange` to `CopilotSidebar` (controlled mode). It starts `true`, because the panel only mounts after the first launcher click.
- The custom header's close button calls `setOpen(false)`. The sidebar slides out and CopilotKit clears the body margin.
- While closed, the panel renders an "AI 选课助手" pill fixed at the bottom-right. Clicking it sets `open` to `true`.
- The pill and the launcher button in `assistant-launcher.tsx` share one exported class constant so they cannot drift.
- The panel stays mounted while closed, so messages and any in-flight reply are kept.

### 4.2 Removed CopilotKit chrome

- `toggleButton`: a slot component that renders `null` (removes the floating round toggle).
- `input.addMenuButton`: a slot component that renders `null` (removes "+").
- `CopilotKitProvider enableInspector={false}`: removes the dev-only inspector that covers the header. Developers can re-enable it locally.

### 4.3 Resizing

- New component `components/assistant/resize-handle.tsx`, rendered by `AssistantPanel` while open.
- A fixed-position strip about 6px wide on the sidebar's left edge (`right: <width>px`), above the sidebar's z-index. It is transparent at rest and shows a brand-colored line with a `col-resize` cursor on hover and while dragging.
- Pointer drag uses pointer capture. Width is in px: default 380, min 320, max 560. It is also capped at `window.innerWidth - 480` so the page keeps at least about 480px, and recomputed on window resize. When that cap is below 320 (windows roughly 768 to 800px wide), the 320 minimum wins.
- Keyboard: `role="separator"`, `aria-orientation="vertical"`, `aria-valuemin` / `aria-valuemax` / `aria-valuenow`, and an `aria-label`. Left and right arrows change the width by 16px. Double-click resets it to 380.
- Persistence: `localStorage["umeh-assistant-width"]`, read on mount and clamped. If storage is unavailable, it falls back to 380 and keeps the value in memory for the session.
- CopilotKit applies a 260ms `margin-inline-end` transition to `document.body`, which makes dragging lag. While dragging, the resize handle sets `document.body.style.transition = "none"` and restores it on pointer up, pointer cancel, or close.
- Hidden below 768px, where CopilotKit forces the sidebar to full width.
- `CopilotSidebar` remounts its view when `width` changes and reads it only once on mount, so `width` is the constant `var(--assistant-width, 380px)`. The resize handle writes the current width to `--assistant-width` on `<html>`, and both the panel and the page margin follow it through CSS.

## 5. Visual layout

### 5.1 Header

A custom `header` slot: one row, about 52px tall, on the elevated surface with a bottom border.

- Left: "AI 选课助手" in semibold, then a small rounded "试点" badge (`bg-brand/10 text-brand`).
- Right: an icon-only close button (lucide `X`), matching the site's ghost button (muted foreground, `hover:bg-accent`, focus ring), with `aria-label="收起助手"`.

### 5.2 Empty state

- Left-aligned content with modest top spacing, not vertically centered.
- Intro: "可以问课程、教授、评价和 section 时间，也能检查某个 section 会不会和你的课表冲突。"
- A muted second line: "只读，不会改动课表 · 单次对话最多 30 轮".
- Example chips via `useConfigureSuggestions` with static suggestions, shown only before the first message. Clicking a chip sends it. The questions match cases in `tests/fixtures/assistant-golden-questions.ts`:
  - 有哪些和 accounting 相关的课？
  - ACCT1000 是什么课？几个学分？
  - ACCT1000 有哪些 section？什么时间上课？
- Chip style comes from the existing `[data-slot="suggestion-pill"]` rules in `copilotkit-theme.css` (border, panel surface, `accent` on hover, Island radius).

### 5.3 Input

- The input wrapper's side padding inside the sidebar drops from 32px to 12px (CSS override of `[data-sidebar-chat]` padding).
- One line at rest, with the textarea on the left and the round send button inside on the right. It grows with content up to CopilotKit's maximum height.
- CopilotKit picks compact or expanded layout by measuring. With the wider box it is expected to stay compact. If it still renders two rows when empty, fix it in `copilotkit-theme.css`. This is checked in the browser.

### 5.4 Disclaimer

- One muted line (11 to 12px), wrapping to at most two lines at the minimum width: `本站不是 myUM · Pre-Enrolment · Add/Drop · 数据更新于 {DATA_UPDATED_AT}`. The two names stay links to the official pages.
- Error notices (`describeAssistantError`) render above this line in `text-destructive-strong`, as today.

## 6. Files

- `components/assistant/assistant-panel.tsx`: open state, controlled sidebar, header slot, removed slots, suggestions, width state, drag transition override, reopen pill, compact disclaimer.
- `components/assistant/resize-handle.tsx` (new): drag, keyboard, persistence, and clamping.
- `components/assistant/assistant-launcher.tsx`: use the shared pill class constant.
- `public/assistant/copilotkit-theme.css`: input padding, compact input, and header layout fixes.

## 7. Testing

Vitest, following `tests/components/`:

- Panel: the close button hides the sidebar and shows the reopen pill, and the pill reopens it. The CopilotKit toggle and "+" button are not rendered. Suggestions are configured with the three questions.
- Resize handle: the arrow keys change the width by 16px within bounds, double-click resets to 380, the width persists to and restores from localStorage, out-of-range stored values are clamped, and it falls back to 380 when storage throws.
- Existing suites stay green: `tests/assistant/theme-sync.test.ts`, `tests/assistant/dependency-contract.test.ts`, `tests/components/assistant-launcher.test.tsx`, `tests/theme-*`, and `tests/skin-*`.
- Browser check on `/timetable` at 1024px and at a wide width, in light, dark, and Island: one-row header, one-row input, smooth resizing, and close and reopen keep the conversation.
