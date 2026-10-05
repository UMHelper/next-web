#!/usr/bin/env node
/**
 * 把 GA 埋点的 GA4 侧设置写好：关掉增强衡量里"基于浏览器历史事件的页面变化"，
 * 并按注册表把事件级自定义维度建出来。
 *
 * 为什么必须关：软导航的 `page_view` 已由 GTM 的 History Change 触发器 + Google
 * 标签（update: true）负责；GA4 的增强衡量若同时开着历史页面浏览，就会双计。
 *
 * 用法（需要一个含 analytics.edit 的短时 access token）：
 *
 *   node scripts/ga4-provision.mjs --list                       # 只读：数据流 + 当前开关 + 已有自定义维度
 *   node scripts/ga4-provision.mjs --plan                       # 离线：打印将要做的改动
 *   node scripts/ga4-provision.mjs --apply                      # 执行（关闭开关 + 建缺失的维度）
 *   node scripts/ga4-provision.mjs --apply --include-builtins    # 连"内置维度"那 4 个也建
 *
 * token 来源同 gtm-provision.mjs：`GOOGLE_ACCESS_TOKEN` 或 `tmp/gtm-token.txt`。
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { ANALYTICS_EVENTS } from "../lib/analytics/registry-data.mjs";

const API = "https://analyticsadmin.googleapis.com/v1alpha";
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_MEASUREMENT_ID?.trim() || "G-V1KZT6Q50E";

/**
 * 对 GA4 推荐事件而言这几个参数是内置维度（`search_term` 是 search /
 * view_search_results 的顶层参数；`item_id` / `item_list_name` / `position`
 * 属于 `items[]` 数组级参数）。我们是**扁平上报**，因此后三个是否真能进内置
 * 报表无法在不打开浏览器的前提下证实 —— 所以默认不重复建，需要时用
 * `--include-builtins` 一并建出来。
 */
export const BUILT_IN_PARAMS = ["search_term", "item_id", "item_list_name", "position"];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export function registeredParams() {
  return [...new Set(Object.values(ANALYTICS_EVENTS).flatMap((spec) => Object.keys(spec.params)))].sort();
}

/** 参数名 → 注册表里的说明（作为自定义维度的 description）。 */
export function paramNotes() {
  const notes = new Map();
  for (const spec of Object.values(ANALYTICS_EVENTS)) {
    for (const [key, param] of Object.entries(spec.params)) {
      if (!notes.has(key)) notes.set(key, param.note);
    }
  }
  return notes;
}

export function desiredDimensions({ includeBuiltIns = false } = {}) {
  const notes = paramNotes();
  return registeredParams()
    .filter((key) => includeBuiltIns || !BUILT_IN_PARAMS.includes(key))
    .map((key) => ({
      parameterName: key,
      displayName: key,
      description: notes.get(key) ?? "",
      scope: "EVENT",
    }));
}

function token() {
  if (process.env.GOOGLE_ACCESS_TOKEN?.trim()) return process.env.GOOGLE_ACCESS_TOKEN.trim();
  const file = argValue("--token-file", "tmp/gtm-token.txt");
  if (file && existsSync(file)) return readFileSync(file, "utf8").trim();
  throw new Error(
    "缺少 access token：请设置 GOOGLE_ACCESS_TOKEN，或把 token 写到 tmp/gtm-token.txt（该文件不入 git）",
  );
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → HTTP ${response.status}\n${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function locateStream() {
  // 注意：Admin API v1alpha 的 properties.list 必须带 filter（按账号过滤），
  // 不带会直接 400 “The value for the 'filter' field was empty”。
  const accounts = (await api("accounts")).accounts ?? [];
  for (const account of accounts) {
    const filter = encodeURIComponent(`parent:${account.name}`);
    const properties = (await api(`properties?filter=${filter}`)).properties ?? [];
    for (const property of properties) {
      const streams = (await api(`${property.name}/dataStreams`)).dataStreams ?? [];
      const stream = streams.find((item) => item.webStreamData?.measurementId === MEASUREMENT_ID);
      if (stream) return { account, property, stream };
    }
  }
  throw new Error(`可访问的媒体资源里找不到测量 ID 为 ${MEASUREMENT_ID} 的数据流`);
}

async function main() {
  const includeBuiltIns = has("--include-builtins");
  const dimensions = desiredDimensions({ includeBuiltIns });

  if (has("--plan")) {
    console.log(`# 测量 ID ${MEASUREMENT_ID}`);
    console.log("# 1) enhancedMeasurementSettings.pageChangesEnabled = false（避免与 GTM 的 History Change 双计）");
    console.log(`# 2) 创建 ${dimensions.length} 个事件级自定义维度${includeBuiltIns ? "（含内置维度那 4 个）" : "（跳过内置维度那 4 个）"}：`);
    for (const dimension of dimensions) console.log(`     - ${dimension.parameterName}`);
    return;
  }

  const { property, stream } = await locateStream();
  console.log(`# property=${property.name}  stream=${stream.name}`);
  const settingsPath = `${stream.name}/enhancedMeasurementSettings`;
  const settings = await api(settingsPath);

  if (has("--list")) {
    console.log(`\n## 当前增强衡量设置`);
    for (const [key, value] of Object.entries(settings)) {
      if (key === "name") continue;
      console.log(` - ${key}: ${value}`);
    }
    const existing = (await api(`${property.name}/customDimensions`)).customDimensions ?? [];
    console.log(`\n## 已有自定义维度（${existing.length}）`);
    for (const item of existing) console.log(` - ${item.parameterName}  [${item.scope}]`);
    return;
  }

  if (!has("--apply")) {
    console.log("用法：--list | --plan | --apply [--include-builtins]");
    return;
  }

  if (settings.pageChangesEnabled !== false) {
    await api(`${settingsPath}?updateMask=pageChangesEnabled`, {
      method: "PATCH",
      body: { pageChangesEnabled: false },
    });
    console.log("updated  enhancedMeasurementSettings.pageChangesEnabled = false");
  } else {
    console.log("skipped  pageChangesEnabled 已经是 false");
  }

  const existing = (await api(`${property.name}/customDimensions`)).customDimensions ?? [];
  const existingNames = new Set(existing.map((item) => item.parameterName));
  for (const dimension of dimensions) {
    if (existingNames.has(dimension.parameterName)) {
      console.log(`skipped  custom dimension ${dimension.parameterName}（已存在）`);
      continue;
    }
    await api(`${property.name}/customDimensions`, { method: "POST", body: dimension });
    console.log(`created  custom dimension ${dimension.parameterName}`);
  }
  console.log("\n提示：自定义维度生效后（约几分钟到数小时）才会出现在报表维度选择器里。");
}

// 只在被直接执行时跑主流程；被 import 时（测试 / 审查）不产生副作用。
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[ga4-provision] ${error.message}`);
    process.exit(1);
  });
}
