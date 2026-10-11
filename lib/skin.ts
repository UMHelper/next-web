export type Skin = "default" | "island";

export const SKIN_STORAGE_KEY = "umeh-skin";

const listeners = new Set<() => void>();

// 存储不可用（如隐私模式）时，本次会话内的选择只保存在内存里
let sessionSkin: Skin | null = null;

function isSkin(value: unknown): value is Skin {
  return value === "default" || value === "island";
}

export function getSkin(): Skin {
  if (typeof window === "undefined") return "default";
  if (sessionSkin !== null) return sessionSkin;
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
    sessionSkin = null;
  } catch {
    sessionSkin = skin;
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
