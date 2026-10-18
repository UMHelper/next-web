# Assistant Panel Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/timetable` AI assistant sidebar feel finished: a header close button with a reopen pill, a drag-to-resize width that is remembered, a one-row header and input, a one-line disclaimer, and an empty state with clickable example questions.

**Architecture:** Keep CopilotKit's `CopilotSidebar` and customize it through its props and slots (`open`/`onOpenChange`, `header`, `toggleButton`, `welcomeScreen`, `input.addMenuButton`, `input.disclaimer`). Width is a CSS variable `--assistant-width` on `<html>`. The sidebar gets the fixed string `width="var(--assistant-width, 380px)"`, and a separate `ResizeHandle` component updates only the variable. The rest is small layout CSS in `public/assistant/copilotkit-theme.css`.

**Tech Stack:** Next.js 14 (App Router), React 18, Tailwind CSS 3, `@copilotkit/react-core/v2` 1.79.1 (pinned), Vitest + Testing Library (jsdom for `tests/components/**`), lucide-react icons.

Spec: `docs/superpowers/specs/2026-10-18-assistant-panel-polish-design.md`

## Global Constraints

- Do not edit `public/assistant/copilotkit-v2.css`. It must stay byte-identical to `node_modules/@copilotkit/react-core/dist/v2/index.css` (`tests/assistant/dependency-contract.test.ts`).
- Do not touch `components/timetable/planner-sidebar.tsx` or `supabase/seed.sql`. They have unrelated uncommitted user changes. Never `git add -A` or `git add .`.
- Width: default 380, min 320, max 560, keyboard step 16, page keeps at least 480 (`max = min(560, viewport - 480)`). When that cap is below 320, 320 wins.
- Storage key: `umeh-assistant-width`.
- Copy (exact): title `AI 选课助手`, badge `试点`, close button `aria-label="收起助手"`, reopen pill text `AI 选课助手`, resize handle `aria-label="调整助手宽度"`.
- Intro (exact): `可以问课程、教授、评价和 section 时间，也能检查某个 section 会不会和你的课表冲突。` Second line: `只读，不会改动课表 · 单次对话最多 30 轮`.
- Example questions (exact, in order): `有哪些和 accounting 相关的课？`, `ACCT1000 是什么课？几个学分？`, `ACCT1000 有哪些 section？什么时间上课？`
- Disclaimer (exact shape): `本站不是 myUM · Pre-Enrolment · Add/Drop · 数据更新于 {DATA_UPDATED_AT}`, with `Pre-Enrolment` and `Add/Drop` as links to the existing URLs.
- CopilotKit slot values must be component types defined at module level (stable identity). Passing a JSX element falls back to CopilotKit's default component, and a new function per render remounts the slot.
- Code comments only for constraints the code can't show (match the existing sparse style).

## Why a CSS variable for width (read before Task 2)

In `node_modules/@copilotkit/react-core/dist/copilotkit-CD3uPUN3.mjs`:

- `CopilotSidebar` memoizes its view component on `[header, toggleButton, width, defaultOpen, position]` (around line 10189). A new `width` value creates a new component type, so React remounts the whole chat view.
- `CopilotSidebarViewInternal` copies `width` into `useState` once (line 9913) and writes it to `--sidebar-width` and `document.body.style.marginInlineEnd` as a string (lines 9914-9920, 9947).

So `width` must never change. Passing `var(--assistant-width, 380px)` makes both the panel width and the body margin follow the variable through CSS. CopilotKit also sets `document.body.style.transition = "margin-inline-end 260ms ease"`, which makes the margin lag while dragging. `ResizeHandle` sets the body transition to `none` while a drag is active.

## File Map

- Create `lib/assistant/panel-width.ts`: width constants, clamping, storage read/write. Pure, no React.
- Create `components/assistant/resize-handle.tsx`: owns width state, writes `--assistant-width` on `<html>`, handles drag, keyboard, double-click, and window resize.
- Create `components/assistant/launcher-pill.ts`: the pill class string shared by the launcher and the reopen button.
- Modify `components/assistant/assistant-launcher.tsx`: use the shared pill class.
- Modify `components/assistant/assistant-panel.tsx`: controlled open state, header, hidden chrome, reopen pill, welcome screen, example questions, compact disclaimer, resize wiring.
- Modify `public/assistant/copilotkit-theme.css`: input side padding and flush suggestion chips.
- Tests: `tests/assistant/panel-width.test.ts`, `tests/components/assistant-resize-handle.test.tsx`, `tests/components/assistant-panel.test.tsx`, plus an addition to `tests/assistant/theme-sync.test.ts`.

---

### Task 1: Commit the existing theme work as a baseline

The theme bridge and sidebar width work from earlier sessions is uncommitted. Commit it alone so later diffs are reviewable.

