# UMHelper next-web 实现方式调研与 iOS API 设计文档

最后更新：2026-08-16

本文档记录对 `next-web` 现有实现的调研结论，以及为 iOS 客户端（`next-ios`）新增的 HTTP API 设计。
所有新增 API 均为只读 GET 接口，与现有写入接口（POST）保持一致的数据源与字段语义。

## 1. next-web 实现方式调研

### 1.1 技术栈

- 框架：Next.js 14（App Router）
- 样式：Tailwind CSS + shadcn/ui 组件
- 数据库：PostgreSQL（Supabase 托管，表结构与 RPC 见 `supabase/schema.sql`、`supabase/migrations/`）
- 认证：Clerk（`@clerk/nextjs`）
- 数据更新：`umeh-update`（Python 脚本，读取教务处 Excel / UM Open Data API 后写入 Supabase）
- 部署：Vercel / Cloudflare Workers（opennextjs-cloudflare），线上域名 https://umeh.top

### 1.2 数据流

- 页面为 Server Component，服务端通过 `lib/database/*` 直连 Supabase：
  - `get-course-info.ts`：课程详情（本地库优先，字段缺失时回源 UM API 并回填）
  - `get-fuzzy-search.ts`：模糊搜索（调用 `search_courses` / `search_instructors_with_courses` RPC）
  - `get-comment-list.ts`：评论分页（`get_comment_page` RPC，含回复与投票历史）
  - `get-prof-info.ts`：教授-课程关联（`prof_with_course` 表，含聚合评分）
  - `get-schedule-list.ts`：上课时间表（`get_schedule_list` RPC，按当前学期过滤）
  - `get-statistics.ts`：各学院课程/评论统计（`statistics` 表）
- 客户端写入走 Next.js API Routes：
  - `POST /api/comment/[code]/[prof]`：提交评论（FormData，服务端按 7 项评分取平均写入 `result`，调用 `insert_comment_and_refresh_prof_stats` RPC；图片经 Imgur 上传）
  - `POST /api/reply`：提交回复（JSON，携带父评论字段副本，插入 `comment` 表）
  - `POST /api/vote/[comment_id]`：赞/踩/表情投票（JSON，插入 `vote` 表，唯一索引防重复）

### 1.3 关键数据表

| 表 | 用途 |
| --- | --- |
| `course_noporf` | 课程目录（代码/中英文名/学分/学院/系/授课语言等） |
| `prof_info` | 教授姓名（name） |
| `prof_with_course` | 课程-教授关系与聚合评分（result/attendance/grade/hard/reward/comments/is_offered/admin_note） |
| `comment` | 评论与回复（replyto 指向父评论；hidden 隐藏位） |
| `vote` | 投票（offset 1/-1 赞踩，0 为表情；emoji 存表情字符） |
| `schedule` + `time_location` | 上课时间地点 |
| `statistics` | 学院统计（name/course_num/comment_num） |

### 1.4 评分体系

- 评分范围 1–5：`recommend`（推荐）、`grade`（成绩）、`assignment`（工作量）、`hard`（难度）、`reward`（实用性）、`attendance`（出席检查 1/3/5）、`pre`（演示频次 1/3/5）
- `result = (attendance + pre + grade + hard + reward + assignment + recommend) / 7`
- 成绩字母映射（`lib/utils.ts get_gpa`）：>=4.7 A；4.4 A-；4.1 B+；3.7 B；3.4 B-；3.1 C+；2.7 C；2.4 C-；2.1 D+；1.7 D；1.4 D-；>0 F；0 → N/A
- 分数配色（`get_bg`）：>=3.6 绿；>=2.3 橙；>0 紫红；0 灰

## 2. 现有 API（Web 使用）

### POST /api/comment/[code]/[prof]
- FormData 字段：code、prof、attendance、pre、grade、hard、reward、assignment、recommend、content、image（可选）、verify（"1"/"0"）、verify_account
- 服务端钳制 1–5、计算 result、可选上传 Imgur、RPC 插入并刷新统计
- 返回：200 空体；400 图片上传失败；500 插入失败

### POST /api/reply
- JSON：父评论完整字段 + 覆写 content/replyto/verify/verify_account/pub_time（emoji_vote、vote_history、img 键会被服务端删除）
- 返回：200 新回复对象（附 emoji_vote=[] 与 vote_history=[]）

### POST /api/vote/[comment_id]
- JSON：{ comment, offset, created_by, emoji }
- 返回：200 回显 body；23505（重复投票）也返回 200；其余 500

## 3. 为 iOS 新增的 API

> 设计原则：只读接口复用 Server Component 同款 `lib/database` 函数，保证两端数据一致；
> 全部返回 JSON，`Cache-Control: no-store`（评论/时间表为动态数据）。

### 3.1 认证（HMAC-SHA256 时间戳签名）

本节的 6 个只读 GET 接口只向 iOS 客户端开放，浏览器/第三方直接调用一律返回 401。

- 原理（2FA/TOTP 思路）：服务端与 iOS 客户端共享密钥；客户端对「方法 + 路径 + 时间戳」计算
  HMAC-SHA256 签名放入请求头，服务端以 5 秒有效期窗口校验，防伪造与重放。
- 请求头：
  - `X-UM-Timestamp`：Unix 秒级时间戳
  - `X-UM-Signature`：`HMAC-SHA256(secret, "METHOD\npathname\ntimestamp")` 的小写十六进制
