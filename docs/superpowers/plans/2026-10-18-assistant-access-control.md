# Assistant Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Clerk `aiPilot` gate on the AI assistant with a runtime mode (`off` | `testers` | `everyone`) stored in Supabase, a tester email list, and a platform-admin page to control both.

**Architecture:** `lib/assistant/access.ts` decides access: it reads `app_config.ai_assistant_access` (cached, tag-busted on write), and in `testers` mode allows admins (existing `admin-auth` logic, extracted into `resolveAdminSession`) or users whose verified Clerk email is in `assistant_testers`. The CopilotKit route enforces it; a new `GET /api/assistant/access` tells the launcher whether to show its button. Platform admins flip the mode through the existing `POST /api/admin/app-config` and manage testers through new `/api/admin/assistant-testers` routes, both from a new `/admin/assistant` page.

**Tech Stack:** Next.js 15 App Router, Clerk (`@clerk/nextjs`), Supabase (service role), zod 3.25, Vitest + Testing Library (jsdom for `tests/components/**`).

**Spec:** `docs/superpowers/specs/2026-10-18-assistant-access-control-design.md`

## Global Constraints

- Branch `feat/ai-timetable-agent`, main checkout `/Users/thomaswu/workspace/next-web` (no worktree).
- Node 22: prefix commands with `source ~/.nvm/nvm.sh && nvm use 22 &&`.
- Mode values are exactly `off`, `testers`, `everyone`. Default `off`. Anything unknown parses to `off`.
- UI labels are exactly: `Off`, `Admins & testers`, `Everyone`.
- Every access failure (Supabase error, Clerk error, missing column, malformed response) denies access. Nothing fails open.
- "Admin" means `PLATFORM_ADMIN_USER_IDS`, `PLATFORM_ADMIN_EMAILS`, or an active `admin_users` row, resolved only through `resolveAdminSession`.
- Testers match on the verified primary email from `getDirectoryUser`, lowercased. Tester cap is 200.
- Mode and tester admin endpoints are platform-admin only (`requireAdmin({ platformOnly: true })`).
- The mode is read with a dedicated query selecting only `ai_assistant_access`. Do not add it to `readAppConfig`, `mapAppConfigRow`, or `AppConfig`.
- Bundle (V1 spec G5), against the baseline in `docs/superpowers/verification/2026-10-18-assistant-v1.md` §1: non-`/timetable` routes ≤ baseline + 1 kB (`/` ≤ 176 kB, `/course/[code]` ≤ 133 kB), `First Load JS shared by all` = 103 kB, `/timetable` ≤ 205 kB. If exceeded, stop and report; do not relax.
- No `any` in new files (tests included). Tests mirror source paths: `lib/assistant/*` → `tests/assistant/*`, API routes and server pages → `tests/api/*`, components → `tests/components/*`, SQL → `tests/database/*`.
- Do not change `lib/privacy-policy.ts`.
- Each task ends with its own tests passing plus `npx tsc --noEmit`. Tasks 5 and 8 also run `npm run test`, `npm run lint`, and `npm run build`.

---

## File Structure

Create:

| File | Responsibility |
|---|---|
| `lib/assistant/access-mode.ts` | Client-safe mode list, type, parser, tester cap |
| `lib/assistant/access.ts` | Server-only mode read (cached + uncached) and `canUseAssistant` |
| `supabase/migrations/20261018_assistant_access.sql` | Mode column + `assistant_testers` table |
| `app/api/assistant/access/route.ts` | `GET` → `{ enabled }` for the launcher |
| `app/api/admin/assistant-testers/route.ts` | `GET` list, `POST` add |
| `app/api/admin/assistant-testers/[email]/route.ts` | `DELETE` remove |
| `app/admin/assistant/page.tsx` | Platform-admin guard + initial mode |
| `components/admin/assistant-access-client.tsx` | Mode selector + tester list UI |
| `tests/assistant/access-mode.test.ts`, `tests/assistant/access.test.ts`, `tests/database/assistant-access-sql.test.ts`, `tests/api/assistant-access.test.ts`, `tests/api/admin/assistant-testers.test.ts`, `tests/api/admin/assistant-page.test.ts`, `tests/components/assistant-access-client.test.tsx` | Tests |

Modify:

| File | Change |
|---|---|
| `lib/admin-auth.ts` | Extract `resolveAdminSession(userId)` |
| `app/api/copilotkit/[[...slug]]/route.ts` | `isAssistantPilot` → `canUseAssistant` |
| `components/assistant/assistant-launcher.tsx` | Ask `/api/assistant/access` instead of reading metadata |
| `lib/validation/admin.ts` | `ai_assistant_access` in `appConfigUpdateSchema`; `assistantTesterSchema` |
| `lib/admin-audit.ts` | Two new audit actions |
| `components/admin/admin-nav.tsx` | `AI Assistant` tab |
| `supabase/schema.sql` | Mirror the migration |
| Tests: `tests/admin-auth.test.ts`, `tests/api/copilotkit.test.ts`, `tests/components/assistant-launcher.test.tsx`, `tests/api/admin/app-config.test.ts`, `tests/components/admin-nav.test.tsx` | Updated |
| Docs: V1 spec, V1 plan Tasks 10–11, V1 verification doc | Replace Clerk steps |

Delete: `lib/assistant/pilot.ts`, `tests/assistant/pilot.test.ts`.

---

### Task 1: Mode module and database migration

**Files:**
- Create: `lib/assistant/access-mode.ts`
- Create: `supabase/migrations/20261018_assistant_access.sql`
- Modify: `supabase/schema.sql` (append at end of file)
- Test: `tests/assistant/access-mode.test.ts`, `tests/database/assistant-access-sql.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ASSISTANT_ACCESS_MODES: readonly ["off", "testers", "everyone"]`
  - `type AssistantAccess = "off" | "testers" | "everyone"`
  - `MAX_ASSISTANT_TESTERS = 200`
  - `parseAssistantAccess(value: unknown): AssistantAccess`
  - DB: `app_config.ai_assistant_access text not null default 'off'`; table `public.assistant_testers(email text primary key, added_by text not null, created_at timestamptz not null default now())`.

- [ ] **Step 1: Write the failing tests**

`tests/assistant/access-mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ASSISTANT_ACCESS_MODES,
  MAX_ASSISTANT_TESTERS,
  parseAssistantAccess,
} from "@/lib/assistant/access-mode";

describe("parseAssistantAccess", () => {
  it.each([
    ["off", "off"],
    ["testers", "testers"],
    ["everyone", "everyone"],
    ["admins", "off"],
    ["EVERYONE", "off"],
    ["", "off"],
    [null, "off"],
    [undefined, "off"],
    [1, "off"],
  ])("%j -> %s", (input, expected) => {
    expect(parseAssistantAccess(input)).toBe(expected);
  });
});

describe("access mode constants", () => {
  it("lists modes in display order", () => {
    expect(ASSISTANT_ACCESS_MODES).toEqual(["off", "testers", "everyone"]);
  });

  it("caps the tester list at 200", () => {
    expect(MAX_ASSISTANT_TESTERS).toBe(200);
  });
});
```

`tests/database/assistant-access-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261018_assistant_access.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("assistant access migration", () => {
  it("adds the mode column defaulting to off", () => {
    expect(migration).toContain("alter table public.app_config");
    expect(migration).toContain("add column if not exists ai_assistant_access text not null default 'off'");
    expect(migration).toContain("check (ai_assistant_access in ('off', 'testers', 'everyone'))");
  });

  it("creates the tester table with lowercase emails", () => {
    expect(migration).toContain("create table if not exists public.assistant_testers");
    expect(migration).toContain("email text primary key check (email = lower(email) and position('@' in email) > 1)");
    expect(migration).toContain("added_by text not null");
  });

  it("locks the tester table to service_role", () => {
    expect(migration).toContain("alter table public.assistant_testers enable row level security");
    expect(migration).toContain("revoke all on public.assistant_testers from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, delete on public.assistant_testers to service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("ai_assistant_access");
    expect(snapshot).toContain("create table if not exists public.assistant_testers");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/assistant/access-mode.test.ts tests/database/assistant-access-sql.test.ts`