**Files:**
- Commit only: `components/assistant/assistant-panel.tsx`, `public/assistant/copilotkit-theme.css`, `tests/assistant/theme-sync.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a clean baseline. `git status --short` afterwards still lists `components/timetable/planner-sidebar.tsx` and `supabase/seed.sql` as modified, and nothing else.

- [ ] **Step 1: Confirm the baseline tests pass**

Run: `npx vitest run tests/assistant/ tests/theme- tests/skin-default-parity.test.ts`
Expected: all test files pass.

- [ ] **Step 2: Commit only the three files**

```bash
git add components/assistant/assistant-panel.tsx public/assistant/copilotkit-theme.css tests/assistant/theme-sync.test.ts
git commit -m "feat(assistant): theme the sidebar with site tokens and narrow its width"
```

- [ ] **Step 3: Verify nothing else was staged**

Run: `git status --short`
Expected:
```
 M components/timetable/planner-sidebar.tsx
 M supabase/seed.sql
```

---

### Task 2: Width rules and storage (`lib/assistant/panel-width.ts`)

**Files:**
- Create: `lib/assistant/panel-width.ts`
- Test: `tests/assistant/panel-width.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PANEL_WIDTH_DEFAULT = 380`, `PANEL_WIDTH_MIN = 320`, `PANEL_WIDTH_MAX = 560`, `PANEL_WIDTH_STEP = 16`, `PANEL_WIDTH_STORAGE_KEY = "umeh-assistant-width"` (all `export const`)
  - `maxPanelWidth(viewportWidth: number): number`
  - `clampPanelWidth(width: number, viewportWidth: number): number` (non-finite input is treated as the default; result rounded to an integer)
  - `readStoredPanelWidth(): number` (unclamped; default when missing, unparsable, or storage throws)
  - `storePanelWidth(width: number): void` (falls back to an in-memory session value when storage throws)

- [ ] **Step 1: Write the failing test**

Create `tests/assistant/panel-width.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type PanelWidthModule = typeof import("@/lib/assistant/panel-width");
let mod: PanelWidthModule;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("@/lib/assistant/panel-width");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("maxPanelWidth", () => {
  it("leaves the page at least 480px and caps at 560", () => {
    expect(mod.maxPanelWidth(1024)).toBe(544);
    expect(mod.maxPanelWidth(1440)).toBe(560);
  });

  it("never goes below the 320 minimum on narrow windows", () => {
    expect(mod.maxPanelWidth(780)).toBe(320);
  });
});

describe("clampPanelWidth", () => {
  it("keeps in-range widths and rounds them", () => {
    expect(mod.clampPanelWidth(400.4, 1440)).toBe(400);
  });

  it("clamps to the minimum and to the viewport-aware maximum", () => {
    expect(mod.clampPanelWidth(100, 1440)).toBe(320);
    expect(mod.clampPanelWidth(900, 1440)).toBe(560);
    expect(mod.clampPanelWidth(560, 1024)).toBe(544);
  });

  it("treats a non-finite width as the default", () => {
    expect(mod.clampPanelWidth(Number.NaN, 1440)).toBe(380);
  });
});

