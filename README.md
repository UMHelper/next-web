# UMHelper Next Web

UMHelper Next Web 是一个 `Next.js 15 + Supabase` 项目。

仓库里已经包含本地开发所需的核心资产：

- [docs/development-guide.md](docs/development-guide.md)
- [supabase/schema.sql](supabase/schema.sql)
- [supabase/seed.sql](supabase/seed.sql)
- [supabase/migrations](supabase/migrations)
- [supabase/config.toml](supabase/config.toml)
- [.env.example](.env.example)
- [scripts/bootstrap-local-db.sh](scripts/bootstrap-local-db.sh)
- [scripts/bootstrap-local-db.ps1](scripts/bootstrap-local-db.ps1)

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

仓库里有 [supabase/migrations](supabase/migrations)。构建/部署前会自动应用还没执行过的 migration，脚本在 [scripts/db-migrate.mjs](scripts/db-migrate.mjs)。

- `npm run build`：`prebuild` 先跑 `npm run db:migrate`；没有 `SUPABASE_DB_URL` 时跳过并告警
- `npm run deploy`：`predeploy` 先跑同一个脚本（`--required`）；没有 `SUPABASE_DB_URL` 时直接失败，避免漏迁移上线
- `npm run build:pages` / `npm run upload` 不自动执行；需要时先手动 `npm run db:migrate`
- 账本：`public.schema_migrations(filename, checksum, applied_at)`
- 首次运行时，`20261018_assistant_access.sql` 及更早的文件会被登记为已应用，**不会重放**（自动化之前它们是手工执行的，而且不全是幂等的）
- 之后新增的 `supabase/migrations/*.sql` 会在下次 build/deploy 时按文件名顺序执行
- `PREVIEW_DB_READONLY=1` / `PREVIEW_MODE=1` 时跳过，preview worker 永远不会写生产库

手动查看 / 执行：

```bash
npm run db:migrate:status   # 只读，列出待执行的迁移
npm run db:migrate          # 立即执行待执行的迁移
```

当前规则是：

- 本地新库：先导入 `schema.sql` + `seed.sql`，再让脚本只补之后的增量
- 后续新改动：继续新增 `supabase/migrations/*.sql`（文件名 `YYYYMMDD_描述.sql`，保证排序）
- 不要在已经导入 `schema.sql` 后，再把历史 migration 手工重放一遍

## 本地数据库 SQL

建表 SQL：

- [supabase/schema.sql](supabase/schema.sql)

种子数据：

- [supabase/seed.sql](supabase/seed.sql)

导入脚本：

- macOS / Linux: [scripts/bootstrap-local-db.sh](scripts/bootstrap-local-db.sh)
- Windows: [scripts/bootstrap-local-db.ps1](scripts/bootstrap-local-db.ps1)

## 备用方案

如果你不想跑 Docker，也可以只安装本地 PostgreSQL，再手动导入：

- `supabase/schema.sql`
- `supabase/seed.sql`

但这种方式只适合调 SQL 或看表结构，不适合完整跑起网站，因为项目运行时依赖 Supabase API 层，而不只是 Postgres。

## 详细说明

跨平台完整文档见：

- [docs/development-guide.md](docs/development-guide.md)