Expected: FAIL — cannot resolve `@/lib/assistant/access-mode`; `ENOENT` for the migration file.

- [ ] **Step 3: Implement**

`lib/assistant/access-mode.ts`:

```ts
export const ASSISTANT_ACCESS_MODES = ["off", "testers", "everyone"] as const;

export type AssistantAccess = (typeof ASSISTANT_ACCESS_MODES)[number];

export const MAX_ASSISTANT_TESTERS = 200;

export function parseAssistantAccess(value: unknown): AssistantAccess {
  return ASSISTANT_ACCESS_MODES.find((mode) => mode === value) ?? "off";
}
```

`supabase/migrations/20261018_assistant_access.sql`:

```sql
begin;

alter table public.app_config
  add column if not exists ai_assistant_access text not null default 'off'
  check (ai_assistant_access in ('off', 'testers', 'everyone'));

create table if not exists public.assistant_testers (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  added_by text not null,
  created_at timestamptz not null default now()
);

alter table public.assistant_testers enable row level security;

revoke all on public.assistant_testers from public, anon, authenticated;
grant select, insert, delete on public.assistant_testers to service_role;

notify pgrst, 'reload schema';

commit;
```

Append to the end of `supabase/schema.sql` (after the final existing `notify pgrst, 'reload schema';` line, keeping one blank line before):

```sql

--
-- Assistant access control (migration: 20261018_assistant_access.sql)
--

alter table public.app_config
  add column if not exists ai_assistant_access text not null default 'off'
  check (ai_assistant_access in ('off', 'testers', 'everyone'));

create table if not exists public.assistant_testers (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  added_by text not null,
  created_at timestamptz not null default now()
);

alter table public.assistant_testers enable row level security;

revoke all on public.assistant_testers from public, anon, authenticated;
grant select, insert, delete on public.assistant_testers to service_role;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/assistant/access-mode.test.ts tests/database/assistant-access-sql.test.ts tests/database/app-config-sql.test.ts && npx tsc --noEmit`
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/access-mode.ts supabase/migrations/20261018_assistant_access.sql supabase/schema.sql tests/assistant/access-mode.test.ts tests/database/assistant-access-sql.test.ts
git commit -m "feat(assistant): access mode parser and access-control migration"
```

---

### Task 2: Extract `resolveAdminSession`

**Files:**
- Modify: `lib/admin-auth.ts:43-79` (`getCurrentAdmin`)
- Test: `tests/admin-auth.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type AdminResolution = { ok: true; session: AdminSession | null } | { ok: false }`
  - `resolveAdminSession(userId: string): Promise<AdminResolution>` — `session: null` means "not an admin"; `ok: false` means the lookup failed.
  - `getCurrentAdmin()` and `requireAdmin()` keep their exact current signatures and responses (401 / 403 / 500).

- [ ] **Step 1: Write the failing tests**

In `tests/admin-auth.test.ts`, add `resolveAdminSession` to the import list:

```ts
import {
  getCurrentAdmin,
  getPlatformAdminEmails,
  getPlatformAdminIds,
  requireAdmin,
  resolveAdminSession,
} from "@/lib/admin-auth";
```

Append inside the existing `describe("admin auth", ...)` block, after the last `it`:

```ts
  it("returns 500 when the db lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ userId: "user_db_down" });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });

    const result = await getCurrentAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  describe("resolveAdminSession", () => {
    it("resolves an env platform admin without Clerk or the db", async () => {
      process.env.PLATFORM_ADMIN_USER_IDS = "user_platform";

      await expect(resolveAdminSession("user_platform")).resolves.toEqual({
        ok: true,
        session: { userId: "user_platform", isPlatformAdmin: true },
      });
      expect(getDirectoryUsers).not.toHaveBeenCalled();
      expect(maybeSingle).not.toHaveBeenCalled();
    });

    it("resolves an active db admin", async () => {
      maybeSingle.mockResolvedValue({ data: { clerk_user_id: "user_db", active: true }, error: null });

      await expect(resolveAdminSession("user_db")).resolves.toEqual({
        ok: true,
        session: { userId: "user_db", isPlatformAdmin: false },
      });
    });

    it("returns a null session for non-admins and inactive admins", async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(resolveAdminSession("user_plain")).resolves.toEqual({ ok: true, session: null });

      maybeSingle.mockResolvedValueOnce({ data: { clerk_user_id: "user_old", active: false }, error: null });
      await expect(resolveAdminSession("user_old")).resolves.toEqual({ ok: true, session: null });
    });

    it("reports a db failure as not ok", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });

      await expect(resolveAdminSession("user_x")).resolves.toEqual({ ok: false });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/admin-auth.test.ts`
Expected: FAIL — `resolveAdminSession is not a function` (the new 500 test passes already; that is fine).

- [ ] **Step 3: Implement**

In `lib/admin-auth.ts`, replace the whole `getCurrentAdmin` function (lines 43–79) with:

```ts
export type AdminResolution = { ok: true; session: AdminSession | null } | { ok: false };

export async function resolveAdminSession(userId: string): Promise<AdminResolution> {
  if (getPlatformAdminIds().has(userId)) {
    return { ok: true, session: { userId, isPlatformAdmin: true } };
  }

  const platformEmails = getPlatformAdminEmails();
  if (platformEmails.size > 0) {
    const email = await getClerkUserEmail(userId);
    if (email && platformEmails.has(email)) {
      return { ok: true, session: { userId, isPlatformAdmin: true } };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("clerk_user_id, active")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[admin-auth] failed to load admin user:", error.message);
    return { ok: false };
  }

  if (!data || data.active !== true) return { ok: true, session: null };

  return { ok: true, session: { userId, isPlatformAdmin: false } };
}

export async function getCurrentAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: ReturnType<typeof apiError> }
> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, response: apiError("unauthorized", "Sign in required", 401) };
  }

  const resolved = await resolveAdminSession(userId);
  if (!resolved.ok) {
    return { ok: false, response: apiError("internal_error", "Unable to verify admin access", 500) };
  }
  if (!resolved.session) {
    return { ok: false, response: apiError("forbidden", "Admin access required", 403) };
  }

  return { ok: true, session: resolved.session };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/admin-auth.test.ts tests/api/admin && npx tsc --noEmit`
Expected: PASS (all existing admin route tests still pass), tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-auth.ts tests/admin-auth.test.ts
git commit -m "refactor(admin-auth): extract resolveAdminSession"
```

---

### Task 3: `canUseAssistant`

**Files:**
- Create: `lib/assistant/access.ts`
- Test: `tests/assistant/access.test.ts`

**Interfaces:**
- Consumes: `parseAssistantAccess`, `AssistantAccess` (Task 1); `resolveAdminSession` (Task 2); `getDirectoryUser(userId): Promise<ClerkDirectoryUser | null>` from `lib/clerk/user-directory.ts` (existing; `primaryEmail` is verified-only and lowercased, `null` otherwise; swallows Clerk errors and returns `null`); `CACHE_TAGS.appConfig` (`"app-config"`).
- Produces:
  - `readAssistantAccess(): Promise<AssistantAccess>` — uncached, never throws, `"off"` on any failure.
  - `getAssistantAccess(): Promise<AssistantAccess>` — `unstable_cache` wrapper, tag `app-config`, `revalidate: 300`.
  - `canUseAssistant(userId: string | null): Promise<boolean>` — never throws.

- [ ] **Step 1: Write the failing test**

