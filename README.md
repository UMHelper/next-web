# UMHelper Next Web

UMHelper Next Web 是一个 `Next.js 14 + Supabase` 项目。

仓库里已经包含本地开发所需的核心资产：

- [docs/development-guide.md](/Users/box/UMHelper/next-web/docs/development-guide.md:1)
- [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1)
- [supabase/seed.sql](/Users/box/UMHelper/next-web/supabase/seed.sql:1)
- [supabase/migrations](/Users/box/UMHelper/next-web/supabase/migrations:1)
- [supabase/config.toml](/Users/box/UMHelper/next-web/supabase/config.toml:1)
- [.env.example](/Users/box/UMHelper/next-web/.env.example:1)
- [scripts/bootstrap-local-db.sh](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.sh:1)
- [scripts/bootstrap-local-db.ps1](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.ps1:1)

## Quick Start

推荐方案是 `Docker + Supabase CLI`，这样本地会同时跑起：

- Supabase API
- Postgres
- Supabase Studio
- Next.js 应用

### macOS

```bash
cp .env.example .env.local
npm install
brew install supabase/tap/supabase
supabase start
# Fill .env.local with the local anon/service_role keys printed by Supabase CLI
./scripts/bootstrap-local-db.sh
npm run dev
```

### Linux

```bash
cp .env.example .env.local
npm install
npx supabase start
# Fill .env.local with the local anon/service_role keys printed by Supabase CLI
./scripts/bootstrap-local-db.sh
npm run dev
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env.local
npm install
npx supabase start
# Fill .env.local with the local anon/service_role keys printed by Supabase CLI
.\scripts\bootstrap-local-db.ps1
npm run dev
```

启动后应当能访问：

- App: `http://localhost:3000`
- Supabase Studio: `http://127.0.0.1:54323`

本地数据库默认连接串：

- `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

`.env.example` 里不再放任何真实或默认可用的 secret。运行 `supabase start` 后，把 CLI 输出的本地 key 填到 `.env.local`。

## 关于 migrations

仓库里有 [supabase/migrations](/Users/box/UMHelper/next-web/supabase/migrations:1)，但当前本地初始化流程不会逐条执行这些 migration。

原因是：

- [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1) 已经是包含这些 migration 结果的当前结构快照
- onboarding 的目标是先让新成员最快把本地库跑起来

当前规则是：

- 本地初始化：导入 `schema.sql` + `seed.sql`
- 后续新改动：继续新增 `supabase/migrations/*.sql`
- 不要在已经导入 `schema.sql` 后，再把现有 migration 手工重放一遍

## 本地数据库 SQL

建表 SQL：

- [supabase/schema.sql](/Users/box/UMHelper/next-web/supabase/schema.sql:1)

种子数据：

- [supabase/seed.sql](/Users/box/UMHelper/next-web/supabase/seed.sql:1)

导入脚本：

- macOS / Linux: [scripts/bootstrap-local-db.sh](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.sh:1)
- Windows: [scripts/bootstrap-local-db.ps1](/Users/box/UMHelper/next-web/scripts/bootstrap-local-db.ps1:1)

## 备用方案

如果你不想跑 Docker，也可以只安装本地 PostgreSQL，再手动导入：

- `supabase/schema.sql`
- `supabase/seed.sql`

但这种方式只适合调 SQL 或看表结构，不适合完整跑起网站，因为项目运行时依赖 Supabase API 层，而不只是 Postgres。

## 详细说明

跨平台完整文档见：

- [docs/development-guide.md](/Users/box/UMHelper/next-web/docs/development-guide.md:1)
