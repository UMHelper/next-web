#!/usr/bin/env node
/**
 * 把 GA 埋点的 GTM 侧配置（变量 / 触发器 / 标签）**按注册表生成并写入容器**。
 *
 * 为什么要有这个脚本：GA 埋点的桥 A 唯一的人工环节就是 GTM 容器配置，而它是
 * 一个"参数漏声明就静默丢数据"的手工活。把这个活变成脚本，容器配置就与
 * `lib/analytics/registry-data.mjs` 同源，不再依赖谁在 UI 里点得准不准。
 *
 * 用法（需要一个含 tagmanager.edit.containers / tagmanager.edit.containerversions /
 * tagmanager.publish 的短时 access token）：
 *
 *   node scripts/gtm-provision.mjs --list                 # 只读：打印账号/容器/工作区/已有对象
 *   node scripts/gtm-provision.mjs --plan                 # 离线：打印将要写入的对象（不发请求）
 *   node scripts/gtm-provision.mjs --apply                # 写入工作区（幂等：同名对象走更新）
 *   node scripts/gtm-provision.mjs --version              # 用工作区创建一个容器版本（不发布）
 *   node scripts/gtm-provision.mjs --publish <versionId>  # 发布指定版本（必须显式给出）
 *
 * token 来源：环境变量 `GOOGLE_ACCESS_TOKEN`，或 `--token-file <path>`（默认
 * `tmp/gtm-token.txt`，该目录已被 .gitignore 忽略，不会进 git）。
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { ANALYTICS_EVENTS } from "../lib/analytics/registry-data.mjs";

const API = "https://tagmanager.googleapis.com/tagmanager/v2";
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_MEASUREMENT_ID?.trim() || "G-V1KZT6Q50E";
const CONTAINER_PUBLIC_ID = process.env.GTM_ID?.trim() || "GTM-KGF3BFS";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

/** 名字 → GTM 里已存在的对象，用于幂等。 */
const NAME = {
  dlVariable: (key) => `DL - ${key}`,
  jsPageTitle: "JS - Page Title",
  triggerEvent: "Trigger - um_event",
  triggerHistory: "Trigger - History Change",
  triggerReplaceState: "Trigger - replaceState only",
  tagEvent: "GA4 Event - um_event",
  tagSpaUpdate: "Google Tag - SPA update",
};

/** 所有注册参数（去重、排序），清单与容器变量都由它派生。 */
export function registeredParams() {
  return [...new Set(Object.values(ANALYTICS_EVENTS).flatMap((spec) => Object.keys(spec.params)))].sort();
}

/** 数据层变量：一个参数一个，名字与参数名一一对应。 */
function dataLayerVariable(key) {
  return {
    name: NAME.dlVariable(key),
    type: "v",
    parameter: [
      { type: "template", key: "name", value: key },
      // 版本 2：支持嵌套 key，且保留原始类型（数字仍是数字）。
      { type: "integer", key: "dataLayerVersion", value: "2" },
    ],
  };
}

function customEventTrigger() {
  return {
    name: NAME.triggerEvent,
    type: "customEvent",
    customEventFilter: [
      {
        type: "equals",
        parameter: [
          { type: "template", key: "arg0", value: "{{_event}}" },
          { type: "template", key: "arg1", value: "um_event" },
        ],
      },
    ],
  };
}

function historyChangeTrigger() {
  return { name: NAME.triggerHistory, type: "historyChange" };
}

/**
 * `replaceState` 专用触发器，作为 Google 标签的**屏蔽触发器**。
 *
 * GTM 的 Condition 枚举里没有 "不等于"，所以"排除 replaceState"要用屏蔽触发器表达：
 * 历史变化照常触发，只有 replaceState（= CourseFilter 的筛选改 query）被屏蔽。
 */
function replaceStateTrigger() {
  return {
    name: NAME.triggerReplaceState,
    type: "historyChange",
    filter: [
      {
        type: "equals",
        parameter: [
          { type: "template", key: "arg0", value: "{{History Source}}" },
          { type: "template", key: "arg1", value: "replaceState" },
        ],
      },
    ],
  };
}