`tests/assistant/access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: Record<string, unknown> | null; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  resolveAdminSession: vi.fn(),
  getDirectoryUser: vi.fn(),
  modeResult: vi.fn<() => Promise<QueryResult>>(),
  testerResult: vi.fn<() => Promise<QueryResult>>(),
  from: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("@/lib/admin-auth", () => ({ resolveAdminSession: mocks.resolveAdminSession }));
vi.mock("@/lib/clerk/user-directory", () => ({ getDirectoryUser: mocks.getDirectoryUser }));
vi.mock("@/lib/supabase/admin", () => ({ default: { from: mocks.from } }));

import { canUseAssistant, readAssistantAccess } from "@/lib/assistant/access";

function table(name: string) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      mocks.eq(name, column, value);
      return chain;
    },
    maybeSingle: name === "app_config" ? mocks.modeResult : mocks.testerResult,
  };
  return chain;
}

const setMode = (mode: unknown) =>
  mocks.modeResult.mockResolvedValue({ data: { ai_assistant_access: mode }, error: null });
const queriedTesters = () => mocks.from.mock.calls.some(([name]) => name === "assistant_testers");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.from.mockImplementation(table);
  mocks.resolveAdminSession.mockResolvedValue({ ok: true, session: null });
  mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: "tester@um.edu.mo" });
  mocks.testerResult.mockResolvedValue({ data: null, error: null });
  setMode("testers");
});

describe("readAssistantAccess", () => {
  it("reads only the mode column of the single config row", async () => {
    setMode("everyone");
    await expect(readAssistantAccess()).resolves.toBe("everyone");
    expect(mocks.eq).toHaveBeenCalledWith("app_config", "id", 1);
  });

  it("treats an unknown value as off", async () => {
    setMode("admins");
    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("fails closed when the read errors (for example before the migration)", async () => {
    mocks.modeResult.mockResolvedValue({ data: null, error: { message: "column does not exist" } });
    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("fails closed when the client throws", async () => {
    mocks.modeResult.mockRejectedValue(new Error("network"));
    await expect(readAssistantAccess()).resolves.toBe("off");
  });
});

describe("canUseAssistant", () => {
  it("denies signed-out users without reading anything", async () => {
    await expect(canUseAssistant(null)).resolves.toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("denies everyone when off, without admin or tester lookups", async () => {
    setMode("off");
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("allows any signed-in user when everyone, without admin or tester lookups", async () => {
    setMode("everyone");
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("allows admins in testers mode without a tester lookup", async () => {
    mocks.resolveAdminSession.mockResolvedValue({
      ok: true,
      session: { userId: "user_1", isPlatformAdmin: false },
    });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.resolveAdminSession).toHaveBeenCalledWith("user_1");
    expect(queriedTesters()).toBe(false);
  });

  it("allows a listed tester by verified email", async () => {
    mocks.testerResult.mockResolvedValue({ data: { email: "tester@um.edu.mo" }, error: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.getDirectoryUser).toHaveBeenCalledWith("user_1");
    expect(mocks.eq).toHaveBeenCalledWith("assistant_testers", "email", "tester@um.edu.mo");
  });

  it("matches tester emails case-insensitively", async () => {
    mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: "Tester@UM.edu.mo" });
    mocks.testerResult.mockResolvedValue({ data: { email: "tester@um.edu.mo" }, error: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.eq).toHaveBeenCalledWith("assistant_testers", "email", "tester@um.edu.mo");
  });

  it("denies a signed-in user who is neither admin nor tester", async () => {
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies a user without a verified email, without a tester query", async () => {
    mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(queriedTesters()).toBe(false);
  });

  it("denies when Clerk returns no user", async () => {
    mocks.getDirectoryUser.mockResolvedValue(null);
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the admin lookup fails, without a tester lookup", async () => {
    mocks.resolveAdminSession.mockResolvedValue({ ok: false });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("denies when the admin lookup throws", async () => {
    mocks.resolveAdminSession.mockRejectedValue(new Error("clerk down"));
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the tester query errors", async () => {
    mocks.testerResult.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the mode cannot be read", async () => {
    mocks.modeResult.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/assistant/access.test.ts`
Expected: FAIL — cannot resolve `@/lib/assistant/access`.

- [ ] **Step 3: Implement**

`lib/assistant/access.ts`:

```ts
import "server-only";

import { unstable_cache } from "next/cache";

import { resolveAdminSession } from "@/lib/admin-auth";
import { parseAssistantAccess, type AssistantAccess } from "@/lib/assistant/access-mode";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getDirectoryUser } from "@/lib/clerk/user-directory";
import supabaseAdmin from "@/lib/supabase/admin";

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Selects only the mode column so a missing column cannot affect other app_config readers. */
export async function readAssistantAccess(): Promise<AssistantAccess> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("ai_assistant_access")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[assistant-access] mode read failed:", error.message);
      return "off";
    }
    return parseAssistantAccess(data?.ai_assistant_access);
  } catch (error) {
    console.error("[assistant-access] mode read threw:", describeError(error));
    return "off";
  }
}

export const getAssistantAccess = unstable_cache(readAssistantAccess, ["assistant-access"], {
  tags: [CACHE_TAGS.appConfig],
  revalidate: 300,
});

async function isAssistantTester(userId: string): Promise<boolean> {
  const user = await getDirectoryUser(userId);
  const email = user?.primaryEmail?.toLowerCase();
  if (!email) return false;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[assistant-access] tester lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function canUseAssistant(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const mode = await getAssistantAccess();
  if (mode === "off") return false;
  if (mode === "everyone") return true;

  try {
    const admin = await resolveAdminSession(userId);
    if (!admin.ok) return false;
    if (admin.session) return true;
    return await isAssistantTester(userId);
  } catch (error) {
    console.error("[assistant-access] access check threw:", describeError(error));
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/assistant/access.test.ts && npx tsc --noEmit`
Expected: PASS, tsc exits 0. If tsc rejects `data?.ai_assistant_access` because the Supabase client is typed, read it as `(data as { ai_assistant_access?: unknown } | null)?.ai_assistant_access`; do not use `any`.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/access.ts tests/assistant/access.test.ts
git commit -m "feat(assistant): canUseAssistant with off/testers/everyone modes"
```

---

### Task 4: Enforce in the CopilotKit route and add the access endpoint

**Files:**
- Modify: `app/api/copilotkit/[[...slug]]/route.ts:17,115-120`
- Create: `app/api/assistant/access/route.ts`
- Test: `tests/api/copilotkit.test.ts`, `tests/api/assistant-access.test.ts`

**Interfaces:**
- Consumes: `canUseAssistant(userId: string | null): Promise<boolean>` (Task 3).
- Produces: `GET /api/assistant/access` → `200 { "enabled": boolean }`, header `Cache-Control: private, no-store`. Copilotkit route: signed out 401; denied 403 `{ error: { code: "forbidden", message: "Assistant access required" } }`.

- [ ] **Step 1: Write the failing tests**

`tests/api/assistant-access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), canUseAssistant: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: mocks.canUseAssistant }));

import { GET } from "@/app/api/assistant/access/route";

describe("GET /api/assistant/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled for signed-out visitors without checking access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ enabled: false });
    expect(mocks.canUseAssistant).not.toHaveBeenCalled();
  });

  it("returns enabled when the user has access", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.canUseAssistant.mockResolvedValue(true);
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ enabled: true });
    expect(mocks.canUseAssistant).toHaveBeenCalledWith("user_1");
  });

  it("returns disabled when the user has no access", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2" });
    mocks.canUseAssistant.mockResolvedValue(false);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ enabled: false });
  });
});
```

In `tests/api/copilotkit.test.ts`:

1. Add `canUseAssistant: vi.fn(),` inside the `vi.hoisted` object (after `consumeAgentRateLimits: vi.fn(),`).
2. Add after the `@/lib/assistant/rate-limit` mock line:

```ts
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: mocks.canUseAssistant }));
```

3. Replace `const PILOT = { userId: "user_1", sessionClaims: { metadata: { aiPilot: true } } };` with:

```ts
const SIGNED_IN = { userId: "user_1" };
```

4. In `beforeEach`, replace `mocks.auth.mockResolvedValue(PILOT);` with:

```ts
    mocks.auth.mockResolvedValue(SIGNED_IN);
    mocks.canUseAssistant.mockResolvedValue(true);
