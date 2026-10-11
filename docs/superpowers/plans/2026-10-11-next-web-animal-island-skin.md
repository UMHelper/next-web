# next-web 动森皮肤（animal-island-ui）实施计划

> **给执行的 agent：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal：** 给 next-web 增加一套可由用户在页面上切换的「动森」皮肤（`animal-island-ui`），与深色模式正交（2 皮肤 × 亮/暗 = 4 种组合），默认皮肤的视觉与行为零回归。

**Architecture：** 三层。
1. `app/skins/island.css` 常驻，仅覆盖 `html[data-skin="island"]` / `html[data-skin="island"].dark` 下的语义 token（颜色 44 个 + 结构 token）。
2. Radix 组件经新增语义 class（`rounded-control/float/card/item`、`shadow-button`、`.btn-depth`、`.skin-modal`）换皮，默认值等于旧值。
3. 客户端 `<IslandLayer />` 在 island 皮肤激活后才懒加载 `animal-island-ui`（Cursor、BackTop、浅色桌面 Background、Notification 经 `lib/notify.ts` 门面）。

SSR 永远输出默认皮肤；`data-skin` 只由 `<head>` 里的阻塞内联脚本与客户端 `SkinController` 写入，因此 ISR / Cloudflare 缓存不受影响。`/admin` 恒为默认皮肤。

**Tech Stack：** Next 15.5 App Router、React 18、Tailwind 3.3.3、Radix、next-themes 0.2.1、vitest 2.1.9、`animal-island-ui@2.2.1`、`naive-icons@^1.6.0`、`classnames@^2.5.1`。

**Spec：** `docs/superpowers/specs/2026-10-11-next-web-animal-island-skin-design.md`

---

## 全局约束（每个任务都必须遵守）

- 命令：`npx vitest run <path>`；全量 `npm test`；`npx tsc --noEmit`；`npm run lint`。
- 默认皮肤零回归：新增 token 的默认值必须等于旧值（6/6/8/4px，零阴影 `0 0 #0000`）。
- `--shadow-button` 默认必须是 `0 0 #0000`，**不能**是 `none`（Tailwind 的 `shadow-*` 会组合成 `box-shadow: ringOffset, ring, var(--tw-shadow)`，`none` 会使整条声明失效并吞掉 focus ring）。`:active` 要覆盖 `--tw-shadow`，不要覆盖 `box-shadow`。
- 新文件（`components/ui` 除外）只能用语义 token，不得出现仅浅色的颜色字面量（`tests/no-light-only-colors.test.ts` 会扫）。
- `lib/skin.ts` **不得**写 `"use client"`（服务端 layout 要导入 `SKIN_INIT_SCRIPT` 字符串）。
- `SkinController` 不用服务端快照 hook（否则 hydration 期间会把属性清掉）。
- 对比度：正文 ≥4.5:1；subtle / ring / 等级色 / logo ≥3:1；薄荷 `#19c8b9` 只当填充色配深棕字；文本级品牌色用深青 `#0b6e65`；destructive 填充 `#c94444` 配 `#fffdf7`（4.7:1）。
- naive-icons：`color="currentColor"`，导航/按钮 24px，移动菜单项 20px，不小于 16px，具名导入；使用 `TreeIcon`、`SunIcon`、`MoonIcon`。
- 不要为了动森皮肤去改 `/admin`、sonner 的 `admin_notice` Toaster、已有测试里对 sonner 的 mock 形状（`toast: {success, error, info}`）。
- 每个任务结束提交一次；提交信息以 `Co-Authored-By: Claude Code <noreply@anthropic.com>` 结尾。**不要**提交 `skills-lock.json` 与 `.claude/`。

## 文件清单

新增：
`app/skins/island.css`、`lib/skin.ts`、`lib/notify.ts`、`lib/island-loader.ts`、`types/animal-island-ui-style.d.ts`、`components/skin-switcher.tsx`（`SkinSwitcher`、`SkinOptions`）、`components/skin-controller.tsx`、`components/island-layer.tsx`、`components/skin-defs.tsx`。
测试：`tests/skin-tokens.test.ts`、`skin-store.test.ts`、`skin-init-script.test.ts`、`skin-default-parity.test.ts`、`notify.test.ts`、`no-sonner-in-public.test.ts`、`skin-layout.test.ts`、`tests/components/skin-switcher.test.tsx`、`island-layer.test.tsx`、`skin-defs.test.tsx`。
修改：`app/globals.css`、`tailwind.config.js`、`app/layout.tsx`、`components/ui/{button,input,textarea,card,dialog,sheet,select,popover,tooltip,hover-card,dropdown-menu}.tsx`、`components/navbar.tsx`、`components/mobile-sidebar.tsx`、`components/theme-color-meta.tsx`、7 个公开页 toast 文件、`package.json`；扩展 `tests/theme-tokens.test.ts`、`tests/theme-mounts.test.ts`、`tests/components/theme-color-meta.test.tsx`、`tests/components/theme-toggle.test.tsx`。

---

## Task 0：依赖与风险 R3 spike（库 CSS 能否懒加载）

**Files：** `package.json`、`package-lock.json`、`types/animal-island-ui-style.d.ts`、`lib/island-loader.ts`

- [ ] **Step 1：安装依赖**

```bash
npm install animal-island-ui@2.2.1 naive-icons@^1.6.0 classnames@^2.5.1
```

预期：`package.json` 的 dependencies 出现三项。`tests/no-dead-deps.test.ts` 只是已删除依赖的黑名单，不受影响；跑一次 `npx vitest run tests/no-dead-deps.test.ts` 确认仍绿。`classnames` 是 `animal-island-ui` 的 peer dependency，源码里不会直接 import，这是预期的。

- [ ] **Step 2：写样式模块声明** `types/animal-island-ui-style.d.ts`

```ts
declare module "animal-island-ui/style";
```

确认 `tsconfig.json` 的 `include` 覆盖 `**/*.ts`（默认 Next 配置已覆盖）。

- [ ] **Step 3：写加载器** `lib/island-loader.ts`

```ts
type IslandModule = typeof import("animal-island-ui");

let cached: Promise<IslandModule> | null = null;

export function loadIsland(): Promise<IslandModule> {
  if (!cached) {
    cached = Promise.all([
      import("animal-island-ui/style"),
      import("animal-island-ui"),
    ])
      .then(([, mod]) => mod)
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
```

- [ ] **Step 4：spike 验证 R3**

```bash
npm run build 2>&1 | tail -30
```

预期：构建通过，且 `.next/static/css` 中库 CSS 被拆成独立 chunk（`grep -l "animal-" .next/static/css/*.css`）。若 Next 把库 CSS 合并进了首屏必载 CSS chunk，则启用**回退方案**：把 `node_modules/animal-island-ui/dist/index.css` 复制到 `public/skins/animal-island-ui.css`，`loadIsland()` 改为运行时向 `document.head` 插入 `<link rel="stylesheet" href="/skins/animal-island-ui.css">` 并等待 `load` 事件；并在本计划与 spec §12 R3 记录结论。无论走哪条路，把结论写进 Task 10 的验证文档。

- [ ] **Step 5：提交**

```bash
git add package.json package-lock.json types/animal-island-ui-style.d.ts lib/island-loader.ts
git commit -m "chore(skin): add animal-island-ui deps and lazy island loader"
```

---

## Task 1：结构 token 与 Radix 组件语义 class（默认皮肤零回归）

**Files：** `app/globals.css`、`tailwind.config.js`、`components/ui/*`（11 个）、`tests/theme-tokens.test.ts`、`tests/skin-default-parity.test.ts`

- [ ] **Step 1：写失败测试** `tests/skin-default-parity.test.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const UI_FILES = [
  "button", "input", "textarea", "card", "dialog", "sheet",
  "select", "popover", "tooltip", "hover-card", "dropdown-menu",
];

describe("default skin parity", () => {
  const css = read("app/globals.css");

  it("structural tokens default to the legacy radii and a zero shadow", () => {
    expect(css).toMatch(/--radius-control:\s*calc\(var\(--radius\) - 2px\);/);
    expect(css).toMatch(/--radius-float:\s*calc\(var\(--radius\) - 2px\);/);
    expect(css).toMatch(/--radius-card:\s*var\(--radius\);/);
    expect(css).toMatch(/--radius-item:\s*calc\(var\(--radius\) - 4px\);/);
    expect(css).toMatch(/--shadow-button:\s*0 0 #0000;/);
  });

  it("tailwind maps the semantic radius and shadow classes to the tokens", () => {
    const cfg = read("tailwind.config.js");
    for (const k of ["control", "float", "card", "item"]) {
      expect(cfg).toContain(`${k}: "var(--radius-${k})"`);
    }
    expect(cfg).toContain('button: "var(--shadow-button)"');
  });

  it("ui primitives use semantic radius classes instead of sm/md/lg", () => {
    const all = UI_FILES.map((f) => read(`components/ui/${f}.tsx`)).join("\n");
    expect(count(all, /\brounded-control\b/g)).toBe(6);
    expect(count(all, /\brounded-float\b/g)).toBe(7);
    expect(count(all, /\brounded-item\b/g)).toBe(7);
    expect(count(all, /\brounded-card\b/g)).toBe(3);
    expect(count(all, /(?<![-\w])rounded-(sm|md|lg)\b/g)).toBe(0);
  });

  it("only default and destructive buttons get the depth shadow; dialogs opt into the blob", () => {
    expect(count(read("components/ui/button.tsx"), /shadow-button btn-depth/g)).toBe(2);
    expect(count(read("components/ui/dialog.tsx"), /\bskin-modal\b/g)).toBe(2);
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/skin-default-parity.test.ts
```

