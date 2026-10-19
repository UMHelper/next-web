# Global Assistant V1-A (Global Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in students with assistant access can open the existing AI sidebar from any student-facing page, and the same conversation stays open while they move between pages with client-side navigation.

**Architecture:** `AssistantLauncher` moves from `app/timetable/page.tsx` into `app/layout.tsx`, next to `FloatingPlanner` inside the existing `TimetablePlannerProvider`. The CopilotKit panel stays behind `next/dynamic` and loads only on first open. After that it stays mounted for the rest of the page session. The panel reads the active plan from `useTimetablePlanner()` instead of a prop. The launcher owns the lifecycle: it resets on sign-out or user switch and suppresses the panel on admin, auth, and OAuth-consent routes without unmounting it. Two small layout fixes stop the assistant from overlapping `FloatingPlanner`. The prompt loses its one timetable-page-only sentence.

**Tech Stack:** Next.js 15.5 App Router, React 18, Clerk 7 (`useAuth`), `@copilotkit/react-core` 1.79.1 (`/v2`), Tailwind 3.3.3 (arbitrary variants), vitest + Testing Library.

## Global Constraints

- CopilotKit is imported only from `@copilotkit/react-core/v2` and only inside `components/assistant/assistant-panel.tsx`. No page or layout imports it.
- `AssistantPanel` stays behind `dynamic(() => import("./assistant-panel"), { ssr: false })`. Loading a page must not fetch the CopilotKit chunk or call `/api/copilotkit`.
- No new dependencies. No changes to `app/api/copilotkit`, `lib/assistant/tools.ts`, rate limits, or access control.
- The assistant stays read-only. No new frontend tools in this phase. Page context is V1-B and the `navigate` tool is V1-C.
- `CopilotSidebar`'s `width` prop stays the constant `var(--assistant-width, 380px)`, because changing it remounts the chat view (see `2026-10-18-assistant-panel-polish.md`).
- Commit messages use the repo's conventional format, e.g. `feat(assistant): …`, `test(timetable): …`.

## Lifecycle and state ownership

```text
app/layout.tsx (server)
└── ClerkProviderClient
    └── TimetablePlannerProvider            activePlan, already global
        ├── page content
        ├── FloatingPlanner                 hidden on /timetable and /compare
        └── AssistantLauncher               enabled, opened
            ├── AssistantBubble             before first open, not on suppressed routes
            └── AssistantPanel (dynamic)    open, notice; mounted from first open on
                └── CopilotKitProvider      chat messages live here
                    ├── AssistantTools      useAgentContext(plan) + check_plan_conflicts
                    └── CopilotSidebar
```

| Event | Result |
|---|---|
| Page load, signed out or no access | Launcher renders nothing; no CopilotKit code loaded |
| Page load, access granted | One `GET /api/assistant/access`, then the bubble |
| First click on bubble | Panel chunk loads, sidebar opens |
| Client-side navigation | Root layout persists, so panel, messages, and open state persist |
| Navigate to `/admin`, `/oauth-consent`, `/sign-in`, `/sign-up` | Panel stays mounted but closed, bubble hidden; returning restores the previous open state |
| Sign-out, or switch to another Clerk user | `opened` resets, panel unmounts, conversation gone; access re-checked for the new user |
| Hard reload | Conversation gone (unchanged; history is client-held) |

Mobile needs no new code: below 768px CopilotKit's sidebar is already `w-full` at `100dvh` with `z-[1200]` and does not set the body margin (`copilotkit-CD3uPUN3.mjs`, `CopilotSidebarViewInternal`). The header close button returns to the page.

## Files

- Modify: `components/assistant/assistant-launcher.tsx` — global lifecycle, route suppression, reset on user change
- Modify: `components/assistant/assistant-panel.tsx` — read plan from planner, `suppressed` prop, `data-assistant-open` flag on `<html>`
- Modify: `components/assistant/assistant-bubble.tsx` — hide the speech label below `md`
- Modify: `components/timetable/floating-planner.tsx` — shift the desktop tab and preview left of an open sidebar
- Modify: `app/layout.tsx` — mount `<AssistantLauncher />`
- Modify: `app/timetable/page.tsx` — remove both launcher mounts
- Modify: `lib/assistant/prompt.ts` — rule 7 no longer says "planner on the left"
- Test: `tests/components/assistant-launcher.test.tsx`, `tests/components/assistant-panel.test.tsx`, `tests/components/assistant-bubble.test.tsx` (new), `tests/components/floating-planner.test.tsx`, `tests/components/timetable-page.test.tsx`, `tests/assistant/global-mount.test.ts` (new), `tests/assistant/agent.test.ts`

