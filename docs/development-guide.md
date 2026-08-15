# UMHelper Next Web 开发指引

最后更新：2026-08-15

这份文档只做两件事：

1. 直接告诉你怎么把项目跑起来。
2. 说明本地数据库 SQL 在哪、怎么导入。

## 1. 先看这里

仓库里已经准备好的本地开发资产：

- [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1)
  - 完整建表 SQL
- [supabase/seed.sql](/Users/box/UMHelper/next-web/supabase/seed.sql:1)
  - 最小种子数据
- [supabase/config.toml](/Users/box/UMHelper/next-web/supabase/config.toml:1)
  - 本地 Supabase 配置
- [scripts/bootstrap-local-db.sh](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.sh:1)
  - 一键导入脚本
- [.env.example](/Users/box/UMHelper/next-web/.env.example:1)
  - 本地环境变量模板

另外，仓库里还有：

- [supabase/migrations](/Users/box/UMHelper/next-web/supabase/migrations:1)
  - 数据库增量变更历史

这两类文件职责不同：

- `supabase/schema.sql`
  - 当前数据库结构的基线快照
  - 让新成员最快把本地库跑起来
- `supabase/migrations/*.sql`
  - 数据库是如何演进到当前状态的增量历史
  - 用于后续继续提交结构变更

当前本地启动流程不会逐条执行 `supabase/migrations/*.sql`。

原因是 `schema.sql` 已经包含了这些 migration 生效后的最终结构。初始化时先导入 `schema.sql`，再重复执行现有 migration，会出现重复或冲突。

## 2. 跑起来的两种方式

你只需要选一种：

1. `Docker + Supabase CLI`
   - 推荐
   - 最接近 Supabase 官方工作流
2. `本地 PostgreSQL`
   - 不想装 Docker 时使用
   - 只要能提供一个本地 Postgres 即可

## 3. 方式 A：Docker + Supabase CLI

### 3.1 你需要先安装

- Node.js 20+
- npm 10+
- 一个兼容 Docker API 的容器运行时
- Supabase CLI

容器运行时建议：

- macOS
  - Docker Desktop
  - OrbStack
  - Colima
- Linux
  - Docker Desktop
  - Docker Engine + Docker Compose
  - Podman
- Windows
  - Docker Desktop
  - Rancher Desktop

Supabase CLI 安装方式：

- macOS

```bash
brew install supabase/tap/supabase
```

- Linux

```bash
npm install supabase --save-dev
```

- Windows

```powershell
npm install supabase --save-dev
```

说明：

- 按 Supabase 官方文档，CLI 可以作为项目依赖通过 `npm install supabase --save-dev` 安装，此时命令要写成 `npx supabase ...`。
- 在这台 `darwin-arm64` 机器上，`npx supabase` 实测存在二进制包匹配问题，所以 `macOS` 文档优先推荐 `brew install`。
- `.env.example` 里的 key 现在都是占位符，不是可直接使用的真实值。

确认安装成功：

- macOS

```bash
supabase --version
docker --version
```

- Linux / Windows

```bash
npx supabase --version
docker --version
```

### 3.2 直接照抄执行

- macOS

```bash
cp .env.example .env.local
npm install
supabase start
./scripts/bootstrap-local-db.sh
npm run dev
```

- Linux

```bash
cp .env.example .env.local
npm install
npx supabase start
./scripts/bootstrap-local-db.sh
npm run dev
```

- Windows PowerShell

```powershell
Copy-Item .env.example .env.local
npm install
npx supabase start
.\scripts\bootstrap-local-db.ps1
npm run dev
```

执行完 `supabase start` 或 `npx supabase start` 后，记得把 CLI 输出里的本地：

- API URL
- anon key
- service_role key

填回 `.env.local` 对应字段。不要把生产 `.env.local` 直接复制给本地开发用。

### 3.3 这几步分别做了什么

- `cp .env.example .env.local`
  - 生成本地环境变量
- `npm install`
  - 安装前端依赖
- `supabase start` / `npx supabase start`
  - 起本地 Supabase 容器
- `./scripts/bootstrap-local-db.sh` / `.\scripts\bootstrap-local-db.ps1`
  - 把 [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1) 和 [supabase/seed.sql](/Users/box/UMHelper/next-web/supabase/seed.sql:1) 导入本地库