- 实现：`lib/ios-auth.ts`（`verifyIOSRequest()` / `iosUnauthorized()`）；
  签名比对用 `crypto.timingSafeEqual` 防时序攻击；`|now - timestamp| > 5s` 返回 401。
- 密钥：服务端环境变量 `UM_IOS_API_SECRET`（写入 `.env.local`，`.env.example` 仅空占位，
  不提交仓库）；iOS 侧由构建脚本从本地 `Secrets/UMSecrets.local` 注入（详见 next-ios README 第 6 节）。
- 三个 POST 接口（`/comment`、`/reply`、`/vote`）与 Web 共用，不做此校验。

> 安全边界：客户端密钥可通过逆向二进制提取；本方案目标是阻止浏览器/第三方直接调用接口并保证
> 密钥不进 git 仓库，需要更强防护时升级为 Apple DeviceCheck / App Attest。

### GET /api/course?code=ACCT1000
返回课程详情与教授列表（对应 Web `/course/[code]` 页）：

```json
{
  "course": { "courseCode": "ACCT1000", "courseTitle": "...", "offeringProgLevel": "UG",
    "suggestedYearOfStudy": "1", "credits": "3", "offeringDept": "AIM", "offeringUnit": "FBA",
    "mediumOfInstruction": "English", "gradingSystem": "Letter Grade", "courseType": "Non-GE",
    "duration": "Semester Course", "courseDescription": "...", "ilo": "..." },
  "profList": [ { "id": 1492, "comments": 22, "result": 4.14, "attendance": 2.81, "grade": 5.01,
    "hard": 4.23, "reward": 4.32, "course_id": "ACCT1000", "prof_id": "CHAN WENG HANG",
    "is_offered": 1, "admin_note": null, "admin_note_en": null } ],
  "isOffer": true
}
```

### GET /api/fuzzy_search?keyword=ACCT&type=course
- `type=course`：返回 `[{...course_noporf 全字段}]`（按 New_code 去重排序）
- `type=instructor`：返回 `[{ "prof_name": "...", "course_list": [{...course_noporf 全字段}] }]`
- `type` 缺省视为 `course`；keyword 内部已做 %20/$ 归一化

### GET /api/comment/[code]/[prof]?page=1
一次返回评价页全部数据（对应 Web `/reviews/[code]/[...prof]` 页，页大小 20）：

```json
{
  "prof":    { prof_with_course 单行（含 id/result/grade/hard/reward/comments/is_offered/admin_note） },
  "course":  { course_noporf 单行 },
  "comments": [ { 评论/回复全字段, "vote_history": [ {comment_id, offset, created_by, created_at, emoji} ] } ],
  "timetable": [ { "section": "01", "schedules": [ {"date":"MON","time":"10:00-12:00","location":"E4-3052"} ] } ],
  "page": 1,
  "total_page": 3
}
```

路径中 prof 的编码规则与 Web 一致：空格用 %20，`/` 用 `$` 转义（服务端反向还原）。

### GET /api/catalog?unit=FBA&dept=AIM
- 仅 `unit`：该学院全部课程（`gecourse` 返回全部 GE 课程）
- `unit + dept`：该系全部课程；`unit=GECourse&dept=GEGA`：该 GE 分类课程
- 返回 `[{...course_noporf 全字段}]`（按 New_code 排序）

### GET /api/statistics
返回 `statistics` 表全部行 `[{id, name, course_num, comment_num}]`（首页 Comment Bank 用）。

### GET /api/professor?name=CHAN WENG HANG
返回该教授的 `prof_with_course` 全部行（按 course_id 排序），对应 Web `/professor/[...name]` 页。

## 4. iOS 端迁移方案（What2REG@UM）

- 部署目标 iOS 26.0+，SwiftUI + Swift 6 并发（MainActor 默认隔离），Xcode 26.5
- 使用 iOS 26 Liquid Glass 设计语言：`.glassEffect()`、`GlassEffectContainer`、
  `.glassEffectID(_:in:)`（配 `@Namespace`）、`TabView(.sidebarAdaptable)`、
  `NavigationStack` 液态玻璃导航、`Gauge` 仪表盘
- API 基址：本地开发 `http://localhost:3000/api`，线上 `https://umeh.top/api`（`APIConfig` 集中管理）
- 页面映射：首页/搜索/课程详情/教授页/评价页/提交评价/课程表/学院目录 一一对应 Web 路由
- 身份：评论浏览、提交无需登录；投票/回复/图片上传在 Web 上要求 Clerk 登录。
  iOS 首版使用本机持久化匿名用户标识（UserDefaults UUID）作为 `created_by` /
  `verify_account`（verify=0），保持交互能力完整，后续可接入 Clerk iOS SDK 升级为
  已验证账号（届时 verify=1、支持图片上传与认证徽章）。

## 5. 部署说明

- 本地联调：`cd next-web && npm run dev`（:3000），iOS 模拟器直接访问 localhost；
  需在 `.env.local` 配置 `UM_IOS_API_SECRET`（与 iOS 侧 `Secrets/UMSecrets.local` 一致）
- 线上：将 next-web 重新部署到 umeh.top（Vercel 或 Cloudflare Workers）后，iOS 切换
  `APIConfig.baseURL = https://umeh.top/api` 即可
