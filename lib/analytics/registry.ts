import {
  ANALYTICS_EVENTS as RAW_EVENTS,
  FORBIDDEN_PARAM_NAMES as RAW_FORBIDDEN_PARAM_NAMES,
} from "./registry-data.mjs";

export type ParamType = "string" | "number";

export type ParamSpec = {
  type: ParamType;
  required: boolean;
  /** 覆盖默认的 100 字符上限（GA4 对字符串参数的限制）。 */
  maxLength?: number;
  note: string;
};

export type EventSpec = {
  ga4: "recommended" | "custom";
  purpose: string;
  /** 一个或多个接线文件路径（逗号分隔），测试会断言它们真实存在。 */
  wiring: string;
  params: Record<string, ParamSpec>;
};

/** 事件名的类型从数据源推断，因此新增事件会自动出现在类型里。 */
export type EventName = keyof typeof RAW_EVENTS & string;

/**
 * 数据源是 .mjs（为了让 Node 脚本与运行时读同一份物理数据），TypeScript 只能从
 * JS 字面量推断出 `ga4: string` 这种宽类型，所以这里必须断言一次。真正的形状保证
 * 来自 tests/analytics/registry.test.ts 的运行时校验。
 */
export const ANALYTICS_EVENTS = RAW_EVENTS as unknown as Record<EventName, EventSpec>;

export const FORBIDDEN_PARAM_NAMES: readonly string[] = RAW_FORBIDDEN_PARAM_NAMES;