- `npm run dev`
  - 启动 Next.js

当前这套流程的规则是：

- 新成员初始化：导入 `schema.sql` + `seed.sql`
- 后续数据库新改动：继续新增 `supabase/migrations/*.sql`

### 3.4 启动后你应该能访问

- App: `http://localhost:3000`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### 3.5 验收标准

至少确认这四件事：

1. `http://localhost:3000` 能打开。
2. `http://127.0.0.1:54323` 能打开 Studio。
3. Studio 里能看到 `course_noporf`、`prof_with_course`、`comment`、`vote`。
4. `course_noporf` 表里能查到 `COMP-LOCAL-101`。

### 3.6 Docker 方案常见问题

如果 `supabase start` 失败：

- 先确认 Docker 已经启动。
- macOS 用 `supabase stop` 后重试。
- Linux / Windows 用 `npx supabase stop` 后重试。

如果导库脚本失败：

- 先确认本地数据库端口是 `54322`
- 再手动执行：

- macOS / Linux

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/schema.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed.sql
```

- Windows PowerShell

```powershell
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/schema.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed.sql
```

## 4. 方式 B：本地安装 PostgreSQL

### 4.1 你需要先安装

- Node.js 20+
- npm 10+
- PostgreSQL 15+
- `psql`

- macOS 一种常见装法：

```bash
brew install postgresql@15
brew services start postgresql@15
```

- Linux 一种常见装法：

```bash
sudo apt-get update
sudo apt-get install -y postgresql-15 postgresql-client-15
sudo systemctl start postgresql
```

- Windows 一种常见装法：
  - 安装 PostgreSQL 官方安装器，并确保勾选 `psql`
  - 或使用 `winget install PostgreSQL.PostgreSQL`

### 4.2 创建本地数据库

下面给的是最简单做法，直接创建一个叫 `umhelper_local` 的数据库：

```bash
createdb umhelper_local
```

如果你的本地 PostgreSQL 没有默认超级用户权限，也可以手动指定连接参数，只要最后能得到一个可写数据库即可。

### 4.3 准备环境变量

先复制模板：

- macOS / Linux

```bash
cp .env.example .env.local
```

- Windows PowerShell

```powershell
Copy-Item .env.example .env.local
```

然后把 `.env.local` 里的 Supabase 地址改成你自己的后端地址。

注意：当前项目的 Supabase 客户端默认是按 Supabase API 地址工作的，不是直接走 Postgres 连接串。所以如果你只装了纯 PostgreSQL，没有 Supabase API / Auth / Studio 层，这个方案只适合：

- 写 SQL
- 验证表结构
- 跑本地数据库查询

**如果你要把整个网站跑起来，仍然推荐方式 A。**

### 4.4 导入数据库 SQL

- macOS / Linux

```bash
psql postgres://localhost/umhelper_local -f supabase/schema.sql
psql postgres://localhost/umhelper_local -f supabase/seed.sql
```

- Windows PowerShell

```powershell
psql postgres://localhost/umhelper_local -f supabase/schema.sql
psql postgres://localhost/umhelper_local -f supabase/seed.sql
```

如果你的连接串不同，替换成自己的即可，例如：

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local -f supabase/schema.sql
psql postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local -f supabase/seed.sql
```

### 4.5 用脚本导入

也可以直接：

