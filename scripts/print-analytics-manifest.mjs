#!/usr/bin/env node
/**
 * 从 lib/analytics/registry-data.mjs 生成 GTM / GA4 手工配置清单。
 *
 * 用途：桥 A 唯一的静默失败点是"参数没在 GTM 容器里声明就丢失"，所以清单必须
 * 由注册表生成，而不是人手维护。`--check` 供 tests/analytics/wiring.test.ts 做
 * 防漂移断言（退出码 1 = 文档与注册表不一致）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ANALYTICS_EVENTS } from "../lib/analytics/registry-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "docs/analytics/gtm-setup.md");
const MEASUREMENT_ID = "G-V1KZT6Q50E";
const CONTAINER_ID = "GTM-KGF3BFS";

function variables() {
  const names = new Set(["um_name"]);
  for (const spec of Object.values(ANALYTICS_EVENTS)) {
    for (const [paramName, param] of Object.entries(spec.params)) {
      names.add(`${paramName}:${param.type === "number" ? "number" : "string"}`);
    }
  }
  return [...names].sort();
}

export function renderManifest() {
  const lines = [];

  lines.push("# GTM / GA4 手工配置清单（由脚本生成，勿手改）");
  lines.push("");
  lines.push(`> 生成命令：\`node scripts/print-analytics-manifest.mjs\`（校验：\`--check\`）`);
  lines.push(`> 数据源：\`lib/analytics/registry-data.mjs\`　容器：\`${CONTAINER_ID}\`　Measurement ID：\`${MEASUREMENT_ID}\``);
  lines.push("");
  lines.push("## 1. GTM 变量（变量 → 新建 → 数据层变量）");
  lines.push("");
  lines.push("| 变量名 | 数据层变量名称 | 类型 |");
  lines.push("|---|---|---|");
  for (const entry of variables()) {
    const [name, type] = entry.split(":");
    lines.push(`| \`DL - ${name}\` | \`${name}\` | ${type === "number" ? "数字" : "字符串"} |`);
  }
  lines.push("");
  lines.push("> 内置变量（变量 → 配置）需启用：`Page URL`、`Page Title`、`History Source`。");
  lines.push("");
  lines.push("## 2. GTM 触发器");
  lines.push("");
  lines.push("| 名称 | 类型 | 条件 |");
  lines.push("|---|---|---|");
  lines.push("| `Trigger - um_event` | 自定义事件 | 事件名称 **精确等于** `um_event` |");
  lines.push("| `Trigger - History Change` | 历史记录更改 | 附加上游过滤：`History Source` 等于 `pushState`（避免筛选改 query 产生噪声 page_view） |");
  lines.push("");
  lines.push("## 3. GTM 标签");
  lines.push("");
  lines.push("| 名称 | 类型 | 关键配置 | 触发器 |");
  lines.push("|---|---|---|---|");
  lines.push(`| \`GA4 Event - um_event\` | Google Analytics: GA4 事件 | Measurement ID = \`${MEASUREMENT_ID}\`；Event Name = \`{{DL - um_name}}\`；事件参数见下表；发送电子商务数据 **关闭** | \`Trigger - um_event\` |`);
  lines.push(`| \`Google Tag - SPA update\` | Google 标签 | ID = \`${MEASUREMENT_ID}\`；配置参数 \`page_location={{Page URL}}\`、\`page_title={{Page Title}}\`、\`update=true\` | \`Trigger - History Change\` |`);
  lines.push("");
  lines.push("## 4. GA4 事件标签的参数行（逐行照抄）");
  lines.push("");
  lines.push("| 参数名 | 值 |");
  lines.push("|---|---|");
  const paramNames = [...new Set(
    Object.values(ANALYTICS_EVENTS).flatMap((spec) => Object.keys(spec.params)),
  )].sort();
  for (const paramName of paramNames) {
    lines.push(`| \`${paramName}\` | \`{{DL - ${paramName}}}\` |`);
  }
  lines.push("");
  lines.push("## 5. GA4 后台");
  lines.push("");
  lines.push("1. 关闭 `管理 → 数据收集和修改 → 数据流 → 增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化`（否则与 §3 的 Google Tag 双计 page_view）。");
  lines.push("2. `管理 → 自定义定义 → 自定义维度`：把上表每个参数注册为**事件级**自定义维度（不注册则只能在 DebugView 看到）。");
  lines.push("3. 可选：把关键事件标记为转化。");
  lines.push("");
  lines.push("## 6. 事件字典（代码里的注册表）");
  lines.push("");
  for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
    lines.push(`### \`${eventName}\`（${spec.ga4 === "recommended" ? "GA4 推荐事件" : "自定义事件"}）`);
    lines.push("");
    lines.push(`- 目的：${spec.purpose}`);
    lines.push(`- 接线：${spec.wiring}`);
    lines.push("");
    lines.push("| 参数 | 类型 | 必需 | 说明 |");
    lines.push("|---|---|---|---|");
    for (const [paramName, param] of Object.entries(spec.params)) {
      lines.push(`| \`${paramName}\` | ${param.type} | ${param.required ? "是" : "否"} | ${param.note} |`);
    }
    lines.push("");
  }
  lines.push("## 7. 验收");
  lines.push("");
  lines.push("1. GTM 预览里逐条触发四个事件，确认标签被触发、`um_name` 解析成正确的事件名。");
  lines.push("2. GA4 DebugView 逐参数核对：每个参数都有值，**没有 not set**。");
  lines.push("3. 首屏 1 条 `page_view`；点课程卡后第 2 条；改筛选下拉**不产生** `page_view`；浏览器后退产生 1 条。");
  lines.push("4. 提交并**发布**容器版本后再回到线上复验一次。");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function main() {
  const rendered = renderManifest();
  const check = process.argv.includes("--check");

  if (check) {
    let current = "";
    try {
      current = readFileSync(TARGET, "utf8");
    } catch {
      console.error(`[analytics] ${TARGET} 不存在，请先运行 node scripts/print-analytics-manifest.mjs`);
      process.exit(1);
    }
    if (current !== rendered) {
      console.error("[analytics] docs/analytics/gtm-setup.md 与注册表不一致，请重新生成。");
      process.exit(1);
    }
    console.log("[analytics] gtm-setup.md is in sync with the registry");
    return;
  }

  writeFileSync(TARGET, rendered);
  console.log(`[analytics] wrote ${TARGET}`);
}

main();
