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
