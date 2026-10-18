# AI 选课助手 V1 实施验证

- 分支：`feat/ai-timetable-agent`
- 计划：[2026-10-18-ai-assistant-v1.md](../plans/2026-10-18-ai-assistant-v1.md)
- Spike：[2026-10-18-assistant-v1-workers-spike.md](2026-10-18-assistant-v1-workers-spike.md)

## 1. Bundle（`npm run build`）

验收：非 `/timetable` 路由 ≤ 基线 + 1 kB；shared 不变；`/timetable` ≤ 基线 + 2 kB。

| 路由 | 基线 First Load | V1 First Load | 差值 |
|---|---|---|---|
| `/` | 175 kB | 176 kB | +1 kB |
| `/course/[code]` | 132 kB | 133 kB | +1 kB |
| `/timetable` | 203 kB | 205 kB | +2 kB |
| First Load JS shared by all | 103 kB | 103 kB | 0 |
| other shared chunks | 2.56 kB | 3.01 kB | +0.45 kB |

Access-control change (2026-10-18, `docs/superpowers/plans/2026-10-18-assistant-access-control.md` Task 5): `/` 176 kB, `/course/[code]` 133 kB, `/timetable` 206 kB (launcher access check stays on timetable first load), shared 103 kB.

## 2. 手动验证（Task 10）

（待填）
