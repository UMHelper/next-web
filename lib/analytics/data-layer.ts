import { ANALYTICS_EVENTS, type EventSpec } from "./registry";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const MAX_PARAM_NAME_LENGTH = 40;
const MAX_STRING_VALUE_LENGTH = 100;
const RESERVED_PARAM_NAMES = ["event", "um_name"];

/**
 * 构建期的静态字面量：Next 在客户端 bundle 里会把它替换成 "production"，
 * 因此浏览器里这一支是可靠的默认值。
 */
const BUILD_ENV = process.env.NODE_ENV;

/** 已经警告过的原因（同一个原因只警告一次，避免刷屏）。 */
const warned = new Set<string>();

/**
 * 运行时读取（而不是直接用 `process.env.NODE_ENV` 字面量），这样测试可以用
 * `vi.stubEnv` 覆盖；浏览器里没有 `process`，退回到构建期常量。
 */
function isDev(): boolean {
  const runtimeEnv = globalThis.process?.env?.NODE_ENV;
  return (runtimeEnv ?? BUILD_ENV) !== "production";
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[analytics] ${message}`);
}

/**
 * 开发环境直接抛错（测试与本地立刻暴露问题），生产环境丢弃这次上报。
 * 丢弃是必须的：宁可少一条数据，也不要往 GA4 塞形状不对的事件污染报表。
 */
function drop(reason: string, key: string): void {
  if (isDev()) throw new Error(`[analytics] ${reason}`);
  warnOnce(key, `dropped event: ${reason}`);
}

export type AnalyticsParamValue = string | number | boolean | null | undefined;

/**
 * 把一条业务事件推进 GTM dataLayer。全仓唯一的 dataLayer 写入口。
 *
 * payload 形状恒定：{ event: "um_event", um_name: <事件名>, ...params }。
 * `um_event` 是 GTM 触发器的唯一锚点，因此新增事件永远不需要改容器。
 */
export function emit(name: string, params: Record<string, AnalyticsParamValue> = {}): void {
  if (typeof window === "undefined") return;

  /**
   * `emit` 的入参是 `string`（调用方可能传任何拼错的名字），而注册表的键是字面量
   * 联合类型，所以这里必须显式放宽成字符串索引：未知事件正是下面这一段要挡住的
   * 情况，返回 `undefined` 就是预期行为。
   */
  const spec = (ANALYTICS_EVENTS as Record<string, EventSpec | undefined>)[name];
  if (!spec) {
    drop(`unknown event "${name}" — 先在 lib/analytics/registry-data.mjs 里登记它`, `event:${name}`);
    return;
  }

  const payload: Record<string, string | number> = { event: "um_event", um_name: name };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (RESERVED_PARAM_NAMES.includes(key) || key.startsWith("um_") || key.startsWith("gtm")) {
      drop(`reserved parameter name "${key}"`, `reserved:${key}`);
      return;
    }
    if (key.length > MAX_PARAM_NAME_LENGTH) {
      drop(`parameter name "${key}" is longer than ${MAX_PARAM_NAME_LENGTH} characters`, `long-name:${key}`);
      return;
    }

    const paramSpec = spec.params[key];
    if (!paramSpec) {
      drop(
        `parameter "${key}" is not registered for event "${name}" — 未注册的参数不会出现在 GA4 里`,
        `param:${name}.${key}`,
      );
      return;
    }

    if (typeof value === "boolean") {
      payload[key] = value ? 1 : 0;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        drop(`parameter "${key}" must be a finite number`, `number:${name}.${key}`);
        return;
      }
      payload[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const limit = paramSpec.maxLength ?? MAX_STRING_VALUE_LENGTH;
      if (value.length > limit) {
        warnOnce(`truncate:${name}.${key}`, `parameter "${key}" truncated to ${limit} characters`);
        payload[key] = value.slice(0, limit);
        continue;
      }
      payload[key] = value;
      continue;
    }

    drop(`parameter "${key}" has unsupported type "${typeof value}"`, `type:${name}.${key}`);
    return;
  }

  for (const [key, paramSpec] of Object.entries(spec.params)) {
    if (paramSpec.required && payload[key] === undefined) {
      drop(`missing required parameter "${key}" for event "${name}"`, `missing:${name}.${key}`);
      return;
    }
  }

  const dataLayer = (window.dataLayer ??= []);
  dataLayer.push(payload);

  if (isDev()) console.debug("[analytics]", name, payload);
}