```

5. Replace the first two tests (`"returns 401 without a session"` and `"returns 403 for signed-in users outside the pilot"`) with:

```ts
  it("returns 401 without a session, before checking access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const { POST } = await loadRoute();
    const response = await POST(post("/agent/default/run", runBody([now])));
    expect(response.status).toBe(401);
    expect(mocks.canUseAssistant).not.toHaveBeenCalled();
    expect(mocks.runtimeHandler).not.toHaveBeenCalled();
  });

  it("returns 403 for signed-in users without assistant access", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2" });
    mocks.canUseAssistant.mockResolvedValue(false);
    const { GET } = await loadRoute();
    const response = await GET(get("/info"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Assistant access required" },
    });
    expect(mocks.canUseAssistant).toHaveBeenCalledWith("user_2");
    expect(mocks.runtimeHandler).not.toHaveBeenCalled();
  });

  it("checks access before body parsing and rate limiting", async () => {
    mocks.canUseAssistant.mockResolvedValue(false);
    const { POST } = await loadRoute();
    const response = await POST(post("/agent/default/run", "not json"));
    expect(response.status).toBe(403);
    expect(mocks.consumeAgentRateLimits).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/assistant-access.test.ts tests/api/copilotkit.test.ts`
Expected: FAIL — cannot resolve `@/app/api/assistant/access/route`; copilotkit 403 tests fail (route still reads `sessionClaims`, so every request is 403 and the allow-path tests fail too).

- [ ] **Step 3: Implement**

`app/api/assistant/access/route.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canUseAssistant } from "@/lib/assistant/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  const enabled = userId ? await canUseAssistant(userId) : false;
  return NextResponse.json({ enabled }, { headers: { "Cache-Control": "private, no-store" } });
}
```

In `app/api/copilotkit/[[...slug]]/route.ts`:

Replace the import line `import { isAssistantPilot } from "@/lib/assistant/pilot";` with:

```ts
import { canUseAssistant } from "@/lib/assistant/access";
```

Replace the start of `handle`:

```ts
async function handle(request: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  if (!isAssistantPilot(sessionClaims)) {
    return apiError("forbidden", "Assistant pilot access required", 403);
  }
```

with:

```ts
async function handle(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  if (!(await canUseAssistant(userId))) {
    return apiError("forbidden", "Assistant access required", 403);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/assistant-access.test.ts tests/api/copilotkit.test.ts && npx tsc --noEmit`
Expected: PASS (all existing copilotkit allowlist, rate-limit and shaping tests included), tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/assistant/access/route.ts app/api/copilotkit/[[...slug]]/route.ts tests/api/assistant-access.test.ts tests/api/copilotkit.test.ts
git commit -m "feat(assistant): enforce runtime access mode and expose /api/assistant/access"
```

---

### Task 5: Launcher asks the access endpoint; remove the Clerk pilot gate

**Files:**
- Modify: `components/assistant/assistant-launcher.tsx`
- Delete: `lib/assistant/pilot.ts`, `tests/assistant/pilot.test.ts`
- Test: `tests/components/assistant-launcher.test.tsx` (rewrite)
- Modify: `docs/superpowers/verification/2026-10-18-assistant-v1.md` (bundle re-check note)

**Interfaces:**
- Consumes: `GET /api/assistant/access` → `{ enabled: boolean }` (Task 4).
- Produces: `AssistantLauncher({ plan })` — same props as today; renders the `AI 选课助手` button only after the endpoint returns `{ enabled: true }`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/components/assistant-launcher.test.tsx` with:

```tsx
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPanel() {
      return <div data-testid="assistant-panel" />;
    },
}));

import AssistantLauncher from "@/components/assistant/assistant-launcher";

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

const respond = (ok: boolean, body: unknown): FakeResponse => ({ ok, json: async () => body });

function stubFetch(result: FakeResponse | Error) {
  const fetchMock = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantLauncher", () => {
  it("renders nothing and makes no request while Clerk is loading", () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing and makes no request for signed-out visitors", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the access endpoint once and shows the button when enabled", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher plan={undefined} />);

    expect(await screen.findByRole("button", { name: "AI 选课助手" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/access", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    ["disabled", respond(true, { enabled: false })],
    ["a non-200 response", respond(false, { error: { code: "forbidden" } })],
    ["a malformed body", respond(true, { enabled: "yes" })],
    ["a network error", new Error("offline")],
  ])("renders nothing for %s", async (_label, result) => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const fetchMock = stubFetch(result);
    const { container } = render(<AssistantLauncher plan={undefined} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("loads the panel only after the user opens it", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher plan={undefined} />);

    const button = await screen.findByRole("button", { name: "AI 选课助手" });
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/components/assistant-launcher.test.tsx`
Expected: FAIL — the component calls `useUser`, which the mock no longer provides (`useUser is not a function` / not exported).

- [ ] **Step 3: Implement**

Replace the whole of `components/assistant/assistant-launcher.tsx` with:

```tsx
"use client";

import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { LocalPlan } from "@/lib/timetable/store";

const AssistantPanel = dynamic(() => import("./assistant-panel"), { ssr: false });

export default function AssistantLauncher({ plan }: { plan: LocalPlan | undefined }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setEnabled(false);
      return;
    }

    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json().catch(() => null);
        return body?.enabled === true;
      })
      .then((nextEnabled) => setEnabled(nextEnabled))
      .catch(() => setEnabled(false));

    return () => controller.abort();
  }, [isLoaded, isSignedIn]);

  if (!enabled) return null;
  if (opened) return <AssistantPanel plan={plan} />;

  return (
    <button
      type="button"
      onClick={() => setOpened(true)}
      className="fixed bottom-6 right-6 z-40 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-lg"
    >
      AI 选课助手
    </button>
  );
}
```

Delete the old gate:

```bash
git rm lib/assistant/pilot.ts tests/assistant/pilot.test.ts
```

Confirm nothing still imports it:

Run: `rg -n "assistant/pilot|isAssistantPilot|isPilotMetadata|aiPilot" app components lib tests`
Expected: no output.

- [ ] **Step 4: Run the full checks and the bundle comparison**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/components/assistant-launcher.test.tsx && npm run test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all PASS. In the build's route table: `/` ≤ 176 kB, `/course/[code]` ≤ 133 kB, `/timetable` ≤ 205 kB, `First Load JS shared by all` = 103 kB. If any limit is exceeded, stop and report the numbers; do not relax the limits.

Append to `docs/superpowers/verification/2026-10-18-assistant-v1.md`, directly under the §1 table:

```markdown