预期：3 个用例全部失败。

- [ ] **Step 3：`app/globals.css`** 在 `:root` 内 `--radius: 0.5rem;` 之后插入

```css
    --radius-control: calc(var(--radius) - 2px);
    --radius-float: calc(var(--radius) - 2px);
    --radius-card: var(--radius);
    --radius-item: calc(var(--radius) - 4px);
    --shadow-button: 0 0 #0000;
```

- [ ] **Step 4：`tailwind.config.js`** 在 `theme.extend.borderRadius` 内追加四项（保留已有 `lg/md/sm`），并在 `extend` 下新增 `boxShadow`

```js
borderRadius: {
  // 已有的 lg / md / sm 保持不变
  control: "var(--radius-control)",
  float: "var(--radius-float)",
  card: "var(--radius-card)",
  item: "var(--radius-item)",
},
boxShadow: {
  button: "var(--shadow-button)",
},
```

若 `extend` 里已有 `boxShadow`，则只追加 `button` 一项。

- [ ] **Step 5：替换 ui 组件中的圆角**（先 `Read` 各文件，再用下列命令；`rounded-b-lg` 不会被匹配，保持不动）

```bash
cd components/ui
perl -pi -e 's/rounded-md/rounded-control/g' button.tsx input.tsx
perl -pi -e 's/rounded-md/rounded-float/g' textarea.tsx popover.tsx tooltip.tsx hover-card.tsx dropdown-menu.tsx
perl -pi -e 's/rounded-md/rounded-control/ if $.==22; s/rounded-md/rounded-float/ if $.==43' select.tsx
perl -pi -e 's/rounded-sm/rounded-item/g' dialog.tsx dropdown-menu.tsx select.tsx sheet.tsx
perl -pi -e 's/rounded-lg/rounded-card/g' card.tsx
perl -pi -e 's/sm:rounded-lg/sm:rounded-card skin-modal/g' dialog.tsx
cd ../..
git diff --stat components/ui
```

预期：11 个文件中只有对应文件有变更；`select.tsx` 的第 22 行是 Trigger（control）、第 43 行是 Content（float）。如果行号因上游变动而偏移，按「Trigger → control，Content → float」人工判断后再改。

- [ ] **Step 5b：按钮深度阴影类**（`components/ui/button.tsx`，只改 `default` 与 `destructive` 两个 variant，其余不动）

```ts
default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-button btn-depth",
destructive:
  "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-button btn-depth",
```

默认皮肤下 `--shadow-button` 是 `0 0 #0000`、`.btn-depth` 没有任何定义，所以视觉不变。

- [ ] **Step 6：给 `tests/theme-tokens.test.ts` 的例外清单加入新 token**（第 36 行）

```ts
const NON_COLOR_EXCEPTIONS = [
  "--radius",
  "--radius-control",
  "--radius-float",
  "--radius-card",
  "--radius-item",
  "--shadow-button",
];
```

- [ ] **Step 7：运行并确认全绿**

```bash
npx vitest run tests/skin-default-parity.test.ts tests/theme-tokens.test.ts tests/no-light-only-colors.test.ts tests/components/dialog-a11y.test.ts
npx tsc --noEmit
```

预期：全部通过。

- [ ] **Step 8：提交**

```bash
git add app/globals.css tailwind.config.js components/ui tests/theme-tokens.test.ts tests/skin-default-parity.test.ts
git commit -m "feat(skin): add semantic radius and shadow tokens with legacy defaults"
```

## Task 2：皮肤存储 `lib/skin.ts` 与 hook `lib/use-skin.ts`

> 设计说明：服务端 layout 要导入 `SKIN_INIT_SCRIPT` 字符串，而 Next 不允许服务端模块图里出现 `useSyncExternalStore` / `usePathname` 这类客户端 hook 导入。所以把**纯函数 + 常量**放在无 `"use client"` 的 `lib/skin.ts`，把两个 hook 放在 `"use client"` 的 `lib/use-skin.ts`（相对 spec §7.6/§9 的小修正，Task 10 会回写 spec）。

**Files：** `lib/skin.ts`、`lib/use-skin.ts`、`tests/helpers/fake-storage.ts`、`tests/skin-store.test.ts`、`tests/skin-init-script.test.ts`

- [ ] **Step 1：写失败测试**

先写共享的假 `localStorage`（仓库既有测试已确认：Node 25 下 jsdom 的 `localStorage` 不可用，必须 `vi.stubGlobal`）：`tests/helpers/fake-storage.ts`

```ts
import { vi } from "vitest";

export function installFakeStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}
```

再写 `tests/skin-store.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SKIN_STORAGE_KEY,
  applySkinAttribute,
  effectiveSkin,
  getSkin,
  setSkin,
  subscribe,
} from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  document.documentElement.removeAttribute("data-skin");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("skin store", () => {
  it("defaults to 'default'", () => {
    expect(getSkin()).toBe("default");
  });

  it("round-trips a written value", () => {
    setSkin("island");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("island");
    expect(getSkin()).toBe("island");
    setSkin("default");
    expect(getSkin()).toBe("default");
  });

  it("treats an invalid stored value as 'default'", () => {
    storage.setItem(SKIN_STORAGE_KEY, "neon");
    expect(getSkin()).toBe("default");
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getSkin()).toBe("default");
    expect(() => setSkin("island")).not.toThrow();
  });

  it("notifies subscribers on setSkin and stops after unsubscribe", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    setSkin("island");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSkin("default");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on a cross-tab storage event for its key only", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    window.dispatchEvent(new StorageEvent("storage", { key: SKIN_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("forces the default skin on /admin and below, but not look-alikes", () => {
    expect(effectiveSkin("/admin", "island")).toBe("default");
    expect(effectiveSkin("/admin/update", "island")).toBe("default");
    expect(effectiveSkin("/adminfoo", "island")).toBe("island");
    expect(effectiveSkin("/", "island")).toBe("island");
    expect(effectiveSkin(null, "island")).toBe("island");
    expect(effectiveSkin("/", "default")).toBe("default");
  });

  it("applySkinAttribute sets and removes data-skin", () => {
    applySkinAttribute("island");
    expect(document.documentElement.getAttribute("data-skin")).toBe("island");
    applySkinAttribute("default");
    expect(document.documentElement.hasAttribute("data-skin")).toBe(false);
  });
});
```

`tests/skin-init-script.test.ts`

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SKIN_INIT_SCRIPT, SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const run = () => (0, eval)(SKIN_INIT_SCRIPT);
const attr = () => document.documentElement.getAttribute("data-skin");

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  document.documentElement.removeAttribute("data-skin");
  history.pushState({}, "", "/");
});

describe("SKIN_INIT_SCRIPT", () => {
  it("applies the island skin when stored", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    run();
    expect(attr()).toBe("island");
  });

  it.each([[""], ["default"], ["neon"]])("ignores %j", (value) => {
    if (value) storage.setItem(SKIN_STORAGE_KEY, value);
    run();
    expect(attr()).toBeNull();
  });

  it("does nothing on /admin paths", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    history.pushState({}, "", "/admin/update");
    run();
    expect(attr()).toBeNull();
  });

  it("still applies on look-alike paths such as /adminfoo", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    history.pushState({}, "", "/adminfoo");
    run();
    expect(attr()).toBe("island");
  });

  it("swallows storage errors", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(run).not.toThrow();
    expect(attr()).toBeNull();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2：运行确认失败**（模块不存在）

```bash
npx vitest run tests/skin-store.test.ts tests/skin-init-script.test.ts
```

- [ ] **Step 3：实现** `lib/skin.ts`（不要加 `"use client"`，不要 import react / next）

```ts
export type Skin = "default" | "island";

export const SKIN_STORAGE_KEY = "umeh-skin";

const listeners = new Set<() => void>();

function isSkin(value: unknown): value is Skin {
  return value === "default" || value === "island";
}

export function getSkin(): Skin {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(SKIN_STORAGE_KEY);
    return isSkin(stored) ? stored : "default";
  } catch {
    return "default";
  }
}

export function setSkin(skin: Skin): void {
  try {
    window.localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // 存储不可用时只丢持久化，不影响本次会话内的通知
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SKIN_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function effectiveSkin(pathname: string | null | undefined, chosen: Skin): Skin {
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return "default";
  return chosen;
}

export function applySkinAttribute(
  skin: Skin,
  root: HTMLElement = document.documentElement,
): void {
  if (skin === "island") root.setAttribute("data-skin", "island");
  else root.removeAttribute("data-skin");
}

export const SKIN_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(p==="/admin"||p.indexOf("/admin/")===0)return;if(localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY,
)})==="island")document.documentElement.setAttribute("data-skin","island")}catch(e){}})();`;
```

`lib/use-skin.ts`

```ts
"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { effectiveSkin, getSkin, subscribe, type Skin } from "@/lib/skin";

export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, getSkin, () => "default" as const);
}

