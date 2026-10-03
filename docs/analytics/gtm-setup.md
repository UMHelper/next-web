# GTM / GA4 手工配置清单（由脚本生成，勿手改）

> 生成命令：`node scripts/print-analytics-manifest.mjs`（校验：`--check`）
> 数据源：`lib/analytics/registry-data.mjs`　容器：`GTM-KGF3BFS`　Measurement ID：`G-V1KZT6Q50E`

## 1. GTM 变量（变量 → 新建 → 数据层变量）

| 变量名 | 数据层变量名称 | 类型 |
|---|---|---|
| `DL - entry_point` | `entry_point` | 字符串 |
| `DL - faculty` | `faculty` | 字符串 |
| `DL - filter_name` | `filter_name` | 字符串 |
| `DL - filter_value` | `filter_value` | 字符串 |
| `DL - has_results` | `has_results` | 数字 |
| `DL - item_id` | `item_id` | 字符串 |
| `DL - item_list_name` | `item_list_name` | 字符串 |
| `DL - position` | `position` | 数字 |
| `DL - result_count` | `result_count` | 数字 |
| `DL - search_scope` | `search_scope` | 字符串 |
| `DL - search_term` | `search_term` | 字符串 |
| `DL - um_name` | `um_name` | 字符串 |

> 内置变量（变量 → 配置）需启用：`Page URL`、`Page Title`、`History Source`。

## 2. GTM 触发器

| 名称 | 类型 | 条件 |
|---|---|---|
| `Trigger - um_event` | 自定义事件 | 事件名称 **精确等于** `um_event` |
| `Trigger - History Change` | 历史记录更改 | 附加上游过滤：`History Source` 等于 `pushState`（避免筛选改 query 产生噪声 page_view） |

## 3. GTM 标签

| 名称 | 类型 | 关键配置 | 触发器 |
|---|---|---|---|
| `GA4 Event - um_event` | Google Analytics: GA4 事件 | Measurement ID = `G-V1KZT6Q50E`；Event Name = `{{DL - um_name}}`；事件参数见下表；发送电子商务数据 **关闭** | `Trigger - um_event` |
| `Google Tag - SPA update` | Google 标签 | ID = `G-V1KZT6Q50E`；配置参数 `page_location={{Page URL}}`、`page_title={{Page Title}}`、`update=true` | `Trigger - History Change` |

## 4. GA4 事件标签的参数行（逐行照抄）

| 参数名 | 值 |
|---|---|
| `entry_point` | `{{DL - entry_point}}` |
| `faculty` | `{{DL - faculty}}` |
| `filter_name` | `{{DL - filter_name}}` |
| `filter_value` | `{{DL - filter_value}}` |
| `has_results` | `{{DL - has_results}}` |
| `item_id` | `{{DL - item_id}}` |
| `item_list_name` | `{{DL - item_list_name}}` |
| `position` | `{{DL - position}}` |
| `result_count` | `{{DL - result_count}}` |
| `search_scope` | `{{DL - search_scope}}` |
| `search_term` | `{{DL - search_term}}` |

## 5. GA4 后台

1. 关闭 `管理 → 数据收集和修改 → 数据流 → 增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化`（否则与 §3 的 Google Tag 双计 page_view）。
2. `管理 → 自定义定义 → 自定义维度`：把上表每个参数注册为**事件级**自定义维度（不注册则只能在 DebugView 看到）。
3. 可选：把关键事件标记为转化。

## 6. 事件字典（代码里的注册表）

### `search`（GA4 推荐事件）

- 目的：用户主动提交搜索：记录搜了什么、按课程还是讲师、从哪个入口进来
- 接线：components/search/search-form.tsx

| 参数 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `search_term` | string | 是 | 用户输入的关键词（表单已用 zod 校验 4-30 字符） |
| `search_scope` | string | 是 | course 或 instructor |
| `entry_point` | string | 是 | SearchForm 的 variant：hero（首页）/ header（搜索页顶栏）/ dialog（顶栏弹窗）/ inline |

### `view_search_results`（GA4 推荐事件）

- 目的：搜索结果页展示：结果数，尤其是 0 结果（教务库缺口信号）
- 接线：components/course-filter.tsx, app/search/instructor/[...name]/page.tsx

| 参数 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `search_term` | string | 是 | 本次搜索的关键词 |
| `search_scope` | string | 是 | course 或 instructor |
| `result_count` | number | 是 | 服务端返回的原始结果条数（课程=课程数，讲师=讲师数），不受用户后续筛选影响 |
| `has_results` | number | 是 | 1 = 有结果，0 = 无结果（布尔在代码里归一为 1/0） |

### `filter_apply`（自定义事件）

- 目的：课程列表的筛选使用情况：用户真正在意哪个维度、筛完还剩多少条
- 接线：components/course-filter.tsx

| 参数 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `filter_name` | string | 是 | 筛选维度内部键名，如 Offering_Department / Is_Offered / Credits |
| `filter_value` | string | 是 | 用户选择的值；All 表示清除该维度 |
| `result_count` | number | 是 | 应用这次筛选之后的列表条数 |

### `select_item`（GA4 推荐事件）

- 目的：从列表进入详情的点击：来源列表、点击位置（列表 CTR）
- 接线：components/course-card.tsx, components/prof-card.tsx

| 参数 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `item_id` | string | 是 | 课程号（如 COMP1001）或讲师 id（prof_id） |
| `item_list_name` | string | 是 | catalog / search_course / search_instructor / course_instructors / professor_courses |
| `position` | number | 是 | 该条目在列表数组里的下标（广告位不占号） |
| `faculty` | string | 否 | Offering_Unit；数据里没有该字段时省略此参数，不硬凑 |

## 7. 验收

1. GTM 预览里逐条触发全部 4 个事件，确认标签被触发、`um_name` 解析成正确的事件名。
2. GA4 DebugView 逐参数核对：**该事件在注册表里声明的**参数都要有值，**没有 not set**（未声明为该事件参数的可选参数不出现属正常）。
3. 首屏 1 条 `page_view`；点课程卡后第 2 条；改筛选下拉**不产生** `page_view`；浏览器后退产生 1 条。
4. 提交并**发布**容器版本后再回到线上复验一次。