Access-control change (2026-10-18, `docs/superpowers/plans/2026-10-18-assistant-access-control.md` Task 5): `/` <N> kB, `/course/[code]` <N> kB, `/timetable` <N> kB, shared <N> kB.
```

Replace each `<N>` with the value printed by this build.

- [ ] **Step 5: Commit**

```bash
git add components/assistant/assistant-launcher.tsx tests/components/assistant-launcher.test.tsx docs/superpowers/verification/2026-10-18-assistant-v1.md
git commit -m "feat(assistant): launcher uses /api/assistant/access; drop Clerk aiPilot gate"
```

(`git rm` already staged the two deletions.)

---

### Task 6: Admin APIs for the mode and the tester list

**Files:**
- Modify: `lib/validation/admin.ts` (`appConfigUpdateSchema`, new `assistantTesterSchema`)
- Modify: `lib/admin-audit.ts:5-13` (action union)
- Create: `app/api/admin/assistant-testers/route.ts`
- Create: `app/api/admin/assistant-testers/[email]/route.ts`
- Test: `tests/api/admin/app-config.test.ts`, `tests/api/admin/assistant-testers.test.ts`

`app/api/admin/app-config/route.ts` needs no change: it already spreads the parsed body into the update, revalidates `app-config`, and audits `config.update`.

**Interfaces:**
- Consumes: `ASSISTANT_ACCESS_MODES`, `MAX_ASSISTANT_TESTERS` (Task 1); existing `requireAdmin`, `getClerkUserEmails`, `writeAuditLog`, `readJsonBody`, `apiError`.
- Produces:
  - `POST /api/admin/app-config { ai_assistant_access: "off" | "testers" | "everyone" }` → 200.
  - `assistantTesterSchema`: `{ email: string }`, trimmed, lowercased, max 254, valid email.
  - `GET /api/admin/assistant-testers` → `200 { testers: Array<{ email: string; added_by: string; added_by_email: string | null; created_at: string }> }`, newest first.
  - `POST /api/admin/assistant-testers { email }` → `201 { ok: true, email }`; 400 invalid; 409 `already_exists`; 409 `tester_limit`.
  - `DELETE /api/admin/assistant-testers/:email` (URL-encoded) → `200 { ok: true }`; 400 invalid; 404 `not_found`.
  - Audit actions `"assistant_tester.add"` / `"assistant_tester.remove"`, `targetType: "assistant_tester"`, `targetId: <email>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/admin/app-config.test.ts`, inside the `describe` block:

```ts
  it("updates the assistant access mode", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "everyone" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ ai_assistant_access: "everyone", updated_by: "user_admin" });
    expect(revalidateTag).toHaveBeenCalledWith("app-config");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "config.update",
        after: expect.objectContaining({ ai_assistant_access: "everyone" }),
      }),
    );
  });

  it("rejects unknown assistant access modes", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_assistant_access: "admins" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
```

`tests/api/admin/assistant-testers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type DbError = { code?: string; message: string };
type TesterRow = { email: string; added_by: string; created_at: string };

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  getClerkUserEmails: vi.fn(),
  insert: vi.fn(),
  deleteEq: vi.fn(),
  db: {
    list: { data: [] as TesterRow[], error: null as DbError | null },
    count: { count: 0 as number | null, error: null as DbError | null },
    insert: { error: null as DbError | null },
    remove: { data: [] as Array<{ email: string }>, error: null as DbError | null },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
  getClerkUserEmails: mocks.getClerkUserEmails,
}));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: () => ({
      select: (_columns: string, options?: { head?: boolean }) =>
        options?.head
          ? Promise.resolve(mocks.db.count)
          : { order: () => ({ limit: () => Promise.resolve(mocks.db.list) }) },
      insert: (rows: unknown) => {
        mocks.insert(rows);
        return Promise.resolve(mocks.db.insert);
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          mocks.deleteEq(column, value);
          return { select: () => Promise.resolve(mocks.db.remove) };
        },
      }),
    }),
  },
}));

import { GET, POST } from "@/app/api/admin/assistant-testers/route";
import { DELETE } from "@/app/api/admin/assistant-testers/[email]/route";