---

### Task 1: Launcher owns the global lifecycle

**Files:**
- Modify: `components/assistant/assistant-launcher.tsx`
- Test: `tests/components/assistant-launcher.test.tsx`

**Interfaces:**
- Produces: `export default function AssistantLauncher(): JSX.Element | null` (no props), `export function isAssistantSuppressed(pathname: string): boolean`. Renders `<AssistantPanel suppressed={boolean} />`.

- [ ] **Step 1: Record the bundle baseline**

Run: `npm run build 2>&1 | tee /tmp/v1a-before.txt`
Expected: build succeeds. Write down the First Load JS for `/`, `/course/[code]`, `/reviews/[code]/[...prof]`, `/timetable`, and "First Load JS shared by all". Task 6 compares against these numbers.

- [ ] **Step 2: Update the launcher tests**

In `tests/components/assistant-launcher.test.tsx`:

Replace the hoisted mocks and module mocks at the top with:

```tsx
const { useAuthMock, usePathnameMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/"),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPanel({ suppressed }: { suppressed: boolean }) {
      return <div data-testid="assistant-panel" data-suppressed={String(suppressed)} />;
    },
}));

import AssistantLauncher, { isAssistantSuppressed } from "@/components/assistant/assistant-launcher";
```

Add `usePathnameMock.mockReturnValue("/");` as the first line of the existing `afterEach`.

Replace every `<AssistantLauncher plan={undefined} />` with `<AssistantLauncher />`, and every `{ isLoaded: true, isSignedIn: true }` with `{ isLoaded: true, isSignedIn: true, userId: "user_a" }`.

Append these tests inside `describe("AssistantLauncher", …)`:

```tsx
  it.each(["/admin", "/admin/assistant", "/oauth-consent", "/sign-in", "/sign-up/verify"])(
    "shows no button on %s",
    async (path) => {
      usePathnameMock.mockReturnValue(path);
      useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
      const fetchMock = stubFetch(respond(true, { enabled: true }));
      const { container } = render(<AssistantLauncher />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(container.innerHTML).toBe("");
    },
  );

  it("keeps an opened panel mounted but suppressed on excluded routes", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    stubFetch(respond(true, { enabled: true }));
    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI 選課助手" }));
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("false");

    usePathnameMock.mockReturnValue("/admin/assistant");
    rerender(<AssistantLauncher />);
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("true");

    usePathnameMock.mockReturnValue("/course/COMP1000");
    rerender(<AssistantLauncher />);
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("false");
  });

  it("drops the opened panel on sign-out and starts closed after signing back in", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    stubFetch(respond(true, { enabled: true }));
    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI 選課助手" }));
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null });
    rerender(<AssistantLauncher />);
    expect(screen.queryByTestId("assistant-panel")).toBeNull();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    rerender(<AssistantLauncher />);
    expect(await screen.findByRole("button", { name: "AI 選課助手" })).toBeTruthy();
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
  });

  it("re-checks access and drops the panel when the signed-in user changes", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI 選課助手" }));

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_b" });
    rerender(<AssistantLauncher />);
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    expect(await screen.findByRole("button", { name: "AI 選課助手" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("isAssistantSuppressed", () => {
  it.each([
    ["/admin", true],
    ["/admin/assistant", true],
    ["/oauth-consent/abc", true],
    ["/sign-in", true],
    ["/sign-up", true],
    ["/administrator", false],
    ["/", false],
    ["/course/COMP1000", false],
    ["/timetable", false],
  ])("%s → %s", (path, expected) => {
    expect(isAssistantSuppressed(path)).toBe(expected);
  });
```

(The closing `});` of the existing `describe` moves after the new `isAssistantSuppressed` block. Make sure the braces still match.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/assistant-launcher.test.tsx`
Expected: FAIL. `isAssistantSuppressed` is not exported, the suppressed-route tests find a button, and the user-switch test sees 1 fetch call instead of 2.

- [ ] **Step 4: Implement the launcher**

Replace `components/assistant/assistant-launcher.tsx` with:

```tsx
"use client";

import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AssistantBubble } from "./assistant-bubble";