export function useEffectiveSkin(): Skin {
  const chosen = useSkin();
  const pathname = usePathname();
  return effectiveSkin(pathname, chosen);
}
```

- [ ] **Step 4：运行确认全绿**

```bash
npx vitest run tests/skin-store.test.ts tests/skin-init-script.test.ts
npx tsc --noEmit
```

- [ ] **Step 5：提交**

```bash
git add lib/skin.ts lib/use-skin.ts tests/helpers/fake-storage.ts tests/skin-store.test.ts tests/skin-init-script.test.ts
git commit -m "feat(skin): add skin store, init script and hooks"
```

---

## Task 3：动物岛 token 文件 `app/skins/island.css` 与对比度测试（T1）

**Files：** `app/skins/island.css`、`tests/skin-tokens.test.ts`

- [ ] **Step 1：写失败测试** `tests/skin-tokens.test.ts`（自带 HSL → 亮度 → 对比度工具，不依赖别的测试文件）

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const island = readFileSync(join(root, "app/skins/island.css"), "utf8");
const globals = readFileSync(join(root, "app/globals.css"), "utf8");

function blockOf(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function tokensOf(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function rgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.split(/\s+/).map(parseFloat);
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const sector: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, b] = sector[Math.min(5, Math.floor(h / 60))];
  return [r + m, g + m, b + m];
}

function luminance(triple: string): number {
  const [r, g, b] = rgb(triple).map((k) =>
    k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "0 0% 100%";
const LIGHT = tokensOf(blockOf(island, 'html[data-skin="island"]'));
const DARK = tokensOf(blockOf(island, 'html[data-skin="island"].dark'));
const BASE_KEYS = [...tokensOf(blockOf(globals, ":root")).keys()].filter(
  (k) =>
    !["--radius", "--radius-control", "--radius-float", "--radius-card", "--radius-item", "--shadow-button"].includes(k),
);

const TEXT_PAIRS: [string, string][] = [
  ["--foreground", "--background"], ["--foreground", "--card"],
  ["--foreground", "--secondary"], ["--foreground", "--accent"],
  ["--card-foreground", "--card"], ["--popover-foreground", "--popover"],
  ["--secondary-foreground", "--secondary"], ["--accent-foreground", "--accent"],
  ["--muted-foreground", "--background"], ["--muted-foreground", "--card"],
  ["--muted-foreground", "--muted"], ["--muted-foreground", "--accent"],
  ["--primary-foreground", "--primary"],
  ["--destructive-foreground", "--destructive"],
  ["--destructive-strong", "--background"], ["--destructive-strong", "--card"],
  ["--brand", "--background"], ["--brand", "--card"],
  ["--brand-strong", "--background"], ["--brand-strong", "--card"],
  ["--brand-foreground", "--brand"],
  ["--success", "--background"], ["--success", "--card"],
  ["--warning", "--background"], ["--warning", "--card"],
  ["--wordmark-to", "--background"],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ["--subtle-foreground", "--background"], ["--subtle-foreground", "--card"],
  ["--ring", "--background"], ["--ring", "--card"],
  ["--brand-logo", "--background"],
  ["--grade-none-from", "--background"], ["--grade-none-to", "--background"],
  ["--grade-low-from", "--background"], ["--grade-low-to", "--background"],
  ["--grade-mid-from", "--background"], ["--grade-mid-to", "--background"],
  ["--grade-high-from", "--background"], ["--grade-high-to", "--background"],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
] as const)("island %s tokens", (_name, tokens) => {
  it("defines every color variable that :root defines", () => {
    const missing = BASE_KEYS.filter((k) => !tokens.has(k));
    expect(missing).toEqual([]);
  });

  it("keeps text pairs at >= 4.5:1", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      if (fg === "--brand-foreground" && _name === "dark") continue;
      expect(ratio(tokens.get(fg)!, tokens.get(bg)!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps subtle / ring / grade / logo pairs at >= 3:1", () => {
    for (const [fg, bg] of NON_TEXT_PAIRS) {
      expect(ratio(tokens.get(fg)!, tokens.get(bg)!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps literal white readable on the brand gradient ends", () => {
    for (const key of ["--brand-from", "--brand-to"]) {
      expect(ratio(WHITE, tokens.get(key)!), key).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("island structural tokens", () => {
  it("declares the pill / float / card / item radii and the button depth", () => {
    expect(LIGHT.get("--radius-control")).toBe("50px");
    expect(LIGHT.get("--radius-float")).toBe("16px");
    expect(LIGHT.get("--radius-card")).toBe("18px");
    expect(LIGHT.get("--radius-item")).toBe("12px");
    expect(LIGHT.get("--shadow-button")).toBe("0 4px 0 0 hsl(var(--button-depth))");
    expect(LIGHT.get("--button-depth")).toBe("172 42.9% 52%");
    expect(DARK.get("--button-depth")).toBe("174.1 64.4% 34.1%");
  });

  it("overrides the library font stack with !important and no Noto Sans SC", () => {
    expect(island).toMatch(/--animal-font-family:[^;]*var\(--font-nunito\)[^;]*!important;/);
    expect(island).not.toMatch(/Noto Sans SC/i);
  });
});
```

- [ ] **Step 2：运行确认失败**（文件不存在）

```bash
npx vitest run tests/skin-tokens.test.ts
```

- [ ] **Step 3：写 `app/skins/island.css`**（token 部分；规则部分在 Task 8 追加）

```css
/* animal-island skin — tokens. Light: html[data-skin="island"]; dark adds .dark. */
html[data-skin="island"] {
  --background: 60 36.4% 95.7%;
  --foreground: 29.3 51.2% 31.4%;
  --card: 45 100% 98.4%;
  --card-foreground: 29.3 51.2% 31.4%;
  --popover: 45 100% 98.4%;
  --popover-foreground: 29.3 51.2% 31.4%;
  --primary: 174.9 77.8% 44.1%;
  --primary-foreground: 30.9 42.2% 16.3%;
  --secondary: 40 44.4% 89.4%;
  --secondary-foreground: 29.3 51.2% 31.4%;
  --muted: 40 44.4% 89.4%;
  --muted-foreground: 33.2 21.6% 34.5%;
  --accent: 40 28.1% 87.5%;
  --accent-foreground: 29.3 51.2% 31.4%;
  --destructive: 0 55.2% 52.7%;
  --destructive-foreground: 45 100% 98.4%;
  --destructive-strong: 3.2 71.3% 41%;
  --border: 38.2 13.6% 84.1%;
  --input: 38.2 13.6% 84.1%;
  --ring: 174.5 81.8% 23.7%;
  --surface-subtle: 45 42.1% 92.5%;
  --surface-strong: 42.9 34.1% 83.9%;
  --subtle-foreground: 36.6 16.7% 48%;
  --border-subtle: 40 28.1% 87.5%;
  --border-strong: 29 18% 68.4%;
  --brand: 174.5 81.8% 23.7%;
  --brand-strong: 175.3 82.6% 18%;
  --brand-foreground: 45 100% 98.4%;
  --brand-from: 174.7 81.8% 21.6%;
  --brand-to: 174.2 79.2% 28.2%;
  --brand-logo: 174.5 81.8% 23.7%;
  --wordmark-from: 174.5 81.8% 23.7%;
  --wordmark-to: 29.3 51.2% 31.4%;
  --success: 88.1 78.3% 23.5%;
  --success-foreground: 45 100% 98.4%;
  --warning: 39.1 100% 27.1%;
  --grade-none-from: 36.6 16.7% 48%;
  --grade-none-to: 33.2 21.6% 34.5%;
  --grade-low-from: 3.2 71.3% 41%;
  --grade-low-to: 320.4 49.2% 36.3%;
  --grade-mid-from: 39.7 100% 29%;
  --grade-mid-to: 21.3 81.4% 38%;
  --grade-high-from: 88.1 78.3% 23.5%;
  --grade-high-to: 174.5 81.8% 23.7%;

  --radius-control: 50px;
  --radius-float: 16px;
  --radius-card: 18px;
  --radius-item: 12px;
  --button-depth: 172 42.9% 52%;
  --shadow-button: 0 4px 0 0 hsl(var(--button-depth));

  --animal-font-family: var(--font-nunito), "PingFang TC", "Noto Sans TC",
    "Microsoft JhengHei", system-ui, sans-serif !important;
}

html[data-skin="island"].dark {
  --background: 28.4 28.4% 13.1%;
  --foreground: 41.8 57.9% 88.8%;
  --card: 30 26.2% 16.5%;
  --card-foreground: 41.8 57.9% 88.8%;
  --popover: 30 26.2% 16.5%;
  --popover-foreground: 41.8 57.9% 88.8%;
  --primary: 174.4 63.7% 53.5%;
  --primary-foreground: 28.4 28.4% 13.1%;
  --secondary: 31.2 22.9% 21.4%;
  --secondary-foreground: 41.8 57.9% 88.8%;
  --muted: 31.2 22.9% 21.4%;
  --muted-foreground: 38.2 23.7% 63.5%;
  --accent: 32.1 23.3% 23.5%;
  --accent-foreground: 41.8 57.9% 88.8%;
  --destructive: 0 55.2% 52.7%;
  --destructive-foreground: 45 100% 98.4%;
  --destructive-strong: 4.8 81.2% 72.9%;
  --border: 34 23.4% 25.1%;
  --input: 34 23.4% 25.1%;
  --ring: 174.4 63.7% 53.5%;
  --surface-subtle: 28.6 27.3% 15.1%;
  --surface-strong: 32.1 23.3% 23.5%;
  --subtle-foreground: 37.1 17.2% 52.2%;
  --border-subtle: 31.3 24.7% 18.2%;
  --border-strong: 36.9 23.6% 32.4%;
  --brand: 174.4 63.7% 53.5%;
  --brand-strong: 173.6 67.3% 70%;
  --brand-foreground: 28.4 28.4% 13.1%;
  --brand-from: 174 80% 19.6%;
  --brand-to: 175.3 77.4% 26.1%;
  --brand-logo: 174.4 63.7% 53.5%;
  --wordmark-from: 174.4 63.7% 53.5%;
  --wordmark-to: 39.2 83.4% 71.6%;
  --success: 93.9 58.7% 59.2%;
  --success-foreground: 28.4 28.4% 13.1%;
  --warning: 46.2 91.6% 53.5%;
  --grade-none-from: 38.2 23.7% 63.5%;
  --grade-none-to: 37.1 17.2% 52.2%;
  --grade-low-from: 4.8 81.2% 72.9%;
  --grade-low-to: 322.3 58.1% 71%;
  --grade-mid-from: 46.2 91.6% 53.5%;
  --grade-mid-to: 31.8 90.2% 59.8%;
  --grade-high-from: 93.9 58.7% 59.2%;
  --grade-high-to: 174.4 63.7% 53.5%;

  --button-depth: 174.1 64.4% 34.1%;
}
```