const tester: TesterRow = { email: "tester@um.edu.mo", added_by: "user_admin", created_at: "2026-10-18T08:00:00Z" };

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/assistant-testers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const remove = (encodedEmail: string) =>
  DELETE(new Request(`http://localhost/api/admin/assistant-testers/${encodedEmail}`, { method: "DELETE" }), {
    params: Promise.resolve({ email: encodedEmail }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
  mocks.getClerkUserEmails.mockResolvedValue(new Map([["user_admin", "admin@um.edu.mo"]]));
  mocks.db.list = { data: [tester], error: null };
  mocks.db.count = { count: 0, error: null };
  mocks.db.insert = { error: null };
  mocks.db.remove = { data: [{ email: "tester@um.edu.mo" }], error: null };
});

describe("assistant testers API", () => {
  it.each([401, 403])("passes through a %i from requireAdmin and asks for platform admin", async (status) => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "x", message: "x" } }, { status }),
    });
    expect((await GET()).status).toBe(status);
    expect((await post({ email: "a@b.co" })).status).toBe(status);
    expect((await remove("a%40b.co")).status).toBe(status);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({ platformOnly: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  describe("GET", () => {
    it("lists testers with the adding admin's email", async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        testers: [{ ...tester, added_by_email: "admin@um.edu.mo" }],
      });
      expect(mocks.getClerkUserEmails).toHaveBeenCalledWith(["user_admin"]);
    });

    it("returns 500 when the query fails", async () => {
      mocks.db.list = { data: [], error: { message: "db down" } };
      expect((await GET()).status).toBe(500);
    });
  });

  describe("POST", () => {
    it("adds a trimmed, lowercased email and audits it", async () => {
      const response = await post({ email: "  Tester@UM.edu.mo " });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ ok: true, email: "tester@um.edu.mo" });
      expect(mocks.insert).toHaveBeenCalledWith([{ email: "tester@um.edu.mo", added_by: "user_admin" }]);
      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        actorId: "user_admin",
        action: "assistant_tester.add",
        targetType: "assistant_tester",
        targetId: "tester@um.edu.mo",
        after: { email: "tester@um.edu.mo" },
      });
    });

    it.each([[{ email: "not-an-email" }], [{ email: "" }], [{}], [{ email: `${"a".repeat(250)}@um.edu.mo` }]])(
      "rejects %j",
      async (body) => {
        expect((await post(body)).status).toBe(400);
        expect(mocks.insert).not.toHaveBeenCalled();
      },
    );

    it("returns 409 for a duplicate", async () => {
      mocks.db.insert = { error: { code: "23505", message: "duplicate key" } };
      const response = await post({ email: "tester@um.edu.mo" });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "already_exists" } });
      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it("returns 409 once the list is full, without inserting", async () => {
      mocks.db.count = { count: 200, error: null };
      const response = await post({ email: "new@um.edu.mo" });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "tester_limit" } });
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("returns 500 when counting fails", async () => {
      mocks.db.count = { count: null, error: { message: "db down" } };
      expect((await post({ email: "new@um.edu.mo" })).status).toBe(500);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("returns 500 for other insert errors", async () => {
      mocks.db.insert = { error: { code: "XX000", message: "boom" } };
      expect((await post({ email: "new@um.edu.mo" })).status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("removes a URL-encoded, mixed-case email and audits it", async () => {
      const response = await remove("Tester%40UM.edu.mo");
      expect(response.status).toBe(200);
      expect(mocks.deleteEq).toHaveBeenCalledWith("email", "tester@um.edu.mo");
      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        actorId: "user_admin",
        action: "assistant_tester.remove",
        targetType: "assistant_tester",
        targetId: "tester@um.edu.mo",
        before: { email: "tester@um.edu.mo" },
      });
    });

    it("returns 404 when the email is not listed", async () => {
      mocks.db.remove = { data: [], error: null };
      expect((await remove("ghost%40um.edu.mo")).status).toBe(404);
      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it.each(["not-an-email", "%E0%A4%A"])("rejects %s", async (raw) => {
      expect((await remove(raw)).status).toBe(400);
      expect(mocks.deleteEq).not.toHaveBeenCalled();
    });

    it("returns 500 when the delete fails", async () => {
      mocks.db.remove = { data: [], error: { message: "db down" } };
      expect((await remove("tester%40um.edu.mo")).status).toBe(500);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/admin/app-config.test.ts tests/api/admin/assistant-testers.test.ts`
Expected: FAIL — `"updates the assistant access mode"` gets 400 (zod strips the unknown key, so the body is empty); tester routes cannot be resolved.

- [ ] **Step 3: Implement**

In `lib/validation/admin.ts`, add at the top under `import { z } from "zod";`:

```ts
import { ASSISTANT_ACCESS_MODES } from "@/lib/assistant/access-mode";
```

In `appConfigUpdateSchema`, add after the `database_last_update` field:

```ts
    ai_assistant_access: z.enum(ASSISTANT_ACCESS_MODES).optional(),
```

Append at the end of the file:

```ts
export const assistantTesterSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
});
```

In `lib/admin-audit.ts`, extend the `action` union:

```ts
  action:
    | "report.update"
    | "comment.update"
    | "course.update"
    | "prof.update"
    | "admin.grant"
    | "admin.revoke"
    | "sync.um"
    | "config.update"
    | "assistant_tester.add"
    | "assistant_tester.remove";
```

`app/api/admin/assistant-testers/route.ts`:

```ts
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { getClerkUserEmails, requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { MAX_ASSISTANT_TESTERS } from "@/lib/assistant/access-mode";
import supabaseAdmin from "@/lib/supabase/admin";
import { assistantTesterSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

type TesterRow = { email: string; added_by: string; created_at: string };

export async function GET() {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .select("email, added_by, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ASSISTANT_TESTERS);

  if (error) {
    console.error("[admin/assistant-testers] query failed:", error.message);
    return apiError("internal_error", "Unable to load testers", 500);
  }

  const testers = (data ?? []) as TesterRow[];
  const emailById = await getClerkUserEmails(testers.map((row) => row.added_by));

  return NextResponse.json({
    testers: testers.map((row) => ({ ...row, added_by_email: emailById.get(row.added_by) ?? null })),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const body = await readJsonBody(request, 1_024);
  if (!body.ok) return body.response;

  const parsed = assistantTesterSchema.safeParse(body.data);
  if (!parsed.success) return apiError("invalid_request", "Invalid email address", 400);
  const { email } = parsed.data;

  const { count, error: countError } = await supabaseAdmin
    .from("assistant_testers")
    .select("email", { count: "exact", head: true });

  if (countError) {
    console.error("[admin/assistant-testers] count failed:", countError.message);
    return apiError("internal_error", "Unable to add tester", 500);
  }
  if ((count ?? 0) >= MAX_ASSISTANT_TESTERS) {
    return apiError("tester_limit", `Tester list is full (${MAX_ASSISTANT_TESTERS})`, 409);
  }

  const { error } = await supabaseAdmin
    .from("assistant_testers")
    .insert([{ email, added_by: admin.session.userId }]);

  if (error?.code === "23505") return apiError("already_exists", "Tester already added", 409);
  if (error) {
    console.error("[admin/assistant-testers] insert failed:", error.message);
    return apiError("internal_error", "Unable to add tester", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "assistant_tester.add",
    targetType: "assistant_tester",
    targetId: email,
    after: { email },
  });

  return NextResponse.json({ ok: true, email }, { status: 201 });
}
```

`app/api/admin/assistant-testers/[email]/route.ts`:

```ts
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { assistantTesterSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

function decodeEmail(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ email: string }> }) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { email: rawEmail } = await params;
  const parsed = assistantTesterSchema.safeParse({ email: decodeEmail(rawEmail) });
  if (!parsed.success) return apiError("invalid_request", "Invalid email address", 400);
  const { email } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .delete()
    .eq("email", email)
    .select("email");

  if (error) {
    console.error("[admin/assistant-testers] delete failed:", error.message);
    return apiError("internal_error", "Unable to remove tester", 500);
  }
  if (!data || data.length === 0) return apiError("not_found", "Tester not found", 404);

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "assistant_tester.remove",
    targetType: "assistant_tester",
    targetId: email,
    before: { email },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/admin && npx tsc --noEmit`
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/admin.ts lib/admin-audit.ts app/api/admin/assistant-testers tests/api/admin/app-config.test.ts tests/api/admin/assistant-testers.test.ts
git commit -m "feat(admin): assistant access mode in app-config and tester list API"
```

---

### Task 7: `/admin/assistant` page and nav tab

**Files:**
- Create: `app/admin/assistant/page.tsx`
- Create: `components/admin/assistant-access-client.tsx`
- Modify: `components/admin/admin-nav.tsx:7-15`
- Test: `tests/api/admin/assistant-page.test.ts`, `tests/components/assistant-access-client.test.tsx`, `tests/components/admin-nav.test.tsx`

**Interfaces:**
- Consumes: `readAssistantAccess()` (Task 3); `ASSISTANT_ACCESS_MODES`, `AssistantAccess` (Task 1); `POST /api/admin/app-config { ai_assistant_access }`, `GET|POST /api/admin/assistant-testers`, `DELETE /api/admin/assistant-testers/:email` (Task 6); existing `getCurrentAdmin`.
- Produces: `AssistantAccessClient({ initialAccess }: { initialAccess: AssistantAccess })`; route `/admin/assistant` (platform admins only; 404 otherwise); nav item `AI Assistant` as the last platform-only tab.

- [ ] **Step 1: Write the failing tests**

`tests/api/admin/assistant-page.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdmin, readAssistantAccess, redirect, notFound } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  readAssistantAccess: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin }));
vi.mock("@/lib/assistant/access", () => ({ readAssistantAccess }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import AssistantAdminPage from "@/app/admin/assistant/page";

describe("AssistantAdminPage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAssistantAccess.mockResolvedValue("testers");
  });

  it("redirects anonymous users to sign in", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    await expect(AssistantAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(readAssistantAccess).not.toHaveBeenCalled();
  });

  it("404s non-platform admins without reading the mode", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: false } });
    await expect(AssistantAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readAssistantAccess).not.toHaveBeenCalled();
  });

  it("renders the client with the current mode for platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: true } });
    const view = await AssistantAdminPage();
    expect(view.props.initialAccess).toBe("testers");
  });
});
```

`tests/components/assistant-access-client.test.tsx`:

```tsx
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement("a", { href, ...props }, children as React.ReactNode),
  };
});

import AssistantAccessClient from "@/components/admin/assistant-access-client";

type Reply = { ok: boolean; body: unknown };
type Router = (url: string, init?: RequestInit) => Reply;

const tester = {
  email: "tester@um.edu.mo",
  added_by: "user_admin",
  added_by_email: "admin@um.edu.mo",
  created_at: "2026-10-18T08:00:00Z",
};
const list = (testers: unknown[]): Reply => ({ ok: true, body: { testers } });

function stubFetch(router: Router) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = router(url, init);
    return { ok: reply.ok, status: reply.ok ? 200 : 400, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const modeRadio = (name: RegExp) => screen.getByRole("radio", { name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AssistantAccessClient", () => {
  it("shows the current mode and the tester list", async () => {
    stubFetch(() => list([tester]));
    render(<AssistantAccessClient initialAccess="testers" />);

    expect(modeRadio(/Admins & testers/).getAttribute("aria-checked")).toBe("true");
    expect(modeRadio(/Off/).getAttribute("aria-checked")).toBe("false");
    expect(await screen.findByText("tester@um.edu.mo")).toBeTruthy();
    expect(screen.getByText("admin@um.edu.mo")).toBeTruthy();
  });

  it("saves a mode change through the app-config route", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: true, body: { config: {} } } : list([]),
    );
    render(<AssistantAccessClient initialAccess="off" />);

    fireEvent.click(modeRadio(/Admins & testers/));

    await waitFor(() => expect(modeRadio(/Admins & testers/).getAttribute("aria-checked")).toBe("true"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/admin/app-config");
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ai_assistant_access: "testers" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("asks for confirmation before opening to everyone and does nothing if cancelled", async () => {
    const fetchMock = stubFetch(() => list([]));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(modeRadio(/Everyone/));

    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/admin/app-config")).toBe(false);
    expect(modeRadio(/Everyone/).getAttribute("aria-checked")).toBe("false");
  });

  it("opens to everyone after confirmation", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: true, body: { config: {} } } : list([]),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(modeRadio(/Everyone/));

    await waitFor(() => expect(modeRadio(/Everyone/).getAttribute("aria-checked")).toBe("true"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/admin/app-config");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ai_assistant_access: "everyone" });
  });

  it("keeps the old mode and shows the error when saving fails", async () => {
    stubFetch((url) =>
      url === "/api/admin/app-config" ? { ok: false, body: { error: { message: "boom" } } } : list([]),
    );
    render(<AssistantAccessClient initialAccess="off" />);

    fireEvent.click(modeRadio(/Admins & testers/));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    expect(modeRadio(/Off/).getAttribute("aria-checked")).toBe("true");
  });

  it("adds a tester and reloads the list", async () => {
    let added = false;
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        added = true;
        return { ok: true, body: { ok: true, email: "new@um.edu.mo" } };
      }
      return list(added ? [{ ...tester, email: "new@um.edu.mo" }] : []);
    });
    render(<AssistantAccessClient initialAccess="testers" />);
    await screen.findByText("No testers");

    fireEvent.change(screen.getByLabelText("Tester email"), { target: { value: "new@um.edu.mo" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));

    expect(await screen.findByText("new@um.edu.mo")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(call?.[0]).toBe("/api/admin/assistant-testers");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: "new@um.edu.mo" });
    expect(toast.success).toHaveBeenCalledWith("Tester added");
  });

  it("removes a tester through the encoded URL", async () => {
    let removed = false;
    const fetchMock = stubFetch((_url, init) => {
      if (init?.method === "DELETE") {
        removed = true;
        return { ok: true, body: { ok: true } };
      }
      return list(removed ? [] : [tester]);
    });
    render(<AssistantAccessClient initialAccess="testers" />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove tester@um.edu.mo" }));

    expect(await screen.findByText("No testers")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(call?.[0]).toBe("/api/admin/assistant-testers/tester%40um.edu.mo");
    expect(toast.success).toHaveBeenCalledWith("Tester removed");
  });
});
```

In `tests/components/admin-nav.test.tsx`, append inside the `describe` block:

```tsx
  it("shows the AI Assistant tab last for platform admins", () => {
    const view = render(<AdminNav isPlatformAdmin />);
    const links = view.getAllByRole("link");
    const last = links[links.length - 1];
    expect(last.textContent).toBe("AI Assistant");
    expect(last.getAttribute("href")).toBe("/admin/assistant");
  });

  it("hides the AI Assistant tab from other admins", () => {
    const view = render(<AdminNav isPlatformAdmin={false} />);
    expect(view.queryByText("AI Assistant")).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/admin/assistant-page.test.ts tests/components/assistant-access-client.test.tsx tests/components/admin-nav.test.tsx`
Expected: FAIL — page and client modules cannot be resolved; nav has no `AI Assistant` link.

- [ ] **Step 3: Implement**

In `components/admin/admin-nav.tsx`, add as the last entry of `NAV_ITEMS`:

```ts
  { href: "/admin/assistant", label: "AI Assistant", platformOnly: true },
```

`app/admin/assistant/page.tsx`:

```tsx
import React from "react";
import { notFound, redirect } from "next/navigation";

import AssistantAccessClient from "@/components/admin/assistant-access-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { readAssistantAccess } from "@/lib/assistant/access";

export const dynamic = "force-dynamic";

export default async function AssistantAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }
  if (!admin.session.isPlatformAdmin) notFound();

  const access = await readAssistantAccess();
  return <AssistantAccessClient initialAccess={access} />;
}
```

`components/admin/assistant-access-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSISTANT_ACCESS_MODES, type AssistantAccess } from "@/lib/assistant/access-mode";

type TesterRow = {
  email: string;
  added_by: string;
  added_by_email: string | null;
  created_at: string;
};

const MODE_COPY: Record<AssistantAccess, { label: string; description: string }> = {
  off: { label: "Off", description: "Hidden for everyone. The assistant API returns 403." },
  testers: { label: "Admins & testers", description: "Admins and the tester emails below." },
  everyone: { label: "Everyone", description: "Every signed-in user." },
};

const EVERYONE_CONFIRM =
  "All signed-in users will be able to use the assistant and incur DeepSeek cost. Continue?";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export default function AssistantAccessClient({ initialAccess }: { initialAccess: AssistantAccess }) {
  const [access, setAccess] = useState<AssistantAccess>(initialAccess);
  const [saving, setSaving] = useState(false);
  const [testers, setTesters] = useState<TesterRow[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(true);
  const [email, setEmail] = useState("");

  const loadTesters = useCallback(async () => {
    setLoadingTesters(true);
    try {
      const response = await fetch("/api/admin/assistant-testers", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response, "Failed to load testers"));
      const body = await response.json();
      setTesters(body.testers ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load testers");
    } finally {
      setLoadingTesters(false);
    }
  }, []);

  useEffect(() => {
    void loadTesters();
  }, [loadTesters]);

  async function changeAccess(next: AssistantAccess) {
    if (next === access || saving) return;
    if (next === "everyone" && !window.confirm(EVERYONE_CONFIRM)) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/app-config", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ai_assistant_access: next }),
      });
      if (!response.ok) {
        toast.error(await errorMessage(response, "Failed to update access"));
        return;
      }
      setAccess(next);
      toast.success(`AI assistant access: ${MODE_COPY[next].label}`);
    } catch {
      toast.error("Failed to update access");
    } finally {
      setSaving(false);
    }
  }

  async function addTester() {
    const value = email.trim();
    if (!value) return;
    const response = await fetch("/api/admin/assistant-testers", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: value }),
    });
    if (!response.ok) {
      toast.error(await errorMessage(response, "Failed to add tester"));
      return;
    }
    toast.success("Tester added");
    setEmail("");
    await loadTesters();
  }

  async function removeTester(target: string) {
    const response = await fetch(`/api/admin/assistant-testers/${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error(await errorMessage(response, "Failed to remove tester"));
      return;
    }
    toast.success("Tester removed");
    await loadTesters();
  }

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold">AI Assistant</div>

      <div className="rounded-lg border p-4">
        <div className="mb-1 text-sm font-medium">Access</div>
        <div className="mb-3 text-xs text-muted-foreground">
          Changes apply on the next request (at most 5 minutes if the cache is slow to clear).
        </div>
        <div role="radiogroup" aria-label="AI assistant access" className="grid gap-2 sm:grid-cols-3">
          {ASSISTANT_ACCESS_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={access === mode}
              disabled={saving}
              onClick={() => void changeAccess(mode)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50 ${
                access === mode ? "border-brand bg-brand/10" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{MODE_COPY[mode].label}</div>
              <div className="text-xs text-muted-foreground">{MODE_COPY[mode].description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-1 text-sm font-medium">Testers</div>
        <div className="mb-3 text-xs text-muted-foreground">
          Used only in &quot;Admins &amp; testers&quot; mode. Admins (see{" "}
          <Link href="/admin/admins" className="underline">
            Admins
          </Link>
          ) always have access. Matched against the user&apos;s verified email, so you can add people before
          they sign up.
        </div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Tester email"
            className="w-full sm:max-w-sm"
            placeholder="name@um.edu.mo"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addTester();
            }}
          />
          <Button className="w-full sm:w-auto" onClick={() => void addTester()} disabled={!email.trim()}>
            Add tester
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2">Email</th>
                <th className="py-2">Added by</th>
                <th className="py-2">Added</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingTesters && testers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {testers.map((tester) => (
                <tr key={tester.email} className="border-b last:border-0">
                  <td className="py-2 text-xs">{tester.email}</td>
                  <td className="py-2 text-xs">{tester.added_by_email ?? "-"}</td>
                  <td className="py-2 text-xs">{String(tester.created_at).slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2">
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label={`Remove ${tester.email}`}
                      onClick={() => void removeTester(tester.email)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {!loadingTesters && testers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No testers
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run tests/api/admin/assistant-page.test.ts tests/components/assistant-access-client.test.tsx tests/components/admin-nav.test.tsx tests/api/admin/update-page.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, tsc and lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/assistant/page.tsx components/admin/assistant-access-client.tsx components/admin/admin-nav.tsx tests/api/admin/assistant-page.test.ts tests/components/assistant-access-client.test.tsx tests/components/admin-nav.test.tsx
git commit -m "feat(admin): AI Assistant page with access mode and tester list"
```

---

### Task 8: Replace the Clerk steps in the V1 docs and run the full checks

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md`
- Modify: `docs/superpowers/plans/2026-10-18-ai-assistant-v1.md` (Global Constraints line 24; Task 10; Task 11)

**Interfaces:**
- Consumes: everything above (docs only).
- Produces: V1 docs that no longer ask for Clerk Dashboard changes.

- [ ] **Step 1: V1 spec — mark the old gate as superseded**

In `docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md`:

Replace the V6 row's first clause `沿用旧文档：Clerk 登录 + \`publicMetadata.aiPilot\` 白名单；` with:

```
Clerk 登录；访问控制改为 `off / testers / everyone` 运行时开关（见 [2026-10-18-assistant-access-control-design.md](2026-10-18-assistant-access-control-design.md)，取代原 `publicMetadata.aiPilot` 白名单）；
```

Replace the whole `- **白名单**：...` bullet (it starts with `- **白名单**：Clerk Dashboard 给试点账号设`) with:

```markdown
- **访问控制**：已被 [2026-10-18-assistant-access-control-design.md](2026-10-18-assistant-access-control-design.md) 取代。不再使用 Clerk `publicMetadata.aiPilot` 与 session token 自定义 claim；由 `app_config.ai_assistant_access`（`off / testers / everyone`）加 `assistant_testers` 邮箱名单控制，在 `/admin/assistant` 切换。判断逻辑集中在 `lib/assistant/access.ts`。
```

Replace the test-list bullet `- **\`pilot\`**：claim 缺失 / false / true。` with:

```markdown
- **`access`**：三种模式 × 未登录 / 普通用户 / 测试者 / 管理员；任何查询失败都拒绝（见访问控制 spec §8）。
```

In the file-list code block, replace the line `  lib/assistant/pilot.ts` with these two lines (same two-space indentation):

```
  lib/assistant/access-mode.ts
  lib/assistant/access.ts
```

- [ ] **Step 2: V1 plan — Global Constraints**

In `docs/superpowers/plans/2026-10-18-ai-assistant-v1.md`, replace line 24 (`- 白名单：服务端读 \`sessionClaims.metadata.aiPilot === true\`...`) with:

```markdown
- 访问控制（2026-10-18 起）：见 [2026-10-18-assistant-access-control.md](2026-10-18-assistant-access-control.md)。原 `aiPilot` 白名单与 `lib/assistant/pilot.ts` 已删除。
```

- [ ] **Step 3: V1 plan — rewrite Task 10 Step 1, Step 2 path, and check 9**

Replace the whole Task 10 Step 1 (from `- [ ] **Step 1: Lua：配置 Clerk 开发实例**` through `3. 准备第二个账号，不设 \`aiPilot\`，用于反向验证。`) with:

```markdown
- [ ] **Step 1: Lua：打开访问权限（无需 Clerk Dashboard）**

1. 在开发用 Supabase 执行 `supabase/migrations/20261018_assistant_access.sql`。
2. 用平台管理员账号（`PLATFORM_ADMIN_USER_IDS` / `PLATFORM_ADMIN_EMAILS`）登录，打开 `http://localhost:3000/admin/assistant`。
3. 加入一个非管理员测试账号的邮箱，把模式切到 `Admins & testers`。
4. 准备第三个账号：既不是管理员也不在测试名单里，用于反向验证。
```

In Task 10 Step 2, replace `cd /Users/thomaswu/workspace/next-web/.worktrees/assistant-v1` with `cd /Users/thomaswu/workspace/next-web`, and replace `用白名单账号登录后` with `用管理员或测试账号登录后`.

Replace check 9 (`9. 换非白名单账号登录：...`) with:

```markdown
9. 换第三个账号（非管理员、非测试者）登录：`/timetable` 没有按钮；控制台 `await fetch('/api/copilotkit/info').then(r => r.status)` 为 `403`，`await fetch('/api/assistant/access').then(r => r.json())` 为 `{ enabled: false }`。再在 `/admin/assistant` 把模式切到 `Off`：管理员与测试账号刷新后按钮消失、`/api/copilotkit/info` 为 `403`；切回 `Admins & testers`。
```

In Task 10 Step 4, replace `用白名单账号问一题` with `用管理员或测试账号问一题`.

- [ ] **Step 4: V1 plan — rewrite Task 11 Steps 2, 5, 6 and rollback**

Replace Task 11 Step 2 with:

```markdown
- [ ] **Step 2: 生产数据库**：在生产 Supabase 执行 `supabase/migrations/20261018_assistant_access.sql`（默认 `off`，执行后对所有人仍隐藏）。必须在部署代码之前或同时执行；先部署也只会 fail closed（助手隐藏），不影响其它页面。
```

Replace Task 11 Step 5 with:

```markdown
- [ ] **Step 5: 合并 PR 并部署**：`npm run deploy`（或按现有发布流程）。部署后在生产 `/admin/assistant` 加入第一批约 20 名试点同学的邮箱，切到 `Admins & testers`；用测试账号在生产 `/timetable` 问一题，用非测试账号确认无按钮。
```

Replace Task 11 Step 6 with:

```markdown
- [ ] **Step 6: 试点 1–2 周**：已花 ≤ $150 → 在 `/admin/assistant` 继续加邮箱到约 100 人；正式上线时切到 `Everyone`。否则停下讨论。每次扩人前复核 DeepSeek 价格。
```

Replace the rollback line with:

```markdown
- [ ] **回滚**：在 `/admin/assistant` 切到 `Off`，下一次请求起对所有人隐藏并返回 403，无需重新部署。数据库对象（`ai_assistant_access` 列与 `assistant_testers` 表）保留即可。
```

- [ ] **Step 5: Confirm no Clerk-gate instructions remain**

Run: `rg -n "aiPilot|session token|Customize session token|白名单账号|非白名单" docs/superpowers/plans/2026-10-18-ai-assistant-v1.md docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md`
Expected: only matches inside historical Task 2 code listings of the V1 plan (the original `pilot.ts` / test snippets, around lines 341–580 and 1990–2040, and 2372) — no remaining instruction to configure Clerk. If a match is an instruction, rewrite it in the same style as above.

- [ ] **Step 6: Full checks**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && npm run test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all PASS. Bundle limits from Global Constraints still hold (`/` ≤ 176 kB, `/course/[code]` ≤ 133 kB, `/timetable` ≤ 205 kB, shared 103 kB).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md docs/superpowers/plans/2026-10-18-ai-assistant-v1.md
git commit -m "docs(assistant): replace Clerk aiPilot steps with runtime access control"
```

---

## Manual steps after merge (Lua)

1. Apply `supabase/migrations/20261018_assistant_access.sql` in Supabase (dev, then prod).
2. Deploy.
3. In `/admin/assistant`: add tester emails, choose `Admins & testers`, test with real DeepSeek chats (V1 plan Task 10).
4. Launch: choose `Everyone`. Kill switch: choose `Off`.