const AssistantPanel = dynamic(() => import("./assistant-panel"), { ssr: false });

const SUPPRESSED_PREFIXES = ["/admin", "/oauth-consent", "/sign-in", "/sign-up"];

export function isAssistantSuppressed(pathname: string) {
  return SUPPRESSED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AssistantLauncher() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    // A different user must not see the previous user's conversation or access result.
    setEnabled(false);
    setOpened(false);
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json().catch(() => null);
        return body?.enabled === true;
      })
      .then((nextEnabled) => {
        if (!cancelled) setEnabled(nextEnabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoaded, isSignedIn, userId]);

  if (!enabled) return null;

  const suppressed = isAssistantSuppressed(pathname);
  if (opened) return <AssistantPanel suppressed={suppressed} />;
  if (suppressed) return null;

  return <AssistantBubble onClick={() => setOpened(true)} />;
}
```

`tsc` will flag `app/timetable/page.tsx` (it still passes `plan`) and `assistant-panel.tsx` (no `suppressed` prop yet). Tasks 2 and 3 fix both. Don't run `tsc` until the end of Task 3.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/components/assistant-launcher.test.tsx`
Expected: PASS, all tests.

Don't commit yet. The launcher, panel, and layout props change together, so Tasks 1–3 land as one commit at the end of Task 3, the first point where `tsc` passes again. Each task still has its own test gate for review.

---

### Task 2: Panel reads the global plan, supports suppression, and flags its open state

**Files:**
- Modify: `components/assistant/assistant-panel.tsx`
- Test: `tests/components/assistant-panel.test.tsx`

**Interfaces:**
- Consumes: `useTimetablePlanner(): { activePlan?: LocalPlan; … }` from `@/components/timetable/planner-provider`. `<AssistantPanel suppressed={boolean} />` from Task 1.
- Produces: `export default function AssistantPanel({ suppressed }: { suppressed: boolean })`. While the sidebar is visible, `<html>` has the attribute `data-assistant-open` (empty value). It is removed when the sidebar closes, is suppressed, or unmounts. Task 4 styles against this attribute.

- [ ] **Step 1: Update the panel tests**

In `tests/components/assistant-panel.test.tsx`:

Replace the hoisted block with:

```tsx
const { sidebarSpy, providerSpy, suggestionsSpy, agentContextSpy, plannerMock } = vi.hoisted(() => ({
  sidebarSpy: vi.fn(),
  providerSpy: vi.fn(),
  suggestionsSpy: vi.fn(),
  agentContextSpy: vi.fn(),
  plannerMock: vi.fn(),
}));
```

In the `@copilotkit/react-core/v2` mock, change `useAgentContext: () => {},` to `useAgentContext: agentContextSpy,`.

Below the existing `vi.mock("@/lib/timetable/catalog-client", …)` add:

```tsx
vi.mock("@/components/timetable/planner-provider", () => ({ useTimetablePlanner: plannerMock }));
```

Below `import AssistantPanel …` add:

```tsx
import { summarizePlan } from "@/lib/assistant/plan-summary";
import type { LocalPlan } from "@/lib/timetable/store";
```

In `beforeEach`, add `plannerMock.mockReturnValue({ activePlan: undefined });`.
In `afterEach`, add `document.documentElement.removeAttribute("data-assistant-open");`.

Replace every `<AssistantPanel plan={undefined} />` with `<AssistantPanel suppressed={false} />`.

Append inside `describe("AssistantPanel", …)`:

```tsx
  it("gives the agent the active plan from the global planner", () => {
    const plan = {
      clientRef: "plan-1",
      name: "我的课表",
      year: 2026,
      sem: 1,
      payload: {
        schemaVersion: 1,
        sections: [
          {
            key: "ACCT1000|CHAN|A01",
            courseCode: "ACCT1000",
            prof: "CHAN",
            section: "A01",
            color: "#2563eb",
            schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
          },
        ],
      },
      revision: 1,
      syncState: "idle",
    } as unknown as LocalPlan;
    plannerMock.mockReturnValue({ activePlan: plan });

    render(<AssistantPanel suppressed={false} />);
    expect(agentContextSpy).toHaveBeenLastCalledWith({
      description: "The student's active timetable plan (read-only)",
      value: summarizePlan(plan),
    });
    expect(summarizePlan(plan)).toContain("ACCT1000-A01");
  });

  it("marks <html> only while the sidebar is visible", () => {
    const { unmount } = render(<AssistantPanel suppressed={false} />);
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "AI 選課助手" }));
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);

    unmount();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);
  });

  it("closes without a bubble while suppressed and restores the open state afterwards", () => {
    const { rerender } = render(<AssistantPanel suppressed={false} />);
    const sidebar = screen.getByTestId("copilot-sidebar");

    rerender(<AssistantPanel suppressed />);
    expect(sidebar.getAttribute("data-open")).toBe("false");
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    rerender(<AssistantPanel suppressed={false} />);
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/assistant-panel.test.tsx`
Expected: FAIL. The plan context is "No timetable plan", the `<html>` attribute is never set, and the sidebar stays open when suppressed.

- [ ] **Step 3: Implement the panel changes**

In `components/assistant/assistant-panel.tsx`:

Change the React import to include `useLayoutEffect`:

```tsx
import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
```

Replace `import type { LocalPlan } from "@/lib/timetable/store";` with:

```tsx
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
```

Below `const SIDEBAR_WIDTH = …` add:

```tsx
// FloatingPlanner keys its offset off this attribute; the name is repeated literally in its Tailwind classes.
const OPEN_ATTRIBUTE = "data-assistant-open";
```

Replace `AssistantTools` and the default export with:

```tsx
function AssistantTools() {
  const { activePlan } = useTimetablePlanner();
  const planRef = useRef(activePlan);
  planRef.current = activePlan;

  useAgentContext({ description: "The student's active timetable plan (read-only)", value: summarizePlan(activePlan) });
  useConfigureSuggestions(EXAMPLE_SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description:
        "Check whether one section of a course taught by an instructor clashes with the student's current timetable. Read-only; never changes the timetable.",
      parameters: checkPlanConflictsParameters,
      handler: async (input) =>
        runCheckPlanConflicts(planRef.current?.payload.sections ?? [], input, getSections),
    },
    [],
  );

  return null;
}

export default function AssistantPanel({ suppressed }: { suppressed: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const shown = open && !suppressed;

  useLayoutEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    root.setAttribute(OPEN_ATTRIBUTE, "");
    return () => root.removeAttribute(OPEN_ATTRIBUTE);
  }, [shown]);

  return (
    <>
      <link rel="stylesheet" href={COPILOTKIT_STYLES_HREF} />
      <link rel="stylesheet" href={COPILOTKIT_THEME_HREF} />
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        enableInspector={false}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools />
        <NoticeContext.Provider value={notice}>
          <CopilotSidebar
            open={shown}
            onOpenChange={setOpen}
            width={SIDEBAR_WIDTH}
            labels={LABELS}
            header={HEADER}
            toggleButton={HiddenToggle}
            welcomeScreen={WelcomeScreen}
            input={{ disclaimer: BoundaryNotice, showDisclaimer: true, addMenuButton: Hidden }}
          />
        </NoticeContext.Provider>
      </CopilotKitProvider>
      <ResizeHandle visible={shown} />
      {open || suppressed ? null : <AssistantBubble onClick={() => setOpen(true)} />}
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/assistant-panel.test.tsx tests/components/assistant-launcher.test.tsx`
Expected: PASS. Don't commit yet (see Task 1 step 5).

---