- [ ] **Step 4：运行确认全绿**

```bash
npx vitest run tests/skin-tokens.test.ts
```

预期：全绿。若「defines every color variable」报缺项，对照 `app/globals.css` `:root` 补齐；若某对比度失败，**不要放宽断言**，回到 spec §5 调 token 并同步 spec。

- [ ] **Step 5：提交**

```bash
git add app/skins/island.css tests/skin-tokens.test.ts
git commit -m "feat(skin): add animal-island token sheet with contrast guard"
```

## Task 4：布局接线（内联脚本、字体、SkinDefs、SkinController）

**Files：** `components/skin-controller.tsx`、`components/skin-defs.tsx`、`app/layout.tsx`、`tests/components/skin-controller.test.tsx`、`tests/components/skin-defs.test.tsx`、`tests/skin-layout.test.ts`

- [ ] **Step 1：写失败测试**

`tests/components/skin-defs.test.tsx`

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SkinDefs } from "@/components/skin-defs";

describe("SkinDefs", () => {
  const html = renderToStaticMarkup(React.createElement(SkinDefs));

  it("renders an invisible svg that defines the modal clip path", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('id="island-modal-clip"');
    expect(html).toContain('clipPathUnits="objectBoundingBox"');
  });

  it("uses the same blob outline as the library modal", () => {
    expect(html).toContain("M0.501,0.005 L0.501,0.005 L0.523,0.005");
    expect(html).toContain("C-0.006,0.365,-0.002,0.254,0.024,0.17");
  });
});
```

`tests/components/skin-controller.test.tsx`

```tsx
// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { SkinController } from "@/components/skin-controller";
import { SKIN_STORAGE_KEY, setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const attr = () => document.documentElement.getAttribute("data-skin");

beforeEach(() => {
  installFakeStorage().setItem(SKIN_STORAGE_KEY, "island");
  usePathnameMock.mockReturnValue("/");
  document.documentElement.removeAttribute("data-skin");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkinController", () => {
  it("writes the stored skin onto <html>", () => {
    render(React.createElement(SkinController));
    expect(attr()).toBe("island");
  });

  it("follows later setSkin calls", () => {
    render(React.createElement(SkinController));
    act(() => setSkin("default"));
    expect(attr()).toBeNull();
    act(() => setSkin("island"));
    expect(attr()).toBe("island");
  });

  it("clears the attribute on /admin and restores it on public pages", () => {
    usePathnameMock.mockReturnValue("/admin/update");
    const view = render(React.createElement(SkinController));
    expect(attr()).toBeNull();
    usePathnameMock.mockReturnValue("/review");
    view.rerender(React.createElement(SkinController));
    expect(attr()).toBe("island");
  });
});
```

`tests/skin-layout.test.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("root layout skin wiring", () => {
  const layout = read("app/layout.tsx");

  it("loads the island token sheet after globals.css", () => {
    const globals = layout.indexOf("'./globals.css'");
    const island = layout.indexOf("'./skins/island.css'");
    expect(globals).toBeGreaterThanOrEqual(0);
    expect(island).toBeGreaterThan(globals);
  });

  it("runs the blocking init script inside <head>", () => {
    const head = layout.indexOf("<head>");
    const script = layout.indexOf("__html: SKIN_INIT_SCRIPT");
    const headClose = layout.indexOf("</head>");
    expect(layout).toMatch(/<script\s+dangerouslySetInnerHTML=\{\{\s*__html:\s*SKIN_INIT_SCRIPT\s*\}\}\s*\/>/);
    expect(script).toBeGreaterThan(head);
    expect(layout.lastIndexOf("SKIN_INIT_SCRIPT")).toBeLessThan(headClose);
  });

  it("puts the Nunito variable on <html> without preloading it", () => {
    expect(layout).toMatch(/Nunito\(\{[^}]*preload:\s*false[^}]*\}\)/s);
    expect(layout).toContain("variable: '--font-nunito'");
    expect(layout).toMatch(/<html[^>]*className=\{nunito\.variable\}/);
  });

  it("mounts the clip path defs and the controller inside the theme provider", () => {
    const open = layout.indexOf("<ThemeProvider>");
    const close = layout.indexOf("</ThemeProvider>");
    const controller = layout.indexOf("<SkinController />");
    expect(layout).toContain("<SkinDefs />");
    expect(controller).toBeGreaterThan(open);
    expect(controller).toBeLessThan(close);
  });

  it("keeps lib/skin.ts importable from server components", () => {
    const skin = read("lib/skin.ts");
    expect(skin).not.toMatch(/["']use client["']/);
    expect(skin).not.toMatch(/from ["'](react|next\/[^"']+)["']/);
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/components/skin-defs.test.tsx tests/components/skin-controller.test.tsx tests/skin-layout.test.ts
```

- [ ] **Step 3：实现组件**

`components/skin-defs.tsx`（服务端组件；路径与库 `Modal` 的 `animal-modal-clip` 完全一致，只是 id 改成 `island-modal-clip`。svg 不能用 `display:none`，否则 `clip-path: url()` 失效）

```tsx
export function SkinDefs() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0 }}>
      <clipPath id="island-modal-clip" clipPathUnits="objectBoundingBox">
        <path d="M0.501,0.005 L0.501,0.005 L0.523,0.005 L0.549,0.006 C0.704,0.01,0.796,0.017,0.825,0.027 L0.827,0.028 C0.872,0.045,0.939,0.044,0.978,0.17 C1,0.254,1,0.365,0.99,0.505 L0.988,0.513 C0.979,0.558,0.971,0.598,0.965,0.633 C0.956,0.689,0.979,0.77,0.964,0.865 C0.953,0.928,0.921,0.966,0.869,0.979 C0.821,0.986,0.773,0.992,0.726,0.995 L0.712,0.996 L0.694,0.997 C0.648,1,0.586,1,0.507,1 L0.501,1 L0.464,1 C0.385,1,0.325,0.998,0.283,0.995 C0.234,0.992,0.184,0.987,0.133,0.979 C0.081,0.966,0.05,0.928,0.039,0.865 C0.023,0.77,0.047,0.689,0.037,0.633 C0.031,0.595,0.023,0.552,0.013,0.505 C-0.006,0.365,-0.002,0.254,0.024,0.17 C0.064,0.045,0.13,0.045,0.174,0.028 L0.175,0.028 C0.204,0.017,0.303,0.009,0.474,0.005 L0.501,0.005" />
      </clipPath>
    </svg>
  );
}
```

`components/skin-controller.tsx`（只在 effect 里写属性，**不要**用服务端快照 hook，否则 hydration 期间会把内联脚本写好的属性清掉）

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { applySkinAttribute, effectiveSkin, getSkin, subscribe } from "@/lib/skin";

export function SkinController() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => applySkinAttribute(effectiveSkin(pathname, getSkin()));
    apply();
    return subscribe(apply);
  }, [pathname]);

  return null;
}
```

- [ ] **Step 4：改 `app/layout.tsx`**（先 `Read`，下列 6 处逐一修改）

1. 样式导入：在 `import './globals.css'` 之后加 `import './skins/island.css'`。
2. 字体导入与实例：

```tsx
import { Inter, Dancing_Script, Nunito } from 'next/font/google'
// ...
// 动物岛皮肤的字体：preload:false 使其不进入每个页面的 <link rel=preload>，只有动物岛用户会下载
const nunito = Nunito({
    subsets: ['latin'],
    display: 'swap',
    preload: false,
    variable: '--font-nunito',
})
```

3. 组件导入：

```tsx
import { SKIN_INIT_SCRIPT } from '@/lib/skin';
import { SkinController } from '@/components/skin-controller';
import { SkinDefs } from '@/components/skin-defs';
```

4. `<html>`：变量类必须放在 `<html>` 上（island.css 在 `html[data-skin]` 上用 `var(--font-nunito)` 定义 `--animal-font-family`，放在 `<body>` 上会解析为空）。

```tsx
<html lang="zh-Hant" className={nunito.variable} suppressHydrationWarning>
```

5. `<head>` 的第一个子元素（在 GTM 之前，必须是同步内联 `<script>`，**不要**用 `next/script`）：

```tsx
<script dangerouslySetInnerHTML={{ __html: SKIN_INIT_SCRIPT }} />
```

6. `<body>`：先放 `<SkinDefs />`（在 `<ThemeProvider>` 之前），再在 `<ThemeColorMeta />` 之后紧跟 `<SkinController />`。

- [ ] **Step 5：运行测试、类型、构建**

```bash
npx vitest run tests/components/skin-defs.test.tsx tests/components/skin-controller.test.tsx tests/skin-layout.test.ts tests/components/theme-color-meta.test.tsx tests/theme-mounts.test.ts
npx tsc --noEmit
npm run build 2>&1 | tail -25
```

预期：全部通过；构建无「server component imports client hook」之类错误（这正是 `lib/skin.ts` 与 `lib/use-skin.ts` 拆开的原因）。

- [ ] **Step 6：冒烟**（`npm run dev`，用浏览器工具打开 `http://localhost:3000`）

在控制台执行 `localStorage.setItem("umeh-skin","island")` 后刷新：`document.documentElement.dataset.skin === "island"`，`getComputedStyle(document.body).backgroundColor` 为 `rgb(248, 248, 240)`；`/admin` 下无 `data-skin`。

- [ ] **Step 7：提交**

```bash
git add components/skin-controller.tsx components/skin-defs.tsx app/layout.tsx tests/components/skin-controller.test.tsx tests/components/skin-defs.test.tsx tests/skin-layout.test.ts
git commit -m "feat(skin): wire the skin attribute, font and clip path into the root layout"
```

---

## Task 5：切换入口、主题图标与 `theme-color`

**Files：** `components/skin-switcher.tsx`、`components/navbar.tsx`、`components/mobile-sidebar.tsx`、`components/theme-toggle.tsx`、`components/theme-color-meta.tsx`、`tests/components/skin-switcher.test.tsx`、`tests/components/theme-toggle-skin.test.tsx`、`tests/components/theme-color-meta.test.tsx`、`tests/theme-mounts.test.ts`

- [ ] **Step 1：写失败测试**

`tests/components/skin-switcher.test.tsx`

```tsx
// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SkinOptions, SkinSwitcher } from "@/components/skin-switcher";
import { SKIN_STORAGE_KEY, getSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  storage = installFakeStorage();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkinOptions", () => {
  it("renders a radiogroup with both skins and no selection before mount", () => {
    const html = renderToStaticMarkup(React.createElement(SkinOptions));
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Skin"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-checked="true"');
  });

  it("marks the stored skin after mount and persists a new choice", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(SkinOptions));
    const radios = [...view.container.querySelectorAll("[role='radio']")];
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);

    fireEvent.click(radios[0]);
    expect(getSkin()).toBe("default");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("default");
    expect(
      [...view.container.querySelectorAll("[role='radio']")].map((r) => r.getAttribute("aria-checked")),
    ).toEqual(["true", "false"]);
  });
});

describe("SkinSwitcher", () => {
  it("renders a labelled trigger with a currentColor tree icon", () => {
    const view = render(React.createElement(SkinSwitcher));
    const trigger = screen.getByRole("button", { name: "Skin" });
    expect(trigger.querySelector("svg")?.outerHTML).toContain("currentColor");
    expect(view.container.querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("opens with the keyboard and switches skin", () => {
    render(React.createElement(SkinSwitcher));
    const trigger = screen.getByRole("button", { name: "Skin" });
    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
    });
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["紙本 Paper", "卡通 Cartoon"]);
    fireEvent.click(items[1]);
    expect(getSkin()).toBe("island");
  });
});
```

`tests/components/theme-toggle-skin.test.tsx`

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: useThemeMock }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { ThemeOptions, ThemeToggle } from "@/components/theme-toggle";
import { SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  useThemeMock.mockReturnValue({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeToggle skin icons", () => {
  it("keeps the lucide icon on the default skin", () => {
    const view = render(React.createElement(ThemeToggle));
    expect(view.container.querySelector("svg.lucide")).not.toBeNull();
    expect(view.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("swaps to the naive icon on the island skin and keeps the label", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(ThemeToggle));
    expect(view.container.querySelector("svg.lucide")).toBeNull();
    const svg = view.container.querySelector("button svg");
    expect(svg?.outerHTML).toContain("currentColor");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(view.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("uses 20px naive icons in the mobile options on the island skin", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = render(React.createElement(ThemeOptions));
    const svgs = [...view.container.querySelectorAll("button svg")];
    expect(svgs).toHaveLength(2);
    expect(svgs.every((s) => s.getAttribute("width") === "20")).toBe(true);
    expect(view.container.querySelector("svg.lucide")).toBeNull();
  });
});
```

扩展 `tests/components/theme-color-meta.test.tsx`：

1. 把 hoist 改成 `const { useThemeMock, useEffectiveSkinMock } = vi.hoisted(() => ({ useThemeMock: vi.fn(), useEffectiveSkinMock: vi.fn() }));`，并在 `vi.mock("next-themes", …)` 下加 `vi.mock("@/lib/use-skin", () => ({ useEffectiveSkin: useEffectiveSkinMock }));`
2. 从 vitest 导入里加 `beforeEach`，并加 `beforeEach(() => useEffectiveSkinMock.mockReturnValue("default"));`
3. 在 `describe("ThemeColorMeta", …)` 内追加：

```tsx
  it.each([
    ["default", "light", "#FFFFFF"],
    ["default", "dark", "#020817"],
    ["island", "light", "#F8F8F0"],
    ["island", "dark", "#171F1E"],
  ])("uses the %s skin %s surface color %s", (skin, mode, expected) => {
    const meta = ensureMeta();
    useEffectiveSkinMock.mockReturnValue(skin);
    useThemeMock.mockReturnValue({ theme: mode, resolvedTheme: mode });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe(expected);
  });
```

扩展 `tests/theme-mounts.test.ts`，在 `describe` 内追加：

```ts
  it("mounts the skin switcher next to the theme toggle in the navbar", () => {
    const navbar = read("components/navbar.tsx");
    expect(navbar).toContain('from "@/components/skin-switcher"');
    expect(navbar).toContain("<SkinSwitcher />");
    expect(navbar.indexOf("<ThemeToggle />")).toBeLessThan(navbar.indexOf("<SkinSwitcher />"));
  });

  it("mounts the skin options below the theme options in the mobile sidebar", () => {
    const sidebar = read("components/mobile-sidebar.tsx");
    expect(sidebar).toContain('from "@/components/skin-switcher"');
    expect(sidebar).toContain("<SkinOptions />");
    expect(sidebar.indexOf("<ThemeOptions />")).toBeLessThan(sidebar.indexOf("<SkinOptions />"));
  });
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/components/skin-switcher.test.tsx tests/components/theme-toggle-skin.test.tsx tests/components/theme-color-meta.test.tsx tests/theme-mounts.test.ts
```

- [ ] **Step 3：实现 `components/skin-switcher.tsx`**

```tsx
"use client";

import { TreeIcon } from "naive-icons";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setSkin, type Skin } from "@/lib/skin";
import { useSkin } from "@/lib/use-skin";
import { cn } from "@/lib/utils";

export const SKIN_OPTIONS: { value: Skin; label: string }[] = [
  { value: "default", label: "紙本 Paper" },
  { value: "island", label: "卡通 Cartoon" },
];

// 与 ThemeOptions 一致：挂载前一律按「未选中」渲染，避免 hydration 期间高亮错误的项
function useMountedSkin(): Skin | undefined {
  const skin = useSkin();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? skin : undefined;
}

export function SkinSwitcher() {
  const skin = useMountedSkin();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center outline-none" aria-label="Skin">
          <TreeIcon size={24} color="currentColor" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={skin ?? ""} onValueChange={(value) => setSkin(value as Skin)}>
          {SKIN_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkinOptions({ className }: { className?: string }) {
  const skin = useMountedSkin();

  return (
    <div role="radiogroup" aria-label="Skin" className={cn("flex flex-col gap-1", className)}>
      {SKIN_OPTIONS.map(({ value, label }) => {
        const active = skin === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSkin(value)}
            className={cn(
              "flex items-center gap-2 rounded-item px-2 py-2 text-left text-sm text-foreground hover:bg-accent",
              active && "bg-accent font-medium text-brand-strong",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4：接入导航栏与移动侧边栏**

`components/navbar.tsx`：加 `import { SkinSwitcher } from "@/components/skin-switcher";`，并在 `<ThemeToggle />` 之后加一行 `<SkinSwitcher />`。

`components/mobile-sidebar.tsx`：加 `import { SkinOptions } from "@/components/skin-switcher";`，在 `<ThemeOptions />` 之后、同一个 `px-4 pt-6` 容器内追加：

```tsx
                        <div className="px-1 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Skin
                        </div>
                        <SkinOptions />
```

- [ ] **Step 5：`components/theme-toggle.tsx` 在动物岛下换 naive 图标**

1. 导入：`import { MoonIcon, SunIcon } from "naive-icons";` 与 `import { useEffectiveSkin } from "@/lib/use-skin";`
2. `ThemeOptions` 内：`const skin = useEffectiveSkin();`，`const island = mounted && skin === "island";`；把 `<Icon size={18} strokeWidth={2} />` 换成

```tsx
{island ? (
  value === "light" ? <SunIcon size={20} color="currentColor" /> : <MoonIcon size={20} color="currentColor" />
) : (
  <Icon size={18} strokeWidth={2} />
)}
```

3. `ThemeToggle` 内：`const skin = useEffectiveSkin();` 放在 `useState` 之后（hook 不能在 early return 之后）；`<Icon size={20} strokeWidth={2} />` 换成

```tsx
{skin === "island" ? (
  isDark ? <MoonIcon size={24} color="currentColor" /> : <SunIcon size={24} color="currentColor" />
) : (
  <Icon size={20} strokeWidth={2} />
)}
```

（`ThemeToggle` 的 `!mounted` 早返回之后才渲染按钮，所以这里的 `skin` 已经是客户端真实值，无需再叠加 mounted 守卫。）

- [ ] **Step 6：`components/theme-color-meta.tsx`**

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { useEffectiveSkin } from "@/lib/use-skin";

const COLORS = {
  default: { light: "#FFFFFF", dark: "#020817" },
  island: { light: "#F8F8F0", dark: "#171F1E" },
} as const;

/**
 * 直接改写 head 里那枚静态 meta，而不是用 React 渲染 meta：
 * 不依赖 React 的 head 提升行为，也不会产生重复 meta。
 * enableSystem 时 next-themes 已把系统偏好解析进 resolvedTheme，
 * 因此 system 模式天然跟随，无需自己订阅 matchMedia。
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();
  const skin = useEffectiveSkin();

  useEffect(() => {
    const meta = document.querySelector("meta[name='theme-color']");
    if (!meta) return;
    meta.setAttribute("content", COLORS[skin][resolvedTheme === "dark" ? "dark" : "light"]);
  }, [resolvedTheme, skin]);

  return null;
}
```

- [ ] **Step 7：运行并确认全绿**

```bash
npx vitest run tests/components/skin-switcher.test.tsx tests/components/theme-toggle-skin.test.tsx tests/components/theme-toggle.test.tsx tests/components/theme-color-meta.test.tsx tests/theme-mounts.test.ts tests/no-light-only-colors.test.ts
npx tsc --noEmit
```

若 `skin-switcher` 的键盘开菜单用例在 jsdom 下打不开（Radix 需要 `PointerEvent` 相关 API），在该用例里改用 `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })`；仍不行则把该用例降级为只断言触发器与图标，菜单行为留给 Task 10 的浏览器验证。

- [ ] **Step 8：提交**

```bash
git add components/skin-switcher.tsx components/navbar.tsx components/mobile-sidebar.tsx components/theme-toggle.tsx components/theme-color-meta.tsx tests/components/skin-switcher.test.tsx tests/components/theme-toggle-skin.test.tsx tests/components/theme-color-meta.test.tsx tests/theme-mounts.test.ts
git commit -m "feat(skin): add the skin switcher, island theme icons and skin-aware theme-color"
```

## Task 6：通知门面 `lib/notify.ts` 与 7 个公开页文件迁移

> 设计要点：
> - 默认路径把参数**原样**透传给 sonner（用 rest 参数，不补 `undefined`），这样 `share-dialog` / `review-notice` / `add-to-timetable` 里既有的 sonner mock 断言不用改。
> - 动物岛路径只转发 `description` 与 `duration`（毫秒 → 秒），且**不传值为 `undefined` 的键**，避免覆盖库的默认 4.5s。
> - 带 `toasterId` 的调用（`review-notice` 的 `admin_notice`）永远走 sonner，保留那只专用 Toaster。
> - 裸调用 `toast(node, opts)`（`comment-card` 里的「请先登录」，节点里有 Clerk 的 `SignInButton`）永远走 sonner，因为库的 Notification 挂在独立的 React root，拿不到 Clerk context。
> - 按**有效皮肤**（`effectiveSkin(location.pathname, getSkin())`）路由，且 `notifier` 非空才走库；库没加载完时回落 sonner，不丢提示。

**Files：** `lib/notify.ts`、7 个公开页文件、`tests/notify.test.ts`、`tests/no-sonner-in-public.test.ts`

- [ ] **Step 1：写失败测试** `tests/notify.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sonner } = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  });
  return { sonner: fn };
});
vi.mock("sonner", () => ({ toast: sonner }));

import { setNotifier, toast } from "@/lib/notify";
import { SKIN_STORAGE_KEY } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

function makeNotifier() {
  return {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    open: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Parameters<typeof setNotifier>[0] & Record<string, ReturnType<typeof vi.fn>>;
}

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  history.pushState({}, "", "/");
});
afterEach(() => {
  setNotifier(null);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("notify facade — default path", () => {
  it("forwards arguments to sonner unchanged", () => {
    toast.success("a");
    expect(sonner.success).toHaveBeenLastCalledWith("a");
    toast.error("b", { description: "d", duration: 10000, toasterId: "admin_notice" });
    expect(sonner.error).toHaveBeenLastCalledWith("b", {
      description: "d",
      duration: 10000,
      toasterId: "admin_notice",
    });
    toast.info("c");
    expect(sonner.info).toHaveBeenLastCalledWith("c");
  });

  it("forwards promise() to sonner with the same promise and messages", () => {
    const p = Promise.resolve(1);
    const msgs = { loading: "l", success: "s", error: "e" };
    toast.promise(p, msgs);
    expect(sonner.promise).toHaveBeenCalledWith(p, msgs);
  });

  it("falls back to sonner when the library is not loaded yet", () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
  });
});

describe("notify facade — island path", () => {
  beforeEach(() => storage.setItem(SKIN_STORAGE_KEY, "island"));

  it("routes success / error / info to the library and converts ms to seconds", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.success("a");
    toast.error("b", { description: "d", duration: 2000 });
    toast.info("c");
    expect(n!.success).toHaveBeenCalledWith({ message: "a" });
    expect(n!.error).toHaveBeenCalledWith({ message: "b", description: "d", duration: 2 });
    expect(n!.info).toHaveBeenCalledWith({ message: "c" });
    expect(sonner.success).not.toHaveBeenCalled();
    expect(sonner.error).not.toHaveBeenCalled();
  });

  it("does not pass undefined keys (they would override the default duration)", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.success("a", { description: undefined });
    const config = (n!.success as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(config)).toEqual(["message"]);
  });

  it("keeps toasterId calls and bare calls on sonner", () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.error("x", { toasterId: "admin_notice" });
    expect(sonner.error).toHaveBeenCalledTimes(1);
    expect(n!.error).not.toHaveBeenCalled();

    const node = "node";
    toast(node, { duration: 1 });
    expect(sonner).toHaveBeenCalledWith(node, { duration: 1 });
  });

  it("uses sonner on /admin even if island is chosen", () => {
    const n = makeNotifier();
    setNotifier(n);
    history.pushState({}, "", "/admin/update");
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
    expect(n!.success).not.toHaveBeenCalled();
  });

  it("goes back to sonner after setNotifier(null)", () => {
    setNotifier(makeNotifier());
    setNotifier(null);
    toast.success("a");
    expect(sonner.success).toHaveBeenCalledTimes(1);
  });

  it("promise(): one key, loading first, then updated in place on success", async () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.promise(Promise.resolve(7), {
      loading: "Voting...",
      success: (v: number) => `done ${v}`,
      error: "bad",
    });
    const loading = (n!.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loading).toMatchObject({ message: "Voting...", duration: 0 });
    await Promise.resolve();
    await Promise.resolve();
    const ok = (n!.success as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ok).toMatchObject({ message: "done 7", key: loading.key });
    expect(sonner.promise).not.toHaveBeenCalled();
  });

  it("promise(): updates the same key with the error message on rejection", async () => {
    const n = makeNotifier();
    setNotifier(n);
    toast.promise(Promise.reject(new Error("boom")), {
      loading: "Submiting...",
      success: "ok",
      error: (e: unknown) => (e instanceof Error ? e.message : "Error"),
    });
    const loading = (n!.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await new Promise((r) => setTimeout(r, 0));
    const failed = (n!.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(failed).toMatchObject({ message: "boom", key: loading.key });
  });
});
```

`tests/no-sonner-in-public.test.ts`

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SONNER = /from\s+["']sonner["']/;
const FACADE = /from\s+["']@\/lib\/notify["']/;

const PUBLIC = [
  "components/report-dialog.tsx",
  "components/review-notice.tsx",
  "components/timetable-schedule-card.tsx",
  "components/submit/submit-comment-form.tsx",
  "components/review/comment-card.tsx",
  "components/timetable/share-dialog.tsx",
  "components/timetable/planner-sidebar.tsx",
];

const ADMIN = [
  "app/admin/update/update-client.tsx",
  ...readdirSync(join(process.cwd(), "components/admin"))
    .filter((f) => /^admin-.*-client\.tsx$/.test(f))
    .map((f) => `components/admin/${f}`),
];

describe("toast routing boundaries", () => {
  it.each(PUBLIC)("%s goes through the notify facade", (file) => {
    const src = read(file);
    expect(src).toMatch(FACADE);
    expect(src).not.toMatch(SONNER);
  });

  it("covers the five admin client components plus the update client", () => {
    expect(ADMIN).toHaveLength(6);
  });

  it.each(ADMIN)("%s keeps using sonner directly", (file) => {
    const src = read(file);
    expect(src).toMatch(SONNER);
    expect(src).not.toMatch(FACADE);
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/notify.test.ts tests/no-sonner-in-public.test.ts
```

- [ ] **Step 3：实现 `lib/notify.ts`**

```ts
import type { NotificationConfig, NotificationStatic } from "animal-island-ui";
import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

import { effectiveSkin, getSkin } from "@/lib/skin";

export interface NotifyOptions {
  description?: ReactNode;
  /** 毫秒，与 sonner 一致；转给库时换算成秒 */
  duration?: number;
  toasterId?: string;
}

type Kind = "success" | "error" | "info";
type Args = [message: ReactNode, options?: NotifyOptions];

interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}

let notifier: NotificationStatic | null = null;
let promiseSeq = 0;

export function setNotifier(next: NotificationStatic | null): void {
  notifier = next;
}

function activeNotifier(): NotificationStatic | null {
  if (!notifier || typeof window === "undefined") return null;
  return effectiveSkin(window.location.pathname, getSkin()) === "island" ? notifier : null;
}

function emit(kind: Kind, args: Args): void {
  const [message, options] = args;
  const island = options?.toasterId ? null : activeNotifier();
  if (!island) {
    sonner[kind](...args);
    return;
  }
  const config: NotificationConfig = { message };
  if (options?.description !== undefined) config.description = options.description;
  if (options?.duration !== undefined) config.duration = options.duration / 1000;
  island[kind](config);
}

function promise<T>(p: Promise<T>, messages: PromiseMessages<T>) {
  const island = activeNotifier();
  if (!island) return sonner.promise(p, messages);

  const key = `notify-promise-${++promiseSeq}`;
  island.info({ key, message: messages.loading, duration: 0 });
  p.then(
    (value) => {
      const { success } = messages;
      island.success({ key, message: typeof success === "function" ? success(value) : success });
    },
    (error: unknown) => {
      const { error: fail } = messages;
      island.error({ key, message: typeof fail === "function" ? fail(error) : fail });
    },
  );
  return undefined;
}

function bare(...args: Parameters<typeof sonner>) {
  return sonner(...args);
}

export const toast = Object.assign(bare, {
  success: (...args: Args) => emit("success", args),
  error: (...args: Args) => emit("error", args),
  info: (...args: Args) => emit("info", args),
  promise,
});
```

- [ ] **Step 4：迁移 7 个公开页文件的 import**

```bash
perl -pi -e 's#from "sonner"#from "\@/lib/notify"#' \
  components/report-dialog.tsx components/review-notice.tsx components/timetable-schedule-card.tsx \
  components/submit/submit-comment-form.tsx components/review/comment-card.tsx \
  components/timetable/share-dialog.tsx components/timetable/planner-sidebar.tsx
git diff --stat
grep -rn 'from "sonner"' components app --include='*.tsx' | sort
```

预期：`git diff --stat` 只改 7 个文件各 1 行；`grep` 只剩 6 个 admin 文件与 `components/ui/sonner.tsx`。

- [ ] **Step 5：运行并确认全绿（含三个 mock 了 sonner 的既有测试）**

```bash
npx vitest run tests/notify.test.ts tests/no-sonner-in-public.test.ts tests/components/share-dialog.test.tsx tests/components/review-notice.test.tsx tests/components/add-to-timetable.test.tsx tests/components/report-dialog.test.tsx
npx tsc --noEmit
```

若 tsc 在 `sonner[kind](...args)` 或 `sonner.promise(p, messages)` 上抱怨类型，把 `Args` 收窄到 sonner 的 `ExternalToast`（`import type { ExternalToast } from "sonner"` 并令 `options?: NotifyOptions & ExternalToast`），不要用 `any`。

- [ ] **Step 6：提交**

```bash
git add lib/notify.ts tests/notify.test.ts tests/no-sonner-in-public.test.ts components/report-dialog.tsx components/review-notice.tsx components/timetable-schedule-card.tsx components/submit/submit-comment-form.tsx components/review/comment-card.tsx components/timetable/share-dialog.tsx components/timetable/planner-sidebar.tsx
git commit -m "feat(skin): route public toasts through a skin-aware notify facade"
```

---

## Task 7：`IslandLayer`（懒加载库、光标、BackTop、背景、Notification）

**Files：** `components/island-layer.tsx`、`app/layout.tsx`、`tests/components/island-layer.test.tsx`

- [ ] **Step 1：写失败测试** `tests/components/island-layer.test.tsx`

```tsx
// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadIslandMock, setNotifierMock, useThemeMock, usePathnameMock, notification } = vi.hoisted(() => ({
  loadIslandMock: vi.fn(),
  setNotifierMock: vi.fn(),
  useThemeMock: vi.fn(),
  usePathnameMock: vi.fn(),
  notification: { destroy: vi.fn() },
}));

vi.mock("@/lib/island-loader", () => ({ loadIsland: loadIslandMock }));
vi.mock("@/lib/notify", () => ({ setNotifier: setNotifierMock }));
vi.mock("next-themes", () => ({ useTheme: useThemeMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { IslandLayer } from "@/components/island-layer";
import { SKIN_STORAGE_KEY, setSkin } from "@/lib/skin";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const fakeLib = {
  Notification: notification,
  BackTop: () => React.createElement("div", { "data-testid": "backtop" }),
  Background: () => React.createElement("div", { "data-testid": "background" }),
};

function setViewport(wide: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

async function mount() {
  const view = render(React.createElement(IslandLayer));
  await act(async () => {});
  return view;
}

let storage: ReturnType<typeof installFakeStorage>;

beforeEach(() => {
  storage = installFakeStorage();
  loadIslandMock.mockResolvedValue(fakeLib);
  usePathnameMock.mockReturnValue("/");
  useThemeMock.mockReturnValue({ resolvedTheme: "light" });
  setViewport(true);
  document.body.className = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("IslandLayer", () => {
  it("does nothing on the default skin — the library is never imported", async () => {
    const view = await mount();
    expect(loadIslandMock).not.toHaveBeenCalled();
    expect(view.container.innerHTML).toBe("");
    expect(document.body.classList.contains("animal-cursor")).toBe(false);
  });

  it("loads the library on island: cursor classes, notifier and BackTop", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = await mount();
    expect(loadIslandMock).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains("animal-cursor")).toBe(true);
    expect(document.body.classList.contains("animal-cursor--force")).toBe(true);
    expect(setNotifierMock).toHaveBeenCalledWith(notification);
    expect(view.queryByTestId("backtop")).not.toBeNull();
  });

  it("tears everything down when switching back to default", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    const view = await mount();
    await act(async () => setSkin("default"));
    expect(document.body.classList.contains("animal-cursor")).toBe(false);
    expect(document.body.classList.contains("animal-cursor--force")).toBe(false);
    expect(setNotifierMock).toHaveBeenLastCalledWith(null);
    expect(notification.destroy).toHaveBeenCalled();
    expect(view.queryByTestId("backtop")).toBeNull();
  });

  it("stays inactive on /admin even when island is chosen", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    usePathnameMock.mockReturnValue("/admin/update");
    await mount();
    expect(loadIslandMock).not.toHaveBeenCalled();
  });

  it.each([
    ["light", true, true],
    ["dark", true, false],
    ["light", false, false],
  ])("background: theme=%s wide=%s → rendered=%s", async (theme, wide, shown) => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    useThemeMock.mockReturnValue({ resolvedTheme: theme });
    setViewport(wide);
    const view = await mount();
    expect(view.queryByTestId("background") !== null).toBe(shown);
  });

  it("survives a failed library load", async () => {
    storage.setItem(SKIN_STORAGE_KEY, "island");
    loadIslandMock.mockRejectedValue(new Error("chunk failed"));
    const view = await mount();
    expect(view.container.innerHTML).toBe("");
    expect(setNotifierMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/components/island-layer.test.tsx
```

- [ ] **Step 3：实现 `components/island-layer.tsx`**

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { loadIsland } from "@/lib/island-loader";
import { setNotifier } from "@/lib/notify";
import { useEffectiveSkin } from "@/lib/use-skin";

type Island = Awaited<ReturnType<typeof loadIsland>>;

export function IslandLayer() {
  const active = useEffectiveSkin() === "island";
  const { resolvedTheme } = useTheme();
  const [lib, setLib] = useState<Island | null>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadIsland()
      .then((mod) => {
        if (!cancelled) setLib(mod);
      })
      .catch(() => {
        // 库加载失败时保持仅 token 皮肤；通知继续回落 sonner
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !lib) return;
    setNotifier(lib.Notification);
    document.body.classList.add("animal-cursor", "animal-cursor--force");
    return () => {
      setNotifier(null);
      lib.Notification.destroy();
      document.body.classList.remove("animal-cursor", "animal-cursor--force");
    };
  }, [active, lib]);

  useEffect(() => {
    if (!active) return;
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [active]);

  if (!active || !lib) return null;

  const { BackTop, Background } = lib;
  return (
    <>
      <BackTop />
      {wide && resolvedTheme !== "dark" ? (
        <Background
          type="default"
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", opacity: 0.5 }}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4：挂到 `app/layout.tsx`**：`import { IslandLayer } from '@/components/island-layer';`，并在 `<SkinController />` 之后紧跟 `<IslandLayer />`（仍在 `<ThemeProvider>` 内，因为要用 `useTheme`）。在 `tests/skin-layout.test.ts` 的 provider 用例里补一行断言：

```ts
    const island = layout.indexOf("<IslandLayer />");
    expect(island).toBeGreaterThan(controller);
    expect(island).toBeLessThan(close);
```

- [ ] **Step 5：运行并确认全绿**

```bash
npx vitest run tests/components/island-layer.test.tsx tests/skin-layout.test.ts
npx tsc --noEmit
```

- [ ] **Step 6：BackTop 与 FloatingPlanner 位置核对（风险 R5）**：`FloatingPlanner` 桌面端在右侧垂直居中，移动端在底部水平居中；库的 `BackTop` 固定在右下角（bottom 32px、right 24px），两者不重叠，无需偏移。验证文档里用截图确认。

- [ ] **Step 7：提交**

```bash
git add components/island-layer.tsx app/layout.tsx tests/components/island-layer.test.tsx tests/skin-layout.test.ts
git commit -m "feat(skin): lazy-load the island library with cursor, back-to-top, background and notifications"
```

---

## Task 8：动物岛规则层（`.btn-depth`、`.skin-modal`、字体）

**Files：** `app/skins/island.css`、`components/ui/dialog.tsx`、`tests/skin-rules.test.ts`

> 说明：对话框遮罩已是 `bg-background/80 backdrop-blur-sm`，随 token 自动变暖，不需要额外的遮罩规则（因此不依赖库 CSS 才会定义的 `--animal-mask-bg`）。

- [ ] **Step 1：写失败测试** `tests/skin-rules.test.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/skins/island.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("island.css rules", () => {
  it("scopes every selector under html[data-skin=\"island\"] so the default skin is untouched", () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => !s.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(2);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        expect(part.trim().startsWith('html[data-skin="island"]'), part).toBe(true);
      }
    }
  });

  it("presses the 3D button by moving it and shrinking the depth shadow", () => {
    expect(css).toMatch(/\.btn-depth:active[^{]*\{[^}]*translateY\(3px\)/);
    expect(css).toMatch(/\.btn-depth:active[^{]*\{[^}]*--shadow-button:\s*0 1px 0 0 hsl\(var\(--button-depth\)\)/);
  });

  it("clips the dialog to the blob and keeps a rounded fallback", () => {
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*clip-path:\s*url\(#island-modal-clip\)/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*border-radius:\s*24px/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*padding:\s*40px 35px 32px/);
    expect(css).toMatch(/\.skin-modal\s*\{[^}]*box-shadow:\s*none/);
  });

  it("moves the dialog close button clear of the blob's narrow corner", () => {
    expect(css).toMatch(/\.skin-close\s*\{[^}]*right:\s*28px[^}]*top:\s*24px/);
  });

  it("sets the body font to Nunito plus a Traditional Chinese system stack", () => {
    expect(css).toMatch(/html\[data-skin="island"\] body\s*\{[^}]*font-family:\s*var\(--font-nunito\)/);
    expect(css).not.toMatch(/Noto Sans SC/i);
  });
});
```

- [ ] **Step 2：运行确认失败**

```bash
npx vitest run tests/skin-rules.test.ts
```

- [ ] **Step 3：给 `components/ui/dialog.tsx` 的关闭按钮加 `skin-close` 钩子**（把 `DialogPrimitive.Close` 的 className 首项改为 `"skin-close absolute right-4 top-4 …"`，其余类名保持不变）。同时确认 `tests/skin-default-parity.test.ts` 里 `skin-modal` 的计数不受影响（类名是 `skin-close`，不含 `skin-modal`）。

- [ ] **Step 4：在 `app/skins/island.css` 末尾追加规则**

```css
/* ---- rules (everything below is scoped to the island skin) ---- */

html[data-skin="island"] body {
  font-family: var(--font-nunito), "PingFang TC", "Noto Sans TC", "Microsoft JhengHei",
    system-ui, sans-serif;
}

html[data-skin="island"] .btn-depth {
  transition:
    transform 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

html[data-skin="island"] .btn-depth:active:not(:disabled) {
  transform: translateY(3px);
  --shadow-button: 0 1px 0 0 hsl(var(--button-depth));
}

html[data-skin="island"] .skin-modal {
  clip-path: url(#island-modal-clip);
  padding: 40px 35px 32px;
  border: 0;
  border-radius: 24px;
  background-color: hsl(var(--card));
  box-shadow: none;
}

html[data-skin="island"] .skin-close {
  right: 28px;
  top: 24px;
}

@media (prefers-reduced-motion: reduce) {
  html[data-skin="island"] .btn-depth {
    transition: none;
  }
}
```

- [ ] **Step 5：运行并确认全绿**

```bash
npx vitest run tests/skin-rules.test.ts tests/skin-tokens.test.ts tests/skin-default-parity.test.ts tests/components/dialog-a11y.test.ts
```

`tests/skin-tokens.test.ts` 的 `blockOf` 取的是第一个 `html[data-skin="island"] {`，新增规则的选择器都带后缀（`body {`、`.btn-depth {` 等），不会与之混淆。

- [ ] **Step 6：提交**

```bash
git add app/skins/island.css components/ui/dialog.tsx tests/skin-rules.test.ts
git commit -m "feat(skin): add pressed-depth buttons, blob dialog and island font rules"
```

## Task 9：浏览器验收与验证文档

**Files：** `docs/superpowers/verification/2026-10-11-next-web-animal-island-skin.md`

- [ ] **Step 1：构建并启动**

```bash
npm run build
npm run dev
```

用浏览器工具打开 `http://localhost:3000`。逐项检查并记录结果（通过 / 失败 + 备注）：

| # | 验收项（对应 spec §11） | 操作 | 期望 |
|---|---|---|---|
| AC1 | 默认皮肤零回归 | 清空 `localStorage`，刷新首页、课程页、时间表页 | 与改动前视觉一致；`<html>` 无 `data-skin`；网络面板无 `animal-island-ui` 的 chunk / CSS |
| AC2 | 切换与持久化 | 导航栏树形图标 → 选「动物岛」；刷新 | 立即变暖色圆角；刷新后无闪烁（首屏即 island）；`localStorage["umeh-skin"] === "island"` |
| AC3 | 明暗独立 | island 下切换亮/暗 | 暗色为暖棕底、亮色为米色底；`html` 同时有 `data-skin="island"` 与 `.dark` 的组合正确 |
| AC4 | 交互层 | island 下滚动、触发一次评论点赞 | 出现库光标、右下 BackTop、桌面亮色背景装饰；toast 为库的 Notification |
| AC5 | 回退干净 | 切回默认 | 光标类、BackTop、Background 消失；toast 回到 sonner；`animal-cursor` 类已移除 |
| AC6 | admin 排除 | island 下打开 `/admin`、`/admin/update` | 一律默认皮肤；`/adminfoo` 不受影响（仍为 island） |
| AC7 | 字体 | island 下查看网络面板 | 无 `noto-sans-sc-chinese-simplified-*.woff2` 请求；正文为 Nunito + 繁中系统字体 |
| AC8 | 移动端 | 视口 390px，打开侧栏 | `SkinOptions` 可用；无 Background；BackTop 与 FloatingPlanner 不重叠 |
| AC9 | 弹窗与按钮 | island 下打开举报弹窗 | 弹窗为不规则 blob 轮廓；关闭按钮不被裁切；主按钮按下有 3px 位移；焦点环仍可见 |

另外手动验证两个降级路径：
1. DevTools 把 `animal-island-ui` 的 chunk 设为 blocked，切到 island：页面仍是 island token 皮肤，toast 回落 sonner，控制台无未捕获异常。
2. 无痕窗口 + `localStorage` 禁用：页面正常渲染默认皮肤，切换器不抛错。

- [ ] **Step 2：写验证文档**，结构如下（每项填真实结果与截图路径，禁止预填「通过」）：

```md
# 动物岛皮肤验证记录

- 日期：2026-10-11
- 提交：<git rev-parse --short HEAD>
- 环境：Node <node -v>、npm <npm -v>

## 自动化
- `npm test`：<n files / m tests passed>
- `npm run lint`：<结果>
- `npx tsc --noEmit`：<结果>
- `npm run build`：<结果>

## 浏览器验收（AC1–AC9）
| # | 结果 | 备注 / 截图 |
|---|---|---|

## 降级路径
- 库 chunk 被拦截：
- localStorage 不可用：

## 已知问题 / 遗留
```

- [ ] **Step 3：提交**

```bash
git add docs/superpowers/verification/2026-10-11-next-web-animal-island-skin.md
git commit -m "docs(verification): record the animal-island skin acceptance run"
```

---

## Task 10：最终门禁与 spec 同步

- [ ] **Step 1：完整门禁**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

全部必须通过；`lint` 使用 `--max-warnings=0`。任何失败回到对应 Task 修复，不要放宽测试。

- [ ] **Step 2：核对 spec 与实现一致**：spec §7.2（门面选项、`toasterId` 与裸调用走 sonner）、§7.6 / §9（`lib/skin.ts` 与 `lib/use-skin.ts` 的拆分、新增文件清单）、§5（`--shadow-button` 默认值为 `0 0 #0000`）、§8（Nunito 挂在 `<html>`）与最终代码一致；有出入时改 spec，而不是改代码来迁就旧文字。

- [ ] **Step 3：确认变更面干净**

```bash
git status --short
git diff main --stat -- ':!docs'
```

只应出现本计划文件清单中的文件；`skills-lock.json`、`.claude/` 不属于本功能，不得 `git add`。

- [ ] **Step 4：提交 spec 同步（如有改动）**

```bash
git add docs/superpowers/specs/2026-10-11-next-web-animal-island-skin-design.md
git commit -m "docs(spec): sync the animal-island skin design with the implementation"
```