- macOS / Linux

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local ./scripts/bootstrap-local-db.sh
```

- Windows PowerShell

```powershell
.\scripts\bootstrap-local-db.ps1 -DbUrl "postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local"
```

### 4.6 什么时候选这种方式

只有在下面这种情况下才建议：

- 你只想看表结构
- 你只想调 SQL
- 你不需要 Supabase API / Auth / Studio
- 你的机器不方便跑 Docker

## 5. 环境变量怎么配

先复制：

- macOS / Linux

```bash
cp .env.example .env.local
```

- Windows PowerShell

```powershell
Copy-Item .env.example .env.local
```

最重要的变量只有这几个：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

兼容旧代码时也会 fallback 到：

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`.env.example` 现在只提供字段模板，不提供真实 key。

如果你使用本地 Supabase，运行 `supabase start` 或 `npx supabase start` 后，把输出里的本地 key 填进 `.env.local`。

不要把生产环境的 `.env.local` 直接发给新成员作为默认开发配置。

如果你需要真实 Clerk 登录，再把下面两个换成真实值：

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## 6. 本地数据库 SQL 在哪

建表 SQL：

- [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1)

种子数据：

- [supabase/seed.sql](/Users/box/UMHelper/next-web/supabase/seed.sql:1)

一键导入脚本：

- [scripts/bootstrap-local-db.sh](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.sh:1)
- [scripts/bootstrap-local-db.ps1](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.ps1:1)

迁移历史：

- [supabase/migrations](/Users/box/UMHelper/next-web/supabase/migrations:1)

注意：

- 当前初始化脚本不会执行 `supabase/migrations/*.sql`
- 因为 `schema.sql` 已经是这些 migration 全部落地后的结构快照
- 如果后续你改数据库，应该继续新增 migration，而不是只改 `schema.sql`

默认连接串：

- `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

如果你不是用 Supabase Docker，而是自己装的 PostgreSQL，就通过环境变量覆盖：

- macOS / Linux

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local ./scripts/bootstrap-local-db.sh
```

- Windows PowerShell

```powershell
.\scripts\bootstrap-local-db.ps1 -DbUrl "postgresql://postgres:postgres@127.0.0.1:5432/umhelper_local"
```

## 7. 项目里的 Supabase 入口在哪

Supabase 客户端入口：

- [lib/supabase/shared.ts](/Users/box/UMHelper/next-web/lib/supabase/shared.ts:1)

职责分层：

- `createSupabaseBrowserClient()`：浏览器端调用
- `createSupabaseServerClient()`：服务端读取
- `createSupabaseAdminClient()`：服务端高权限写入

如果你在排查“为什么本地连不上库”，先看这个文件。

## 8. 数据库结构总览

以下结构来自 **2026-08-15 对远程 Supabase `public` schema 的只读采样**。

### 8.1 表清单与大致体量

| 表名 | 估算行数 | 作用 |
| --- | ---: | --- |
| `course_noporf` | 3313 | 课程主表，保存课程基础信息 |
| `prof_info` | 1964 | 教师主表 |
| `prof_with_course` | 8308 | 教师与课程关系表，同时承载评分聚合 |
| `offer` | 10083 | 开课记录 |
| `schedule` | 10077 | 课程与时间地点的关联 |
| `time_location` | 5593 | 上课日期/时间/地点维表 |
| `comment` | 28892 | 课程评论与回复 |
| `vote` | 992 | 评论投票与表情反应 |
| `statistics` | 7 | 站点统计数据 |

### 8.2 你应该先理解的核心关系

项目最重要的不是所有表，而是下面这条主链路：

`course_noporf -> prof_with_course -> comment -> vote`

含义：

- `course_noporf` 定义课程本身。
- `prof_with_course` 连接课程和教师，并缓存该教师在该课程下的评分聚合。
- `comment.course_id` 指向 `prof_with_course.id`，也就是评论实际上挂在“课程-教师组合”上，而不是直接挂在课程表上。
- `vote.comment_id` 指向 `comment.id`。

课表链路则是：

`prof_with_course -> offer -> schedule -> time_location`

这部分主要服务课程开设信息与时间地点展示。

### 8.3 核心表说明

#### `course_noporf`

课程主表，主键是 `New_code`。

关键字段：

- `New_code`：课程代码，主键
- `courseTitleEng` / `courseTitleChi`：课程中英文名
- `Credits`
- `Course_Duration`
- `Medium_of_Instruction`
- `Is_Offered`
- `offeringProgLevel`
- `courseType`
- `suggestedYearOfStudy`
- `gradingSystem`
- `courseDescription`
- `ilo`

常见用途：

- 课程详情页主数据
- 课程搜索
- catalog / sitemap 枚举

#### `prof_info`

教师主表，主键是 `name`。

关键字段：

- `name`
- `temp`

这张表比较薄，更多像教师名录。

#### `prof_with_course`

这是项目最核心的业务表之一。

主键：

- `id`

唯一索引：

- `(course_id, prof_id)`

关键字段：

- `course_id`
- `prof_id`
- `comments`
- `result`
- `attendance`
- `grade`
- `hard`
- `reward`
- `is_offered`
- `admin_note`
- `admin_note_en`

这张表同时承担两类职责：

1. 表示某门课和某位老师的组合关系。
2. 缓存该组合下评论统计后的聚合评分。

这也是评论页、教师页、课程页都会频繁读取的表。

#### `comment`

评论和回复表，主键是 `id`。

关键字段：

- `id`
- `course_id`
- `replyto`
- `content`
- `content_en`
- `img`
- `pub_time`
- `hidden`
- `verify`
- `verify_account`
- `upvote`
- `downvote`
- `attendance`
- `pre`
- `grade`
- `hard`
- `reward`
- `recommend`
- `assignment`
- `result`

注意点：

- `course_id` 指向 `prof_with_course.id`
- `replyto` 非空时表示这是一条回复
- `hidden` 用于隐藏评论

#### `vote`

评论投票 / 表情反应表。

关键字段：

- `comment_id`
- `created_by`
- `offset`
- `emoji`
- `created_at`

约束设计：

- `vote_unique_direction_idx`：限制同一用户对同一评论只能有一条方向投票
- `vote_unique_reaction_idx`：限制同一用户对同一评论同一 emoji 只能有一条反应

#### `offer`

开课记录表。

关键字段：

- `id`
- `year`
- `sem`
- `section`
- `course_id`

#### `schedule`

连接开课记录和时间地点。

关键字段：

- `id`
- `course_id`
- `time_location_id`

#### `time_location`

上课时间地点维表。

关键字段：

- `id`
- `date`
- `times`
- `location`

#### `statistics`

轻量统计表。

关键字段：

- `id`
- `name`
- `course_num`
- `comment_num`

## 9. 当前数据库函数（RPC）

当前 `public` schema 中可见的主要函数如下：

- `get_comment_list`
- `get_comment_page`
- `get_course_list_by_prof`
- `get_offer_list_by_prof`
- `get_prof_course_id`
- `get_schedule_list`
- `insert_comment_and_refresh_prof_stats`
- `refresh_prof_with_course_stats`
- `search_courses`
- `search_instructors_with_courses`

其中最重要的是：

- `get_comment_page`
  - 评论页读取主入口
  - 一次返回评论、回复和投票历史
- `insert_comment_and_refresh_prof_stats`
  - 评论写入主入口
  - 在数据库内完成“插入评论 + 刷新 `prof_with_course` 聚合”
- `search_courses`
  - 课程搜索 RPC
- `search_instructors_with_courses`
  - 教师搜索 RPC

相关 migration 可参考：

- [supabase/migrations/20260812_comment_page_rpc.sql](/Users/box/UMHelper/next-web/supabase/migrations/20260812_comment_page_rpc.sql:1)
- [supabase/migrations/20260812_comment_write_rpc.sql](/Users/box/UMHelper/next-web/supabase/migrations/20260812_comment_write_rpc.sql:1)
- [supabase/migrations/20260812_course_search_rpc.sql](/Users/box/UMHelper/next-web/supabase/migrations/20260812_course_search_rpc.sql:1)
- [supabase/migrations/20260812_instructor_search_rpc.sql](/Users/box/UMHelper/next-web/supabase/migrations/20260812_instructor_search_rpc.sql:1)

## 10. 当前索引与查询设计重点

下面这些索引是当前性能上最值得知道的部分：

- `prof_with_course_course_prof_unique_idx`
  - 保证 `(course_id, prof_id)` 唯一
- `course_noporf_code_trgm_idx`
  - 支持课程代码模糊搜索
- `course_noporf_title_eng_trgm_idx`
  - 支持英文课程名模糊搜索
- `comment_course_id_visible_top_level_idx`
  - 加速课程评论页拉取顶层评论
- `comment_replyto_visible_idx`
  - 加速回复查询
- `vote_unique_direction_idx`
  - 防重复点赞/踩
- `vote_unique_reaction_idx`
  - 防重复 emoji reaction

如果你在排查“为什么这个页面会慢”，优先看这几张表：

- `prof_with_course`
- `comment`
- `course_noporf`

## 11. 代码里数据库入口在哪

新成员最容易迷路的地方不是 SQL，而是“不知道项目从哪里读库、哪里写库”。

优先看这些文件：

- [lib/supabase/shared.ts](/Users/box/UMHelper/next-web/lib/supabase/shared.ts:1)
- [lib/supabase/browser.ts](/Users/box/UMHelper/next-web/lib/supabase/browser.ts:1)
- [lib/supabase/server.ts](/Users/box/UMHelper/next-web/lib/supabase/server.ts:1)
- [lib/supabase/admin.ts](/Users/box/UMHelper/next-web/lib/supabase/admin.ts:1)
- [lib/database/get-course-info.ts](/Users/box/UMHelper/next-web/lib/database/get-course-info.ts:1)
- [lib/database/get-prof-info.ts](/Users/box/UMHelper/next-web/lib/database/get-prof-info.ts:1)
- [lib/database/get-comment-list.ts](/Users/box/UMHelper/next-web/lib/database/get-comment-list.ts:1)
- [lib/database/get-fuzzy-search.ts](/Users/box/UMHelper/next-web/lib/database/get-fuzzy-search.ts:1)

写操作入口主要看：

- [app/api/comment/[code]/[prof]/route.tsx](/Users/box/UMHelper/next-web/app/api/comment/[code]/[prof]/route.tsx:1)
- [app/api/reply/route.ts](/Users/box/UMHelper/next-web/app/api/reply/route.ts:1)
- [app/api/vote/[comment_id]/route.ts](/Users/box/UMHelper/next-web/app/api/vote/[comment_id]/route.ts:1)

## 12. 当前 Supabase 安全状态

基于 2026-08-15 的只读检查，当前远程 `public` schema 的表：

- `comment`
- `course_noporf`
- `offer`
- `prof_info`
- `prof_with_course`
- `schedule`
- `statistics`
- `time_location`
- `vote`

**全部没有启用 RLS**。

这件事对开发文档很重要，因为它解释了两个现象：

1. 为什么当前项目可以比较直接地用 key 访问 `public` 表。
2. 为什么环境变量管理必须非常谨慎，不能把高权限 key 当成普通前端配置看待。

如果后续要继续规范化，建议把“开启 RLS + 明确 public read / admin write 边界”作为下一阶段治理任务。

## 13. 推荐的下一步标准化方案（可选，但强烈建议）

如果你们希望真正把新成员 onboarding 做顺，建议把项目往下面这个方向补齐。

### 13.1 把当前 schema 基线转成正式 migration

当前仓库已经有：

- `supabase/schema.sql`
- `supabase/migrations/*.sql`
- `supabase/config.toml`

建议维护者下一步执行一次：

1. 安装 Supabase CLI
2. 链接远程项目：

```bash
supabase link --project-ref zqdlpoiiihrtflyjljal
```

3. 从远程库重新拉取并整理 migration：

```bash
supabase db pull
```

目标是把规则固定下来：

- 新成员初始化时，有一份可信的 schema 基线可以直接导入
- 后续开发变更时，只通过新增 migration 记录差异
- 定期校验 `schema.sql` 与 migration 历史是否仍然一致

### 13.2 建议继续补强的文件

建议后续补这些文件：

- `docs/database-schema.md` 或保留本文作为单一入口
- `README.md` 中的快速启动章节

## 14. 新成员建议阅读顺序

第一次接手这个项目，建议按这个顺序读：

1. 本文
2. [lib/supabase/shared.ts](/Users/box/UMHelper/next-web/lib/supabase/shared.ts:1)
3. [lib/database/get-course-info.ts](/Users/box/UMHelper/next-web/lib/database/get-course-info.ts:1)
4. [lib/database/get-comment-list.ts](/Users/box/UMHelper/next-web/lib/database/get-comment-list.ts:1)
5. [app/api/comment/[code]/[prof]/route.tsx](/Users/box/UMHelper/next-web/app/api/comment/[code]/[prof]/route.tsx:1)
6. `supabase/migrations/*.sql`

如果你只想先搞懂业务主链路，只看这四张表就够了：

- `course_noporf`
- `prof_with_course`
- `comment`
- `vote`