### Task 3: Mount the launcher in the root layout

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/timetable/page.tsx`
- Test: `tests/assistant/global-mount.test.ts` (new), `tests/components/timetable-page.test.tsx`

**Interfaces:**
- Consumes: `AssistantLauncher` (no props) from Task 1.

- [ ] **Step 1: Write the mount test**

Create `tests/assistant/global-mount.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("global assistant mount", () => {
  it("mounts the launcher once in the root layout, inside the planner provider", () => {
    const layout = read("app/layout.tsx");
    const open = layout.indexOf("<TimetablePlannerProvider>");
    const launcher = layout.indexOf("<AssistantLauncher />");
    const close = layout.indexOf("</TimetablePlannerProvider>");
    expect(launcher).toBeGreaterThan(open);
    expect(launcher).toBeLessThan(close);
    expect(layout.indexOf("<AssistantLauncher", launcher + 1)).toBe(-1);
  });

  it("is not mounted anywhere else under app/", () => {
    const others = sourceFiles("app").filter(
      (path) => path !== "app/layout.tsx" && read(path).includes("assistant-launcher"),
    );
    expect(others).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/assistant/global-mount.test.ts`
Expected: FAIL. The layout has no `<AssistantLauncher />`, and `app/timetable/page.tsx` still imports it.

- [ ] **Step 3: Mount in the layout**

In `app/layout.tsx`, add the import after the `FloatingPlanner` import:

```tsx
import AssistantLauncher from '@/components/assistant/assistant-launcher';
```

And render it right after `<FloatingPlanner />`:

```tsx
                    <FloatingPlanner />
                    <AssistantLauncher />
                    </TimetablePlannerProvider>
```

- [ ] **Step 4: Remove the timetable-page mounts**

In `app/timetable/page.tsx`, delete the line `import AssistantLauncher from "@/components/assistant/assistant-launcher";`, the line `        <AssistantLauncher plan={undefined} />` in the no-plan branch, and the line `      <AssistantLauncher plan={activePlan} />` at the end of the main return.

In `tests/components/timetable-page.test.tsx`, delete the `vi.mock("@/components/assistant/assistant-launcher", …)` block and both `expect(screen.getByTestId("assistant-launcher")).toBeTruthy();` lines.

- [ ] **Step 5: Run the tests, typecheck, and lint**

Run: `npx vitest run tests/assistant/global-mount.test.ts tests/components/timetable-page.test.tsx tests/components/assistant-launcher.test.tsx tests/components/assistant-panel.test.tsx && npx tsc --noEmit -p . && npm run lint`
Expected: all PASS, `tsc` exit 0, lint has no warnings.

- [ ] **Step 6: Commit**

```bash
git add components/assistant/assistant-launcher.tsx components/assistant/assistant-panel.tsx \
  app/layout.tsx app/timetable/page.tsx \
  tests/components/assistant-launcher.test.tsx tests/components/assistant-panel.test.tsx \
  tests/assistant/global-mount.test.ts tests/components/timetable-page.test.tsx
git commit -m "feat(assistant): mount the assistant site-wide from the root layout"
```

---

### Task 4: Keep the assistant and FloatingPlanner out of each other's way

Two collisions appear once the assistant leaves `/timetable` (where `FloatingPlanner` renders nothing):

- **Mobile, sidebar closed:** the bubble's speech label plus the 56px cat button is about 230px wide, anchored 24px from the right. On a 375px screen it spans x≈122–351 and covers `FloatingPlanner`'s centered 48px button (x≈164–212, bottom 16–64px).
- **Desktop, sidebar open:** the sidebar is `fixed right-0 z-[1200]`. `FloatingPlanner`'s tab (`fixed right-0 z-40`) and its 400px preview (`fixed right-4`) end up underneath it. CopilotKit's body margin doesn't move fixed elements.

**Files:**
- Modify: `components/assistant/assistant-bubble.tsx`
- Modify: `components/timetable/floating-planner.tsx`
- Test: `tests/components/assistant-bubble.test.tsx` (new), `tests/components/floating-planner.test.tsx`

**Interfaces:**
- Consumes: the `data-assistant-open` attribute on `<html>` and the `--assistant-width` CSS variable (set by `ResizeHandle` while the panel is mounted), both from Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/assistant-bubble.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantBubble } from "@/components/assistant/assistant-bubble";

afterEach(() => {
  cleanup();
});

describe("AssistantBubble", () => {
  it("shows only the round button on phones so it clears FloatingPlanner's centered button", () => {
    render(<AssistantBubble onClick={() => {}} />);
    const label = screen.getByText("可以試試 AI 選課");
    expect(label.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "md:block"]));
    expect(screen.getByRole("button", { name: "AI 選課助手" })).toBeTruthy();
  });
});
```

Append inside `describe("FloatingPlanner", …)` in `tests/components/floating-planner.test.tsx`:

```tsx
  it("moves its desktop tab and preview left of an open assistant sidebar", () => {
    usePathnameMock.mockReturnValue("/course/ACCT1000");
    plannerMock.mockReturnValue({ activePlan: undefined, syncState: "idle" });

    render(<FloatingPlanner />);
    const tab = screen.getByLabelText("Open timetable preview");
    expect(tab.className).toContain("[html[data-assistant-open]_&]:right-[var(--assistant-width)]");

    fireEvent.click(tab);
    const preview = screen
      .getAllByText("My Timetable")
      .map((element) => element.closest("aside"))
      .find(Boolean)!;
    expect(preview.className).toContain(
      "[html[data-assistant-open]_&]:right-[calc(var(--assistant-width)_+_1rem)]",
    );
    expect(preview.className).toContain(
      "[html[data-assistant-open]_&]:max-w-[calc(100vw_-_var(--assistant-width)_-_2rem)]",
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/assistant-bubble.test.tsx tests/components/floating-planner.test.tsx`
Expected: FAIL on the missing classes.

- [ ] **Step 3: Implement**

In `components/assistant/assistant-bubble.tsx`, change the label span's class from
`"relative rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs font-medium leading-snug text-foreground shadow-md"`
to
`"relative hidden rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs font-medium leading-snug text-foreground shadow-md md:block"`.

In `components/timetable/floating-planner.tsx`, append to the desktop tab button's `className` (the one with `fixed right-0 top-1/2`):

```text
 [html[data-assistant-open]_&]:right-[var(--assistant-width)]
```

and append to the desktop preview `<aside>`'s `className` (the one with `fixed right-4 top-1/2`):

```text
 [html[data-assistant-open]_&]:right-[calc(var(--assistant-width)_+_1rem)] [html[data-assistant-open]_&]:max-w-[calc(100vw_-_var(--assistant-width)_-_2rem)]
```

Leave the mobile button and Sheet alone. The open sidebar covers the whole screen on mobile.

- [ ] **Step 4: Run the tests to verify they pass, and check Tailwind emits the rules**

Run: `npx vitest run tests/components/assistant-bubble.test.tsx tests/components/floating-planner.test.tsx tests/components/assistant-launcher.test.tsx`
Expected: PASS.

Run: `npm run build >/tmp/v1a-after.txt 2>&1 && rg -l "data-assistant-open" .next/static/css`
Expected: at least one CSS file listed. If none, Tailwind didn't generate the arbitrary variants. Check that `components/**` is in `tailwind.config` `content` before going further.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/assistant-bubble.tsx components/timetable/floating-planner.tsx tests/components/assistant-bubble.test.tsx tests/components/floating-planner.test.tsx
git commit -m "fix(assistant): keep the bubble and sidebar clear of FloatingPlanner"
```

---

### Task 5: Make the prompt page-neutral

Rule 7 tells the student to "use the planner on the left", which is only true on `/timetable`. Adding sections is done from a course's review page (`components/timetable-schedule-card.tsx`) or the My Timetable page. The final sentence about the plan context stays, because the plan is now available on every page.

**Files:**
- Modify: `lib/assistant/prompt.ts`
- Test: `tests/assistant/agent.test.ts`

- [ ] **Step 1: Update the prompt test**

In `tests/assistant/agent.test.ts`, inside `describe("ASSISTANT_PROMPT", …)`, replace `"planner on the left",` in the `it.each` list with `"review page or the My Timetable page",`, and add:

```ts
  it("does not assume the student is on the timetable page", () => {
    expect(ASSISTANT_PROMPT).not.toContain("on the left");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/assistant/agent.test.ts`
Expected: FAIL on both.

- [ ] **Step 3: Update rule 7**

In `lib/assistant/prompt.ts`, replace rule 7 with:

```ts
  "7. Do not promise to submit enrolments, check seat availability, or predict batches. When the student asks to add a course, tell them to add the section themselves from the course's review page or the My Timetable page.",
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/assistant/agent.test.ts tests/assistant/golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/prompt.ts tests/assistant/agent.test.ts
git commit -m "feat(assistant): drop the timetable-page wording from the prompt"
```

---

### Task 6: Full verification and preview check

No code changes. Results go in `docs/superpowers/verification/2026-10-19-global-assistant-v1a.md`.

- [ ] **Step 1: Automated checks**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run lint`
Expected: all test files pass, `tsc` exit 0, no lint warnings.

- [ ] **Step 2: Bundle comparison**

Compare `/tmp/v1a-after.txt` (from Task 4) with `/tmp/v1a-before.txt`.
Acceptance: First Load JS for `/`, `/course/[code]`, and `/reviews/[code]/[...prof]` grows by at most 1.5 kB. `/timetable` stays the same or shrinks. Shared JS grows by at most 1.5 kB. Anything larger means CopilotKit leaked out of the dynamic chunk: find the import chain before going on.

- [ ] **Step 3: Preview deployment**

Deploy to the preview worker (`docs/superpowers/plans/2026-10-19-preview-worker.md` runbook) with assistant access set to `testers`. Sign in as a tester and check each item, writing pass/fail and notes in the verification doc:

1. **Lazy loading:** on a fresh load of `/` (DevTools Network, cache disabled), there is no request to `/api/copilotkit` and no CopilotKit chunk until the bubble is clicked. There is exactly one `/api/assistant/access` request.
2. **V1-A acceptance:** open the assistant on `/`, ask "ACCT1000 是什麼課？" (what is ACCT1000?), then use site links (not the assistant) to go to `/course/ACCT1000`, a `/reviews/…` page, then `/timetable`. The sidebar stays open the whole time and the earlier messages stay visible. Ask a follow-up on `/timetable` and get an answer.
3. **Global plan:** on `/course/ACCT1000`, ask whether one of its sections clashes with your timetable. `check_plan_conflicts` runs and the answer matches the plan.
4. **Desktop layout (≥1280px):** with the sidebar open, page content reflows (no horizontal scroll) on `/`, `/catalog`, `/course/ACCT1000`, and a reviews page. `FloatingPlanner`'s tab sits just left of the sidebar and tracks it while you drag the resize handle. Its preview opens fully visible. Closing the sidebar moves the tab back to the edge.
5. **Narrow desktop (800px):** the `FloatingPlanner` preview isn't clipped on the left with the sidebar open.
6. **Mobile (375×812 emulation):** sidebar closed, the round cat button and `FloatingPlanner`'s button don't overlap. Opening covers the full screen, and the header close button returns to the page. `FloatingPlanner`'s sheet still opens.
7. **Suppressed routes:** with the sidebar open, go to `/admin`. The sidebar closes and no bubble appears. Going back restores the sidebar with the conversation intact.
8. **Sign-out:** with the conversation open, sign out. The assistant disappears. Sign back in and the bubble returns with an empty conversation.
9. **Access off:** set mode to `off`. No bubble on any page, and no `/api/copilotkit` traffic.
10. **Skins:** animal-island skin and dark mode on `/course/ACCT1000` with the sidebar open. No CopilotKit styles bleed into site components (buttons, headings, cards).
11. **Transient overlaps:** note whether sonner toasts (bottom-right) or mobile AdSense anchor ads cover the bubble. Record only; fix in a later pass if it's bad.

- [ ] **Step 4: Commit the verification notes**

```bash
git add docs/superpowers/verification/2026-10-19-global-assistant-v1a.md
git commit -m "docs(assistant): record global assistant V1-A verification"
```

---

## Regression risks

| Risk | Where it shows | Covered by |
|---|---|---|
| CopilotKit leaks into the shared bundle | First Load JS on every page | Task 6 step 2, preview item 1 |
| Body margin reflow breaks wide layouts (homepage hero, catalog grid, ad slots) on pages that never had the sidebar | Desktop with sidebar open | Preview item 4 |
| CopilotKit's layered Tailwind v4 CSS affects site components on pages beyond `/timetable` | Any page after first open | `css-layers` / `theme-sync` tests stay green; preview item 10 |
| Previous user's conversation visible after account switch | Shared computers | Task 1 tests, preview item 8 |
| Panel opens over admin or OAuth consent flows | `/admin`, `/oauth-consent` | Task 1 tests, preview item 7 |
| Extra `/api/assistant/access` request per full page load for signed-in users | Server load | Measured in preview item 1; once per load, not per navigation |
| The agent can't tell which course "this course" means outside `/timetable` | Any page, until V1-B lands | Known gap. Ship V1-A only to testers, or ship V1-A and V1-B together |

## Out of scope for V1-A

Route-derived page context (V1-B), the `navigate` frontend tool (V1-C), page-specific suggestions, conversation persistence across reloads, rate-limit changes, and `get_course_offerings` (V1-D).