describe("stored width", () => {
  it("defaults to 380 when nothing is stored", () => {
    installFakeStorage();
    expect(mod.readStoredPanelWidth()).toBe(380);
  });

  it("round-trips a stored width", () => {
    const storage = installFakeStorage();
    mod.storePanelWidth(452);
    expect(storage.getItem(mod.PANEL_WIDTH_STORAGE_KEY)).toBe("452");
    expect(mod.readStoredPanelWidth()).toBe(452);
  });

  it("returns an unparsable stored value as the default", () => {
    installFakeStorage().setItem("umeh-assistant-width", "wide");
    expect(mod.readStoredPanelWidth()).toBe(380);
  });

  it("falls back to 380 and keeps the width in memory when storage throws", () => {
    const fail = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    expect(mod.readStoredPanelWidth()).toBe(380);
    mod.storePanelWidth(420);
    expect(mod.readStoredPanelWidth()).toBe(420);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assistant/panel-width.test.ts`
Expected: FAIL, cannot resolve `@/lib/assistant/panel-width`.

- [ ] **Step 3: Write the implementation**

Create `lib/assistant/panel-width.ts`:

```ts
export const PANEL_WIDTH_DEFAULT = 380;
export const PANEL_WIDTH_MIN = 320;
export const PANEL_WIDTH_MAX = 560;
export const PANEL_WIDTH_STEP = 16;
export const PANEL_WIDTH_STORAGE_KEY = "umeh-assistant-width";

const PAGE_MIN_WIDTH = 480;

// 存储不可用（如隐私模式）时，本次会话内的宽度只保存在内存里
let sessionWidth: number | null = null;

export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, viewportWidth - PAGE_MIN_WIDTH));
}

export function clampPanelWidth(width: number, viewportWidth: number): number {
  const target = Number.isFinite(width) ? width : PANEL_WIDTH_DEFAULT;
  return Math.round(Math.min(Math.max(target, PANEL_WIDTH_MIN), maxPanelWidth(viewportWidth)));
}

export function readStoredPanelWidth(): number {
  if (sessionWidth !== null) return sessionWidth;
  try {
    const stored = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(parsed) ? parsed : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

export function storePanelWidth(width: number): void {
  try {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
    sessionWidth = null;
  } catch {
    sessionWidth = width;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/assistant/panel-width.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/panel-width.ts tests/assistant/panel-width.test.ts
git commit -m "feat(assistant): add sidebar width clamping and storage"
```

---

### Task 3: Resize handle (`components/assistant/resize-handle.tsx`)

**Files:**
- Create: `components/assistant/resize-handle.tsx`
- Test: `tests/components/assistant-resize-handle.test.tsx`

**Interfaces:**
- Consumes (Task 2): `PANEL_WIDTH_DEFAULT`, `PANEL_WIDTH_MIN`, `PANEL_WIDTH_STEP`, `PANEL_WIDTH_STORAGE_KEY`, `clampPanelWidth`, `maxPanelWidth`, `readStoredPanelWidth`, `storePanelWidth`
- Produces:
  - `export const PANEL_WIDTH_VAR = "--assistant-width"`
  - `export default function ResizeHandle({ visible }: { visible: boolean }): JSX.Element | null`. It always keeps `--assistant-width` set on `document.documentElement` while mounted, including when `visible` is false, so the sidebar keeps its width while sliding out. It renders the handle only when `visible` is true, and removes the variable on unmount.

- [ ] **Step 1: Write the failing test**

Create `tests/components/assistant-resize-handle.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ResizeHandle, { PANEL_WIDTH_VAR } from "@/components/assistant/resize-handle";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const cssWidth = () => document.documentElement.style.getPropertyValue(PANEL_WIDTH_VAR);
let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
});

describe("ResizeHandle", () => {
  it("starts at 380 and exposes the width to assistive tech", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator", { name: "调整助手宽度" });
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    expect(handle.getAttribute("aria-valuemin")).toBe("320");
    expect(handle.getAttribute("aria-valuemax")).toBe("560");
    expect(cssWidth()).toBe("380px");
  });

  it("restores the stored width and clamps out-of-range values", () => {
    storage.setItem("umeh-assistant-width", "900");
    render(<ResizeHandle visible />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("560");
    expect(cssWidth()).toBe("560px");
  });

  it("widens with ArrowLeft and narrows with ArrowRight by 16px, within bounds", () => {
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("396");
    expect(storage.getItem("umeh-assistant-width")).toBe("396");
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("320");
  });

  it("resets to 380 on double-click", () => {
    storage.setItem("umeh-assistant-width", "500");
    render(<ResizeHandle visible />);
    const handle = screen.getByRole("separator");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("380");
    expect(storage.getItem("umeh-assistant-width")).toBe("380");
  });

  it("keeps the width variable but hides the handle while the panel is closed", () => {
    storage.setItem("umeh-assistant-width", "420");
    const { rerender } = render(<ResizeHandle visible />);
    rerender(<ResizeHandle visible={false} />);
    expect(screen.queryByRole("separator")).toBeNull();
    expect(cssWidth()).toBe("420px");
  });

  it("re-clamps when the window shrinks and removes the variable on unmount", () => {
    storage.setItem("umeh-assistant-width", "560");
    const { unmount } = render(<ResizeHandle visible />);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
    expect(cssWidth()).toBe("544px");
    unmount();
    expect(cssWidth()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/assistant-resize-handle.test.tsx`
Expected: FAIL, cannot resolve `@/components/assistant/resize-handle`.

- [ ] **Step 3: Write the implementation**

Create `components/assistant/resize-handle.tsx`:

```tsx
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN,
  PANEL_WIDTH_STEP,
  clampPanelWidth,
  maxPanelWidth,
  readStoredPanelWidth,
  storePanelWidth,
} from "@/lib/assistant/panel-width";
import { cn } from "@/lib/utils";

export const PANEL_WIDTH_VAR = "--assistant-width";

export default function ResizeHandle({ visible }: { visible: boolean }) {
  const [width, setWidth] = useState(() =>
    clampPanelWidth(readStoredPanelWidth(), window.innerWidth),
  );
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(PANEL_WIDTH_VAR, `${width}px`);
  }, [width]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(PANEL_WIDTH_VAR);
    },
    [],
  );

  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // CopilotKit animates body margin-inline-end on every width change, which lags behind the pointer.
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.transition;
    document.body.style.transition = "none";
    return () => {
      document.body.style.transition = previous;
      storePanelWidth(widthRef.current);
    };
  }, [dragging]);

  useEffect(() => {
    if (!visible) setDragging(false);
  }, [visible]);

  if (!visible) return null;

  const commit = (next: number) => {
    const clamped = clampPanelWidth(next, window.innerWidth);
    setWidth(clamped);
    storePanelWidth(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setWidth(clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commit(width + PANEL_WIDTH_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commit(width - PANEL_WIDTH_STEP);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整助手宽度"
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={maxPanelWidth(window.innerWidth)}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => commit(PANEL_WIDTH_DEFAULT)}
      style={{ right: width }}
      className="group fixed inset-y-0 z-[1201] hidden w-2 translate-x-1/2 cursor-col-resize touch-none outline-none md:block"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-brand group-focus-visible:bg-brand",
          dragging && "bg-brand",
        )}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/assistant-resize-handle.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint the new files**

Run: `npx eslint components/assistant/resize-handle.tsx lib/assistant/panel-width.ts --max-warnings=0`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add components/assistant/resize-handle.tsx tests/components/assistant-resize-handle.test.tsx
git commit -m "feat(assistant): add keyboard-accessible sidebar resize handle"
```

---

### Task 4: Close, reopen, and header

**Files:**
- Create: `components/assistant/launcher-pill.ts`
- Modify: `components/assistant/assistant-launcher.tsx` (the `className` on the launcher button)
- Modify: `components/assistant/assistant-panel.tsx` (full file below)
- Test: `tests/components/assistant-panel.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (resize wiring is Task 5)
- Produces:
  - `export const ASSISTANT_PILL_CLASS: string` from `components/assistant/launcher-pill.ts`
  - `AssistantPanel` (default export, props `{ plan: LocalPlan | undefined }`, unchanged) now controls `open` and renders a reopen button named `AI 选课助手` while closed.

- [ ] **Step 1: Write the failing test**

Create `tests/components/assistant-panel.test.tsx`:

```tsx
import type { ComponentType, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type SidebarProps = {
  open: boolean;
  width: string;
  header: ComponentType;
  toggleButton: ComponentType;
  welcomeScreen?: ComponentType<{ input: ReactNode; suggestionView: ReactNode }>;
  input: { addMenuButton: ComponentType; disclaimer: ComponentType; showDisclaimer: boolean };
};

const { sidebarSpy, providerSpy, suggestionsSpy } = vi.hoisted(() => ({
  sidebarSpy: vi.fn(),
  providerSpy: vi.fn(),
  suggestionsSpy: vi.fn(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: (props: { children: ReactNode; enableInspector?: boolean }) => {
    providerSpy(props);
    return <>{props.children}</>;
  },
  CopilotSidebar: (props: SidebarProps) => {
    sidebarSpy(props);
    const Header = props.header;
    return (
      <div data-testid="copilot-sidebar" data-open={String(props.open)}>
        <Header />
      </div>
    );
  },
  useAgentContext: () => {},
  useFrontendTool: () => {},
  useConfigureSuggestions: suggestionsSpy,
}));
vi.mock("@/lib/timetable/catalog-client", () => ({ getSections: vi.fn() }));

import AssistantPanel from "@/components/assistant/assistant-panel";

const lastSidebarProps = () => sidebarSpy.mock.lastCall![0] as SidebarProps;

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantPanel", () => {
  it("hides on the header close button and comes back from the reopen pill", () => {
    render(<AssistantPanel plan={undefined} />);
    const sidebar = screen.getByTestId("copilot-sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.getByText("AI 选课助手")).toBeTruthy();
    expect(screen.getByText("试点")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 选课助手" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "AI 选课助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.queryByRole("button", { name: "AI 选课助手" })).toBeNull();
  });

  it("removes CopilotKit's floating toggle, attach button, and dev inspector", () => {
    render(<AssistantPanel plan={undefined} />);
    const { toggleButton: Toggle, input } = lastSidebarProps();
    const AddMenu = input.addMenuButton;
    expect(render(<Toggle />).container.innerHTML).toBe("");
    expect(render(<AddMenu />).container.innerHTML).toBe("");
    expect(providerSpy.mock.lastCall![0].enableInspector).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/assistant-panel.test.tsx`
Expected: FAIL. The first test cannot find the button named `收起助手` (the current panel has no custom header), and `lastSidebarProps().header` is undefined, so rendering `<Header />` throws.

- [ ] **Step 3: Create the shared pill class**

Create `components/assistant/launcher-pill.ts`:

```ts
export const ASSISTANT_PILL_CLASS =
  "fixed bottom-6 right-6 z-40 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-lg";
```

- [ ] **Step 4: Use it in the launcher**

In `components/assistant/assistant-launcher.tsx`, add the import after the `LocalPlan` type import:

```tsx
import { ASSISTANT_PILL_CLASS } from "./launcher-pill";
```

and replace the button's `className`:

```tsx
    <button
      type="button"
      onClick={() => setOpened(true)}
      className={ASSISTANT_PILL_CLASS}
    >
      AI 选课助手
    </button>
```

- [ ] **Step 5: Rewrite the panel with controlled open state and the new header**

Replace `components/assistant/assistant-panel.tsx` with:

```tsx
"use client";

import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import { getSections } from "@/lib/timetable/catalog-client";
import type { LocalPlan } from "@/lib/timetable/store";
import { cn } from "@/lib/utils";

import { ASSISTANT_PILL_CLASS } from "./launcher-pill";

// Unmodified copy of @copilotkit/react-core/dist/v2/index.css (Tailwind v4 output). next.config.js stubs the
// package's own import because the app's Tailwind 3 PostCSS plugin rejects it.
const COPILOTKIT_STYLES_HREF = "/assistant/copilotkit-v2.css";
const COPILOTKIT_THEME_HREF = "/assistant/copilotkit-theme.css";
const PRE_ENROLMENT_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/pre-enrolment/";
const ADD_DROP_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/course-add-drop/";
const DATA_UPDATED_AT = process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE ?? "未知";

const NoticeContext = createContext<string | null>(null);
const CloseContext = createContext<() => void>(() => {});

function Hidden() {
  return null;
}

function PanelHeader() {
  const close = useContext(CloseContext);
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="truncate text-sm font-semibold text-foreground">AI 选课助手</h2>
      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
        试点
      </span>
      <button
        type="button"
        aria-label="收起助手"
        onClick={close}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={16} aria-hidden />
      </button>
    </header>
  );
}

function BoundaryNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const notice = useContext(NoticeContext);
  return (
    <div {...props} className={cn("space-y-1 px-3 pb-2 text-xs text-muted-foreground", className)}>
      {notice ? (
        <p role="alert" className="font-medium text-destructive-strong">
          {notice}
        </p>
      ) : null}
      <p>
        本站不是 myUM。选课请自己到官方系统提交：
        <a className="underline" href={PRE_ENROLMENT_URL} target="_blank" rel="noreferrer">
          Pre-Enrolment
        </a>
        {" / "}
        <a className="underline" href={ADD_DROP_URL} target="_blank" rel="noreferrer">
          Course Add/Drop
        </a>
      </p>
      <p>课表数据更新于 {DATA_UPDATED_AT}</p>
    </div>
  );
}

function AssistantTools({ plan }: { plan: LocalPlan | undefined }) {
  const planRef = useRef(plan);
  planRef.current = plan;

  useAgentContext({ description: "学生当前激活的课表方案（只读）", value: summarizePlan(plan) });

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description: "检查某门课某位教授的某个 section 是否与学生当前课表时间冲突。只读，不会修改课表。",
      parameters: checkPlanConflictsParameters,
      handler: async (input) =>
        runCheckPlanConflicts(planRef.current?.payload.sections ?? [], input, getSections),
    },
    [],
  );

  return null;
}

export default function AssistantPanel({ plan }: { plan: LocalPlan | undefined }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <link rel="stylesheet" href={COPILOTKIT_STYLES_HREF} />
      <link rel="stylesheet" href={COPILOTKIT_THEME_HREF} />
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        enableInspector={false}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools plan={plan} />
        <CloseContext.Provider value={close}>
          <NoticeContext.Provider value={notice}>
            <CopilotSidebar
              open={open}
              onOpenChange={setOpen}
              width="clamp(300px, 28vw, 360px)"
              header={PanelHeader}
              toggleButton={Hidden}
              labels={{
                welcomeMessageText:
                  "可以问课程、教授、评价、section 时间，或某个 section 会不会和你的课表冲突。助手只读，不会改动课表；单次对话最多 30 轮。",
              }}
              input={{ disclaimer: BoundaryNotice, showDisclaimer: true, addMenuButton: Hidden }}
            />
          </NoticeContext.Provider>
        </CloseContext.Provider>
      </CopilotKitProvider>
      {open ? null : (
        <button type="button" onClick={() => setOpen(true)} className={ASSISTANT_PILL_CLASS}>
          AI 选课助手
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the panel and launcher tests**

Run: `npx vitest run tests/components/assistant-panel.test.tsx tests/components/assistant-launcher.test.tsx`
Expected: PASS (2 panel tests, 5 launcher tests).

- [ ] **Step 7: Lint and type-check the touched files**

Run: `npx eslint components/assistant --max-warnings=0 && npx tsc --noEmit 2>&1 | rg "components/assistant|lib/assistant"`
Expected: eslint prints nothing. `rg` prints nothing, meaning no type errors in assistant files. If `rg` exits 1 with no output, that is the success case.

- [ ] **Step 8: Commit**

```bash
git add components/assistant/launcher-pill.ts components/assistant/assistant-launcher.tsx components/assistant/assistant-panel.tsx tests/components/assistant-panel.test.tsx
git commit -m "feat(assistant): add header close button and reopen pill"
```

---

### Task 5: Welcome screen, example questions, compact disclaimer, and resize wiring

**Files:**
- Modify: `components/assistant/assistant-panel.tsx` (full file below)
- Test: `tests/components/assistant-panel.test.tsx` (add tests)

**Interfaces:**
- Consumes: Task 2 `PANEL_WIDTH_DEFAULT`; Task 3 `ResizeHandle` (default export) and `PANEL_WIDTH_VAR`; Task 4 `ASSISTANT_PILL_CLASS`, `CloseContext`, `PanelHeader`, `Hidden`
- Produces: the final `AssistantPanel`. The `CopilotSidebar` gets `width="var(--assistant-width, 380px)"`, `welcomeScreen={WelcomeScreen}`, and no `labels`. `useConfigureSuggestions` is called with `EXAMPLE_SUGGESTIONS`.

- [ ] **Step 1: Add the failing tests**

Append these tests inside the `describe("AssistantPanel", ...)` block in `tests/components/assistant-panel.test.tsx`:

```tsx
  it("offers the three example questions before the first message", () => {
    render(<AssistantPanel plan={undefined} />);
    const questions = [
      "有哪些和 accounting 相关的课？",
      "ACCT1000 是什么课？几个学分？",
      "ACCT1000 有哪些 section？什么时间上课？",
    ];
    expect(suggestionsSpy).toHaveBeenCalledWith({
      available: "before-first-message",
      suggestions: questions.map((question) => ({ title: question, message: question })),
    });
  });

  it("sizes the sidebar from the resizable width variable", () => {
    render(<AssistantPanel plan={undefined} />);
    expect(lastSidebarProps().width).toBe("var(--assistant-width, 380px)");
    expect(document.documentElement.style.getPropertyValue("--assistant-width")).toBe("380px");
    expect(screen.getByRole("separator", { name: "调整助手宽度" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("shows the intro and example chips above the input on the welcome screen", () => {
    render(<AssistantPanel plan={undefined} />);
    const Welcome = lastSidebarProps().welcomeScreen!;
    render(
      <Welcome
        input={<div data-testid="input" />}
        suggestionView={<div data-testid="chips" />}
      />,
    );
    expect(screen.getByText(/可以问课程、教授、评价和 section 时间/)).toBeTruthy();
    expect(screen.getByText("只读，不会改动课表 · 单次对话最多 30 轮")).toBeTruthy();
    expect(screen.getByTestId("chips")).toBeTruthy();
    expect(screen.getByTestId("input")).toBeTruthy();
  });

  it("renders the disclaimer as one compact line with both official links", () => {
    render(<AssistantPanel plan={undefined} />);
    const Disclaimer = lastSidebarProps().input.disclaimer;
    const { container } = render(<Disclaimer />);
    expect(container.textContent).toMatch(/^本站不是 myUM · Pre-Enrolment · Add\/Drop · 数据更新于 /);
    expect(screen.getByRole("link", { name: "Pre-Enrolment" }).getAttribute("href")).toContain(
      "pre-enrolment",
    );
    expect(screen.getByRole("link", { name: "Add/Drop" }).getAttribute("href")).toContain(
      "course-add-drop",
    );
  });
```

Also add this cleanup line to the existing `afterEach` (after `vi.clearAllMocks();`) so the CSS variable does not leak between tests:

```tsx
  document.documentElement.style.removeProperty("--assistant-width");
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/components/assistant-panel.test.tsx`
Expected: the 2 Task 4 tests pass. The 4 new tests fail: `suggestionsSpy` was never called, `width` is the old `clamp(...)` string, `welcomeScreen` is undefined, and the disclaimer text doesn't match.

- [ ] **Step 3: Write the final panel**

Replace `components/assistant/assistant-panel.tsx` with:

```tsx
"use client";

import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { PANEL_WIDTH_DEFAULT } from "@/lib/assistant/panel-width";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import { getSections } from "@/lib/timetable/catalog-client";
import type { LocalPlan } from "@/lib/timetable/store";
import { cn } from "@/lib/utils";

import { ASSISTANT_PILL_CLASS } from "./launcher-pill";
import ResizeHandle, { PANEL_WIDTH_VAR } from "./resize-handle";

// Unmodified copy of @copilotkit/react-core/dist/v2/index.css (Tailwind v4 output). next.config.js stubs the
// package's own import because the app's Tailwind 3 PostCSS plugin rejects it.
const COPILOTKIT_STYLES_HREF = "/assistant/copilotkit-v2.css";
const COPILOTKIT_THEME_HREF = "/assistant/copilotkit-theme.css";
const PRE_ENROLMENT_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/pre-enrolment/";
const ADD_DROP_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/course-add-drop/";
const DATA_UPDATED_AT = process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE ?? "未知";

// CopilotSidebar remounts its whole view whenever `width` changes, so the value stays constant
// and ResizeHandle moves the CSS variable instead.
const SIDEBAR_WIDTH = `var(${PANEL_WIDTH_VAR}, ${PANEL_WIDTH_DEFAULT}px)`;

const EXAMPLE_QUESTIONS = [
  "有哪些和 accounting 相关的课？",
  "ACCT1000 是什么课？几个学分？",
  "ACCT1000 有哪些 section？什么时间上课？",
];
const EXAMPLE_SUGGESTIONS = {
  available: "before-first-message" as const,
  suggestions: EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question })),
};

const NoticeContext = createContext<string | null>(null);
const CloseContext = createContext<() => void>(() => {});

function Hidden() {
  return null;
}

function PanelHeader() {
  const close = useContext(CloseContext);
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="truncate text-sm font-semibold text-foreground">AI 选课助手</h2>
      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
        试点
      </span>
      <button
        type="button"
        aria-label="收起助手"
        onClick={close}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={16} aria-hidden />
      </button>
    </header>
  );
}

function WelcomeScreen({ input, suggestionView }: { input: ReactNode; suggestionView: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-6">
        <p className="text-sm leading-relaxed text-foreground">
          可以问课程、教授、评价和 section 时间，也能检查某个 section 会不会和你的课表冲突。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">只读，不会改动课表 · 单次对话最多 30 轮</p>
        <div className="mt-4">{suggestionView}</div>
      </div>
      {input}
    </div>
  );
}

function BoundaryNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const notice = useContext(NoticeContext);
  return (
    <div
      {...props}
      className={cn("space-y-1 px-4 pb-2 pt-1.5 text-[11px] leading-snug text-muted-foreground", className)}
    >
      {notice ? (
        <p role="alert" className="text-xs font-medium text-destructive-strong">
          {notice}
        </p>
      ) : null}
      <p>
        本站不是 myUM ·{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={PRE_ENROLMENT_URL} target="_blank" rel="noreferrer">
          Pre-Enrolment
        </a>
        {" · "}
        <a className="underline underline-offset-2 hover:text-foreground" href={ADD_DROP_URL} target="_blank" rel="noreferrer">
          Add/Drop
        </a>
        {" · "}数据更新于 {DATA_UPDATED_AT}
      </p>
    </div>
  );
}

function AssistantTools({ plan }: { plan: LocalPlan | undefined }) {
  const planRef = useRef(plan);
  planRef.current = plan;

  useAgentContext({ description: "学生当前激活的课表方案（只读）", value: summarizePlan(plan) });
  useConfigureSuggestions(EXAMPLE_SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description: "检查某门课某位教授的某个 section 是否与学生当前课表时间冲突。只读，不会修改课表。",
      parameters: checkPlanConflictsParameters,
      handler: async (input) =>
        runCheckPlanConflicts(planRef.current?.payload.sections ?? [], input, getSections),
    },
    [],
  );

  return null;
}

export default function AssistantPanel({ plan }: { plan: LocalPlan | undefined }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <link rel="stylesheet" href={COPILOTKIT_STYLES_HREF} />
      <link rel="stylesheet" href={COPILOTKIT_THEME_HREF} />
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        enableInspector={false}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools plan={plan} />
        <CloseContext.Provider value={close}>
          <NoticeContext.Provider value={notice}>
            <CopilotSidebar
              open={open}
              onOpenChange={setOpen}
              width={SIDEBAR_WIDTH}
              header={PanelHeader}
              toggleButton={Hidden}
              welcomeScreen={WelcomeScreen}
              input={{ disclaimer: BoundaryNotice, showDisclaimer: true, addMenuButton: Hidden }}
            />
          </NoticeContext.Provider>
        </CloseContext.Provider>
      </CopilotKitProvider>
      <ResizeHandle visible={open} />
      {open ? null : (
        <button type="button" onClick={() => setOpen(true)} className={ASSISTANT_PILL_CLASS}>
          AI 选课助手
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the panel tests**

Run: `npx vitest run tests/components/assistant-panel.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint and type-check**

Run: `npx eslint components/assistant lib/assistant --max-warnings=0 && npx tsc --noEmit 2>&1 | rg "components/assistant|lib/assistant"`
Expected: eslint prints nothing, and `rg` prints nothing.
If `tsc` reports that `WelcomeScreen` is not assignable to the `welcomeScreen` slot, change its parameter type to `React.HTMLAttributes<HTMLDivElement> & { input: ReactElement; suggestionView: ReactElement }`, importing `type ReactElement` from `react` (this matches CopilotKit's `WelcomeScreenProps`), and re-run.

- [ ] **Step 6: Commit**

```bash
git add components/assistant/assistant-panel.tsx tests/components/assistant-panel.test.tsx
git commit -m "feat(assistant): welcome examples, compact disclaimer, resizable width"
```

---

### Task 6: Layout CSS for the input and example chips

**Files:**
- Modify: `public/assistant/copilotkit-theme.css` (insert after the `[data-copilotkit] .copilotKitInput textarea::placeholder` rule, before the send-button rules)
- Test: `tests/assistant/theme-sync.test.ts` (add one test)

**Interfaces:**
- Consumes: CopilotKit's input wrapper class `cpk:[div[data-sidebar-chat]_&]:px-8` (sets 32px side padding inside the sidebar) and the suggestion container `[data-testid="copilot-suggestions"]` (gets `lg:ml-4 lg:mr-4` from CopilotKit, which would indent the chips relative to the intro)
- Produces: a 12px input side padding and flush chips inside `div[data-sidebar-chat]`

- [ ] **Step 1: Write the failing test**

Add inside `describe("assistant theme sync", ...)` in `tests/assistant/theme-sync.test.ts`:

```ts
  it("widens the sidebar input and keeps example chips flush with the intro", () => {
    const css = readFileSync(themePath, "utf8");
    expect(css).toMatch(
      /div\[data-sidebar-chat\] \.cpk\\:\\\[div\\\[data-sidebar-chat\\\]_\\&\\\]\\:px-8 \{\s*padding-inline: 0\.75rem !important;/,
    );
    expect(css).toMatch(
      /div\[data-sidebar-chat\] \[data-testid="copilot-suggestions"\] \{\s*margin-inline: 0 !important;\s*padding-inline: 0 !important;/,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assistant/theme-sync.test.ts`
Expected: FAIL on the new test (pattern not found). The other 5 pass.

- [ ] **Step 3: Add the CSS**

In `public/assistant/copilotkit-theme.css`, after this existing rule:

```css
[data-copilotkit] [data-testid="copilot-chat-input"] textarea::placeholder,
[data-copilotkit] .copilotKitInput textarea::placeholder {
  color: hsl(var(--muted-foreground)) !important;
}
```

insert:

```css
div[data-sidebar-chat] .cpk\:\[div\[data-sidebar-chat\]_\&\]\:px-8 {
  padding-inline: 0.75rem !important;
}

div[data-sidebar-chat] [data-testid="copilot-suggestions"] {
  margin-inline: 0 !important;
  padding-inline: 0 !important;
}
```

The first selector is copied character for character from `public/assistant/copilotkit-v2.css` (search for `data-sidebar-chat\]_\&`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/assistant/theme-sync.test.ts tests/assistant/dependency-contract.test.ts`
Expected: PASS (6 theme-sync tests, 3 dependency-contract tests).

- [ ] **Step 5: Commit**

```bash
git add public/assistant/copilotkit-theme.css tests/assistant/theme-sync.test.ts
git commit -m "style(assistant): full-width sidebar input and flush example chips"
```

---

### Task 7: Full verification and browser check

**Files:** none changed unless a check fails.

**Interfaces:**
- Consumes: everything above
- Produces: evidence that the feature works. Report the results, including anything that failed.

- [ ] **Step 1: Run the related test suites**

Run: `npx vitest run tests/assistant/ tests/components/assistant-panel.test.tsx tests/components/assistant-resize-handle.test.tsx tests/components/assistant-launcher.test.tsx tests/theme- tests/skin-`
Expected: all pass.

- [ ] **Step 2: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: both exit 0. If an unrelated test was already failing before Task 1, note it in the report rather than fixing it.

- [ ] **Step 3: Browser check**

Start the dev server (`npm run dev`), sign in as an account with assistant access, open `/timetable`, and open the assistant. Check at a 1024px-wide window and at about 1440px, in light, dark, and the Island skin:

1. The header is one row: `AI 选课助手`, the `试点` badge, and an X on the right. No kite icon, and no round floating button at the bottom-right.
2. The empty state shows the left-aligned intro and the three example chips, with the chips' left edge aligned with the intro text. Clicking a chip sends that question.
3. The input is one row at rest, with the send button inside on the right, no "+" button, and about 12px from the panel edges. Inspect the grid inside `[data-testid="copilot-chat-input"]`: it should have `data-layout="compact"` while empty. If it shows `expanded` with an empty value, stop and report it with a screenshot (use superpowers:systematic-debugging). Do not force it with CSS.
4. The disclaimer is one muted line (two at most at the 320px width) with working links.
5. Hovering the panel's left edge shows the brand-colored line. Dragging resizes smoothly with no lag in the page margin, and stops at 320px and at the max (544px at 1024px wide). Releasing and reloading keeps the width. Double-clicking resets it to 380. Tabbing to the handle and pressing ArrowLeft/ArrowRight changes the width.
6. The X slides the panel away, the timetable gets its full width back, and the `AI 选课助手` pill appears bottom-right. Clicking the pill brings back the panel with the conversation intact.
7. Below 768px wide, the chat is full-screen and no resize handle shows.

- [ ] **Step 4: Report**

Summarize which checks passed, with screenshots of light and dark at 1024px. List any failures and what you observed. Don't claim success for a check you couldn't run.