function ga4EventTag() {
  const eventParameters = registeredParams().map((key) => ({
    type: "map",
    map: [
      { type: "template", key: "name", value: key },
      { type: "template", key: "value", value: `{{${NAME.dlVariable(key)}}}` },
    ],
  }));

  return {
    name: NAME.tagEvent,
    type: "gaawe",
    parameter: [
      // 用 measurementIdOverride：本容器里的 UA Report 标签也是这个形状；
      // gaawe 模板在没有 eventSettingsVariable 时会要求该字段非空。
      { type: "template", key: "measurementIdOverride", value: MEASUREMENT_ID },
      // 关键一行：事件名取自 dataLayer 的 um_name —— 新增事件无需再改容器。
      { type: "template", key: "eventName", value: `{{${NAME.dlVariable("um_name")}}}` },
      { type: "list", key: "eventParameters", list: eventParameters },
      { type: "boolean", key: "sendEcommerceData", value: "false" },
    ],
  };
}

function googleTagSpaUpdate() {
  return {
    name: NAME.tagSpaUpdate,
    type: "googtag",
    parameter: [
      { type: "template", key: "tagId", value: MEASUREMENT_ID },
      {
        type: "list",
        key: "configSettingsTable",
        list: [
          {
            type: "map",
            map: [
              { type: "template", key: "parameter", value: "page_location" },
              { type: "template", key: "parameterValue", value: "{{Page URL}}" },
            ],
          },
          {
            type: "map",
            map: [
              { type: "template", key: "parameter", value: "page_title" },
              { type: "template", key: "parameterValue", value: `{{${NAME.jsPageTitle}}}` },
            ],
          },
          {
            type: "map",
            map: [
              { type: "template", key: "parameter", value: "update" },
              { type: "template", key: "parameterValue", value: "true" },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * `page_title` 用 Custom JS 变量而不是内置变量：GTM API 的内置变量枚举里没有
 * `pageTitle`（UI 里有，API 这版没有），所以等价地用 `document.title`。
 */
function jsPageTitleVariable() {
  return {
    name: NAME.jsPageTitle,
    type: "jsm",
    parameter: [{ type: "template", key: "javascript", value: "function(){return document.title;}" }],
  };
}

export function desiredObjects() {
  return {
    // 内置变量：`{{Page URL}}` 与 `{{History Source}}` 必须先启用。
    builtInVariables: ["pageUrl", "historySource"],
    // `um_name` 不是注册参数（它是包装事件的字段），但 GA4 事件标签的事件名取自它，
    // 所以必须单独为它建一个数据层变量，否则事件名会解析为空。
    variables: [dataLayerVariable("um_name"), ...registeredParams().map(dataLayerVariable), jsPageTitleVariable()],
    triggers: [customEventTrigger(), historyChangeTrigger(), replaceStateTrigger()],
    tags: [ga4EventTag(), googleTagSpaUpdate()],
  };
}

// ---------------------------------------------------------------- 网络部分

function token() {
  if (process.env.GOOGLE_ACCESS_TOKEN?.trim()) return process.env.GOOGLE_ACCESS_TOKEN.trim();
  const file = argValue("--token-file", "tmp/gtm-token.txt");
  if (file && existsSync(file)) return readFileSync(file, "utf8").trim();
  throw new Error(
    "缺少 access token：请设置 GOOGLE_ACCESS_TOKEN，或把 token 写到 tmp/gtm-token.txt（该文件不入 git）",
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GTM API 的 per-user 配额很低（一口气写几十个对象就会 429），因此串行 + 节流 + 退避重试。 */
const REQUEST_INTERVAL_MS = Number(argValue("--interval", "1200"));
let lastRequestAt = 0;

async function api(path, { method = "GET", body } = {}) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);

    const response = await fetch(`${API}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token()}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    lastRequestAt = Date.now();
    const text = await response.text();

    // 429/5xx 属于"等一会儿再来"，不是逻辑错误。
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 6) throw new Error(`${method} ${path} → HTTP ${response.status}（重试 6 次仍失败）\n${text.slice(0, 400)}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * attempt;
      console.warn(`[gtm-provision] HTTP ${response.status}，${Math.round(backoff / 1000)}s 后重试（第 ${attempt} 次）`);
      await sleep(backoff);
      continue;
    }
    if (!response.ok) {
      throw new Error(`${method} ${path} → HTTP ${response.status}\n${text.slice(0, 800)}`);
    }
    return text ? JSON.parse(text) : {};
  }
  throw new Error("unreachable");
}

/** 只比较我们实际设置的字段，忽略服务端补的默认字段（once_per_event、fingerprint 等）。 */
function sameAsDesired(desired, current) {
  const comparable = (value) =>
    Array.isArray(value)
      ? value.map(comparable)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).sort().map(([k, v]) => [k, comparable(v)]))
        : value;
  return Object.entries(desired).every(([key, value]) =>
    JSON.stringify(comparable(value)) === JSON.stringify(comparable(current[key])),
  );
}

async function locateContainer() {
  const accounts = (await api("accounts")).account ?? [];
  for (const account of accounts) {
    const containers = (await api(`accounts/${account.accountId}/containers`)).container ?? [];
    const container = containers.find((item) => item.publicId === CONTAINER_PUBLIC_ID);
    if (!container) continue;
    const workspaces = (await api(`accounts/${account.accountId}/containers/${container.containerId}/workspaces`)).workspace ?? [];
    return { account, container, workspace: workspaces.find((ws) => ws.name === "Default Workspace") ?? workspaces[0] };
  }
  throw new Error(`账号列表里找不到容器 ${CONTAINER_PUBLIC_ID}`);
}

function workspacePath(located) {
  return `accounts/${located.account.accountId}/containers/${located.container.containerId}/workspaces/${located.workspace.workspaceId}`;
}

async function listExisting(path) {
  const [variables, triggers, tags, builtIns] = await Promise.all([
    api(`${path}/variables`).then((r) => r.variable ?? []),
    api(`${path}/triggers`).then((r) => r.trigger ?? []),
    api(`${path}/tags`).then((r) => r.tag ?? []),
    api(`${path}/built_in_variables`).then((r) => r.builtInVariable ?? []),
  ]);
  return { variables, triggers, tags, builtIns };
}

/** 幂等写入：同名存在就更新（PUT 到自己的 path），否则创建。 */
async function upsert(path, collection, desired, existing) {
  const current = existing.find((item) => item.name === desired.name);
  if (!current) {
    await api(`${path}/${collection}`, { method: "POST", body: desired });
    return `created  ${desired.name}`;
  }
  // 内容没变就不写：省配额，也让重跑收敛得很快。
  if (sameAsDesired(desired, current)) return `unchanged ${desired.name}`;
  // 带上 fingerprint：GTM 用它做乐观并发控制，缺了会在并发编辑时静默覆盖别人的改动。
  await api(current.path, { method: "PUT", body: { ...desired, fingerprint: current.fingerprint } });
  return `updated  ${desired.name}`;
}

/** 标签引用触发器需要真实 id，因此挂接单独一步，且每次都收敛到期望状态。 */
async function linkTag(tag, { firingTriggerId, blockingTriggerId }) {
  await api(tag.path, {
    method: "PUT",
    body: {
      ...desiredObjects().tags.find((item) => item.name === tag.name),
      fingerprint: tag.fingerprint,
      firingTriggerId,
      ...(blockingTriggerId ? { blockingTriggerId } : {}),
    },
  });
  return tag.name;
}

async function main() {
  const plan = desiredObjects();

  if (has("--plan")) {
    console.log(`# 容器 ${CONTAINER_PUBLIC_ID} / 媒体资源 ${MEASUREMENT_ID}`);
    console.log(`# 内置变量：${plan.builtInVariables.join(", ")}`);
    console.log(JSON.stringify({ variables: plan.variables, triggers: plan.triggers, tags: plan.tags }, null, 2));
    return;
  }

  const located = await locateContainer();
  const path = workspacePath(located);
  console.log(`# account=${located.account.accountId} container=${located.container.containerId} workspace=${located.workspace.workspaceId}`);
  const existing = await listExisting(path);

  if (has("--list")) {
    const show = (label, items) => {
      console.log(`\n## ${label}（${items.length}）`);
      for (const item of items) console.log(` - ${item.name}`);
    };
    console.log(`## 内置变量（${existing.builtIns.length}）`);
    for (const item of existing.builtIns) console.log(` - ${item.type}  ${item.name}`);
    show("变量", existing.variables);
    show("触发器", existing.triggers);
    show("标签", existing.tags);
    return;
  }

  if (has("--apply")) {
    const enabled = new Set(existing.builtIns.map((item) => item.type));
    const missingBuiltIns = plan.builtInVariables.filter((type) => !enabled.has(type));
    if (missingBuiltIns.length) {
      const query = missingBuiltIns.map((type) => `type=${encodeURIComponent(type)}`).join("&");
      await api(`${path}/built_in_variables?${query}`, { method: "POST" });
      console.log(`enabled  built-in: ${missingBuiltIns.join(", ")}`);
    }
    for (const variable of plan.variables) console.log(await upsert(path, "variables", variable, existing.variables));
    for (const trigger of plan.triggers) console.log(await upsert(path, "triggers", trigger, existing.triggers));
    for (const tag of plan.tags) console.log(await upsert(path, "tags", tag, existing.tags));
    console.log("\n提示：写入的是工作区，尚未生效。下一步 `--version`，再 `--publish <versionId>`。");
    return;
  }

  if (has("--version")) {
    // 触发器/标签互相引用需要真实 id：先把现有对象读出来。
    const after = await listExisting(path);
    const eventTag = after.tags.find((item) => item.name === NAME.tagEvent);
    const spaTag = after.tags.find((item) => item.name === NAME.tagSpaUpdate);
    const eventTriggerId = after.triggers.find((item) => item.name === NAME.triggerEvent)?.triggerId;
    const historyTriggerId = after.triggers.find((item) => item.name === NAME.triggerHistory)?.triggerId;
    const replaceTriggerId = after.triggers.find((item) => item.name === NAME.triggerReplaceState)?.triggerId;

    if (!eventTriggerId || !historyTriggerId || !replaceTriggerId) throw new Error("触发器不齐，请先 --apply");
    if (!eventTag || !spaTag) throw new Error("标签不齐，请先 --apply");

    await linkTag(eventTag, { firingTriggerId: [eventTriggerId] });
    console.log("linked   GA4 Event - um_event → Trigger - um_event");
    await linkTag(spaTag, { firingTriggerId: [historyTriggerId], blockingTriggerId: [replaceTriggerId] });
    console.log("linked   Google Tag - SPA update → Trigger - History Change（屏蔽 replaceState）");

    const version = await api(`${path}:create_version`, {
      method: "POST",
      body: {
        name: "GA analytics phase 1 (um_event bridge)",
        notes: "由 scripts/gtm-provision.mjs 从 lib/analytics/registry-data.mjs 生成",
      },
    });
    console.log(`\nversion  ${version.containerVersion?.containerVersionId}  ${version.containerVersion?.name}`);
    console.log("发布前请用 GTM 预览核对；发布：node scripts/gtm-provision.mjs --publish <versionId>");
    return;
  }

  const publishIndex = args.indexOf("--publish");
  if (publishIndex >= 0) {
    const versionId = args[publishIndex + 1];
    if (!versionId || versionId.startsWith("--")) throw new Error("--publish 需要版本号");
    const result = await api(
      `accounts/${located.account.accountId}/containers/${located.container.containerId}/versions/${versionId}:publish`,
      { method: "POST" },
    );
    console.log(`published version ${versionId}`);
    console.log(JSON.stringify(result.containerVersion?.containerVersionId ?? result, null, 2));
    return;
  }

  console.log("用法：--list | --plan | --apply | --version | --publish <versionId>");
}

// 只在被直接执行时跑主流程；被 import 时（测试 / 审查）不产生副作用。
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[gtm-provision] ${error.message}`);
    process.exit(1);
  });
}
