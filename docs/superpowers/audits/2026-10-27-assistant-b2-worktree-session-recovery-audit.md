# What2Reg AI — B.2 Worktree, Cursor Session & Recovery Audit

- **Audit date:** 2026-10-27
- **Auditor mode:** read-only (no commits, checkouts, stashes, worktree changes, or process termination)
- **Repository:** `/Users/thomaswu/workspace/next-web` (also accessible as `/Users/thomaswu/Workspace/next-web` on case-insensitive APFS)
- **Git common dir:** `/Users/thomaswu/workspace/next-web/.git`

---

## 1. Executive summary

The B.2 remediation work **does not live on the branch checked out in the primary Cursor workspace**. The main worktree is still at B.1 (`718afd8` on `feat/assistant-v2-3-5-b-discovery`). All B.2 commits (16 commits after B.1) exist **only** on `feat/assistant-v2-3-5-b2-remediation` in worktree `.worktrees/assistant-v2-3-5-b2` at **`69a94e7`**.

**Two sequential regressions** overwrote reviewed Tasks 1–2 after they had been fixed:

1. **`1e7d96c`** (2026-10-26 22:10) — re-tightened `eveningStartArgs`, removed fit-grader negation/compaction logic, and deleted many grader tests (Co-authored-by Cursor).
2. **`22d331f`** (2026-10-26 22:30) — added A.4 regrade harness **on top of the regressed tree** and again changed `discovery-cases.ts` / `discovery-grade.ts` / removed ~98 lines from `eval-discovery.test.ts`.

Commit **`f7aa687`** (parent of `1e7d96c`) is the **last verified-good integrated state** for reviewed Tasks 1–2 while already including Task 3 metric work from earlier commits.

**Cursor visibility:** A **`cursor-agent` worker** (PID **8771**, started 2026-10-26 ~20:33) has `--worker-dir` set to the B.2 worktree. That explains an agent session that does not appear tied to the main-folder chat. Two additional workers (**7279**, **9062**) point at the main repo path (case variants of the same tree). **No HEAD or porcelain changes** were observed during a 3-second re-check mid-audit.

**Remote:** `feat/assistant-v2-3-5-b2-remediation` has **no upstream on `origin`** (local-only branch).

**Go / no-go:** **NO-GO** for continuing B.2 product work until Tasks 1–2 are restored on the canonical branch/worktree and concurrent agent workers are frozen.

---

## 2. Worktree inventory

| Worktree path | Branch | HEAD | Subject (first line) | Dirty? | Untracked? | Suspected owner | Risk |
|---|---|---|---|---|---|---|---|
| `/Users/thomaswu/workspace/next-web` | `feat/assistant-v2-3-5-b-discovery` | `718afd8` | B.1 discovery correctness… | No (tracked clean) | Yes — 2 docs (`b2` plan + forensic audit) | Primary Cursor window / worker **9062** & **7279** | **High** — UI shows B.1-only code; easy to edit wrong tree |
| `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2` | `feat/assistant-v2-3-5-b2-remediation` | `69a94e7` | pick browse versus discovery… | No (tracked clean) | Same 2 untracked docs | B.2 agent worker **8771** (inferred) | **Critical** — canonical B.2 commits; regressed Tasks 1–2 at HEAD |
| `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-1-ux` | `feat/assistant-v2-1-ux-refinement` | `2760617` | catalog discovery compact list | No | No | Unrelated UX work (inferred) | **Low** — separate branch |

**Worktree metadata (verified):** three registered worktrees; none locked; no `index.lock`; not prunable.

**Path note:** `git worktree list` shows the main path as `/Users/thomaswu/Workspace/next-web`; shell `pwd` during audit matched that spelling. Same physical repo.

---

## 3. Branch / commit graph (B.2 relevant)

```
718afd8  feat/assistant-v2-3-5-b-discovery  (main worktree — B.1 baseline)
    |
    +--- feat/assistant-v2-3-5-b2-remediation (only in b2 worktree):
          fadb009  version case sets b2-v2
          4b97630  v1/v2 case sets
          ... Tasks 1–2 commits ...
          e85a27d  Task 3 metric tests
          b2eec0f  evening window (reviewed)
          f7aa687  parsed-call args + restores evening/fit  ← last good Tasks 1–2
          1e7d96c  REGRESSION (Tasks 1–2) / metric refactor
          22d331f  A.4 regrade + REGRESSION (Tasks 1–2 tests)
          e8afe55  A.5 harness cancellation / artifacts
          69a94e7  B.1 tool-choice prompt/contract (HEAD)
```

**Commits ahead of B.1 on b2 branch:** 16 (listed by `git log feat/assistant-v2-3-5-b2-remediation --not feat/assistant-v2-3-5-b-discovery`).

**Known anchors (updated):**

| Hash | Role at audit time |
|---|---|
| `718afd8` | B.1 on discovery branch (main worktree) |
| `f7aa687` | Last good Tasks 1–2 + Task 3 foundation |
| `1e7d96c` | First regression wave (still on branch) |
| `69a94e7` | B.2 branch HEAD |

---

## 4. Cursor / process visibility

### Verified

- **Three `cursor-agent worker` processes** (macOS `ps`, 2026-10-27 ~10:34 local):
  - **8771** — `worker-dir` = `.../.worktrees/assistant-v2-3-5-b2`
  - **7279** — `worker-dir` = `.../workspace/next-web`
  - **9062** — `worker-dir` = `.../Workspace/next-web`
- **Cursor.app** renderer/helper processes open; **no** evidence of writes to git refs during audit (HEAD stable on all worktrees).
- **`lsof`** showed Cursor reading `.git` pack/index; **`agy`** (Cursor-related) read `FETCH_HEAD`, `COMMIT_EDITMSG` — historical, not proof of active commit.

### Classification

| Suspected session | Classification |
|---|---|
| Worker on B.2 worktree (8771) | **Process observed; writing status unknown** (idle since last commit 2026-10-26 23:19) |
| Workers on main repo (7279, 9062) | **Process observed; writing status unknown** |
| Invisible chat in UI | **Cannot determine** — no access to Cursor conversation registry; worker-dir strongly suggests separate workspace root |
| Active git mutation during audit | **No evidence found** |

### Manual Cursor checks (for Lua)

1. **File → Open Recent** — look for a window rooted at `.worktrees/assistant-v2-3-5-b2` or the branch `feat/assistant-v2-3-5-b2-remediation`.
2. **Agent / Cloud workers** — if the product shows background workers, inspect labels matching `cursor-agent-worker-d182af9757` (8771) or open the B.2 folder explicitly.
3. **Chat history** — search for commits `1e7d96c`, `22d331f`, or messages about “metric split” / “regrade” (timestamps ~2026-10-26 21:50–23:20 +0800).

---

## 5. Chronological timeline (conflicts)

| Time (+0800) | Branch / worktree | Commit / change | What happened | Confirmed? |
|---|---|---|---|---|
| 2026-10-26 19:44 | discovery / main | `718afd8` | B.1 committed; discovery branch baseline | Yes |
| 2026-10-26 20:49–21:50 | b2 worktree | `fadb009`…`9772a9a` | Task 1 case sets + Task 2 fit grader iterations | Yes |
| 2026-10-26 21:51 | b2 | `e85a27d` | Task 3 metric tests | Yes |
| 2026-10-26 21:54 | b2 | `b2eec0f`, `f7aa687` | Evening window + parsed-call grading fixes | Yes |
| 2026-10-26 22:10 | b2 | **`1e7d96c`** | Reverted evening args & fit grader; stripped tests | Yes (diff) |
| 2026-10-26 22:30 | b2 | **`22d331f`** | Added regrade; **again** regressed cases/grader/tests | Yes (diff) |
| 2026-10-26 22:54 | b2 | `e8afe55` | A.5 eval harness cancellation / partial artifacts | Yes |
| 2026-10-26 23:19 | b2 | `69a94e7` | B.1 tool-choice prompt + contract tests | Yes |
| 2026-10-27 audit | all | (no new commits) | Stable HEAD; 2 untracked doc copies per main+b2 | Yes |

**Conflict onset:** **`1e7d96c` immediately after `f7aa687`** — a second agent pass undid reviewed fixes while keeping the branch line linear.

---

## 6. Uncommitted-work preservation inventory

| Worktree | File / change | Committed? | Unique work? | Preservation priority |
|---|---|---|---|---|
| Main | `docs/.../2026-10-26-assistant-v2-3-5-b2-remediation.md` | No (untracked) | Plan copy | **Medium** — duplicate of b2 copy; keep one canonical after merge |
| Main | `docs/.../2026-10-26-assistant-v2-3-5-b2-forensic-failure-analysis.md` | No | Forensic copy | **Medium** — same |
| B.2 | Same two paths | No | Duplicate untracked | **Medium** |
| Main | All B.2 source | N/A | **Missing** — still at B.1 | **High** — do not assume main worktree has B.2 |
| B.2 | Tracked tree @ `69a94e7` | Yes | Full B.2 branch | **Critical** |
| B.2 | `.eval-results` regrade outputs | Not found in repo snapshot | Unknown | **Low** — none matched `discovery-regrade*` at audit |

No staged or unstaged tracked modifications in any worktree.

---

## 7. Task 1–3 correctness comparison

Plan reference: `docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b2-remediation.md` (Phase A.1–A.3).

| Task | Expected (reviewed) | Main branch (`718afd8`) | B.2 worktree HEAD (`69a94e7`) | Reviewed version recoverable? | Verdict |
|---|---|---|---|---|---|
| **1 — Case sets / rubric** | v1+v2 coexist; holdout frozen; `b2-v2` stamp; evening `startAfter:18:00` valid without `endBefore` **and** with `endBefore > 18:00`; reject 18:00→08:00 | **Missing** — pre-B.2 `DISCOVERY_CASES` only | **Partial** — `discovery-case-sets.ts`, `CASE_SET_VERSION=b2-v2`, v1/v2 split **present**; **`eveningStartArgs` requires `endBefore === undefined`** (regressed); test expects `21:00` → **false** (regressed vs `f7aa687`) | **Yes** — restore `evals/assistant/discovery-cases.ts` (+ tests) from **`f7aa687`** | **Regressed** on b2 HEAD; **Missing** on main |
| **2 — Fit-claim grader** | Subject attribution; no plan-code auto-exempt; compaction/`otherSections`; negated mutual fit (`don't fit together`, `不互相兼容`) | **Missing** — old grader | **Partial** — attribution + some mutual tests remain; **no `mutualIdiomNegated`**; course-level `supportsClaim` / compaction logic **simplified vs reviewed**; negation tests **removed** (present at `9772a9a`) | **Yes** — restore `discovery-grade.ts` + tests from **`f7aa687`** (or `9772a9a` for truncation edge) | **Regressed** on b2 HEAD |
| **3 — Separate metrics** | `discoveryUse`, args rate, tool choice, difficulty inversion vs omission | **Missing** | **`summarizeDiscovery`** exposes `discoveryUse`, `discoveryArgs`, `discoverySelection`, `difficultyDirection` with inversion list; per-grade `toolChoice`; tests in `eval-discovery.test.ts` | N/A (HEAD retains Task 3) | **Correct and committed** on b2 HEAD (survived regressions) |

**Files responsible for regressions (verified):**

- `evals/assistant/discovery-cases.ts` — `1e7d96c`, reaffirmed in `22d331f`
- `evals/assistant/discovery-grade.ts` — `1e7d96c`, `22d331f` (large hunks vs `f7aa687`)
- `tests/assistant/eval-discovery.test.ts` — `1e7d96c` (−98 lines), `22d331f`

---

## 8. Task 4+ actual progress (plan phases)

| Plan phase | Description | Status on `69a94e7` | Verdict |
|---|---|---|---|
| **A.4** Regrade historical traces | `22d331f` + `regrade-discovery.eval.ts` + `eval-regrade-discovery.test.ts` | **Committed** but built on regressed grader | Partially done — **needs regrade re-run after Task 1–2 restore** |
| **A.5** Harness reliability | `e8afe55` — cancellation, incremental artifacts in `harness.ts` / `discovery-eval-lib.ts` | **Committed** | Correct but unverified in this audit (no test run) |
| **B.1** Tool choice | `69a94e7` — prompt + `discovery-contract.test.ts` | **Committed** | Implemented |
| **B.2** Topic retrieval (Macau/Macao) | — | **No lib changes found** | **Missing** |
| **B.3–C.3** | — | Not started | **Missing** |

---

## 9. Concurrent-writer assessment

| Risk factor | Finding | Level |
|---|---|---|
| Same worktree, multiple agents | B.2 worktree has dedicated worker **8771**; main has **two** workers on same repo path | **Medium** |
| Same branch, different paths | B.2 commits only on `feat/assistant-v2-3-5-b2-remediation`; main on different branch | **Low** (if agents respect worktree branches) |
| Same files | Untracked B.2 plan/forensic docs duplicated in **both** worktrees | **Medium** |
| Observed simultaneous writes | None during audit | **Low** |
| Historical conflicting writes | Linear commits `f7aa687` → `1e7d96c` → `22d331f` | **High** |

**Overall concurrency risk:** **High** (recent conflicting commits + multiple idle workers that could resume).

**Recommended ownership model:**

- **One** integration agent on **only** `.worktrees/assistant-v2-3-5-b2` / `feat/assistant-v2-3-5-b2-remediation`.
- **Stop or pause** other `cursor-agent` workers on the main repo path before recovery.
- Do not implement B.2 from the main worktree until branch is merged or main worktree is repointed.

---

## 10. Canonical source of truth (recommendation)

| Decision | Recommendation | Rationale |
|---|---|---|
| **Worktree** | `.worktrees/assistant-v2-3-5-b2` | Only place with full B.2 commit chain |
| **Branch** | `feat/assistant-v2-3-5-b2-remediation` | Contains all B.2 work; not on main discovery branch |
| **Recovery baseline commit** | **`f7aa687`** for Tasks 1–2 files; keep **`e8afe55`/`69a94e7`** for A.5/B.1 | Last integrated good Tasks 1–2; later commits add value but inherit regressions |
| **Must restore** | `discovery-cases.ts`, `discovery-grade.ts` (fit sections), `eval-discovery.test.ts` from `f7aa687` onto current HEAD | Removes `1e7d96c`/`22d331f` damage without dropping A.4–B.1 files |
| **Must preserve first** | Branch tip `69a94e7` (tag or backup branch); untracked plan/forensic docs | No remote backup for b2 branch |
| **Stop agents?** | **Yes — manually pause/stop workers 8771, 7279, 9062** before any recovery git operations | Prevent repeat overwrite |
| **Retire worktrees?** | **Later** — after verified HEAD; keep `assistant-v2-1-ux` untouched | |
| **Resume Task 4 (next plan work)?** | Only after Tasks 1–2 restored and tests pass | See Q5 |

**Alternative path (not executed):** Create `backup/b2-pre-recovery-69a94e7` at tip; reset Tasks 1–2 files to `f7aa687`; re-run regrade tests.

---

## 11. Safe recovery procedure (do not run during audit)

### Stage A — Freeze concurrent writes

1. In Cursor, **stop or disconnect** cloud/local agents tied to `next-web` and the B.2 worktree.
2. Confirm no `cursor-agent worker` with `--worker-dir` under this repo (or accept they are idle).
3. Exclusive rule: **one human + one agent** on `.worktrees/assistant-v2-3-5-b2` only.

### Stage B — Preserve recoverable work

```bash
# From any worktree (read-only backup commands — run when authorized)
git branch backup/b2-69a94e7 69a94e7
git branch backup/b2-f7aa687 f7aa687
# Copy untracked docs if needed:
# cp docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b2-remediation.md /tmp/
```

### Stage C — Restore reviewed Tasks 1–2 on b2 branch

Preferred **minimal** approach (in b2 worktree):

```bash
cd /Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2
git checkout feat/assistant-v2-3-5-b2-remediation
git checkout f7aa687 -- evals/assistant/discovery-cases.ts evals/assistant/discovery-grade.ts tests/assistant/eval-discovery.test.ts
# Manually re-apply any A.4-only additions from 69a94e7 discovery-grade.ts if checkout overwrote regrade exports (merge carefully)
git diff --stat
git commit -m "fix(assistant): restore reviewed B.2 Tasks 1–2 after accidental regression"
```

If `discovery-grade.ts` checkout removes regrade helpers from `22d331f`, **three-way merge**: take Task 1–2 / fit logic from `f7aa687`, keep `regradeDiscoveryArtifact` and types from `69a94e7`.

**Avoid:** blind `reset --hard` to `f7aa687` (would drop A.5 and B.1).

### Stage D — Reverify

Focused (when authorized to run tests):

- `eval-discovery.test.ts` — evening args (`21:00` true), negated mutual fit strings, compaction cases.
- `eval-regrade-discovery.test.ts` — regrade still works.
- `discovery-contract.test.ts` — B.1 tool choice from `69a94e7`.
- Confirm `CASE_SET_VERSION === "b2-v2"`.

### Stage E — Resume B.2

- Re-run A.4 regrade on frozen audit JSON inputs (read-only sources per plan).
- Continue **B.2 topic retrieval** only after C-stage gates pass.
- Single integration agent; feature branches for experiments.

### Stage F — Simplify Cursor workspace (optional, later)

- Open **one** window on B.2 worktree OR merge b2 branch into discovery branch and remove b2 worktree **only after** push/backup.
- Deduplicate untracked plan/forensic docs (commit once).

---

## 12. Plain-English: Cursor behavior

**Why an agent in a worktree may not show in this chat:** Cursor binds conversations to a **workspace folder**. The B.2 worker process uses `--worker-dir .../.worktrees/assistant-v2-3-5-b2`, which is a **different root** than the main `next-web` folder. Chats in the main window do not list agents whose worker root is another worktree path.

**What the evidence suggests:** Strong evidence for a **separate worker / workspace** on the B.2 worktree (8771), not merely stale git state. The regressions match **sequential commits** on the same branch (two bad commits after a good one), consistent with **multiple agent sessions** on the same b2 branch rather than invisible uncommitted chaos.

**Which workspace to open for authoritative B.2 files:**  
`File → Open Folder` → `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2`  
Confirm branch `feat/assistant-v2-3-5-b2-remediation` and HEAD `69a94e7`.

**Restart Cursor:** **Neutral / slight risk** — does not delete commits, but **running workers may restart** and could resume edits. Freeze agents first; restarting alone does not merge branches.

**Avoid future confusion:** One worktree per active agent; one branch per worktree; push backup branches early; never run B.2 implementation from main worktree while b2 worktree exists; after good review, **tag commit** (`b2-task2-reviewed`).

---

## 13. Risks and unresolved unknowns

- Whether workers **8771 / 7279 / 9062** will auto-resume tasks without user action — **unknown**.
- Whether any **uncommitted** agent output exists outside git (editor buffers) — **not inspected**.
- Full **Vitest/tsc** pass on b2 HEAD — **not run** (read-only audit).
- Exact **three-way merge** effort for `discovery-grade.ts` (regrade + fit logic) — needs careful human/agent merge.
- **Main vs b2** merge strategy for eventual integration with `feat/assistant-v2-3-5-b-discovery` — **not decided**.

---

## 14. Direct answers

### Q1. Is any B.2 coding agent demonstrably still running?

**Partially.** `cursor-agent` worker **8771** is **running** with B.2 as `worker-dir`. That is consistent with a B.2 agent worker. **No demonstrable writes** during the audit window. Cannot tie PID 8771 to a specific chat title without manual UI check.

### Q2. Where is the newest correct implementation of Tasks 1–3?

| Task | Location |
|---|---|
| Tasks **1–2** (reviewed) | Commit **`f7aa687`** on `feat/assistant-v2-3-5-b2-remediation` — **not** at branch HEAD |
| Task **3** | **`69a94e7`** (HEAD) — metrics present in `discovery-grade.ts` / tests |
| Main worktree | **None** of Tasks 1–3 (stuck at B.1 `718afd8`) |

### Q3. Which branch/worktree should we keep as canonical?

**Branch:** `feat/assistant-v2-3-5-b2-remediation`  
**Worktree:** `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2`

### Q4. Exactly what must be preserved or restored before continuing?

1. **Preserve:** tip `69a94e7`, commits `e8afe55`, `69a94e7`, A.4 files; untracked plan/forensic docs.  
2. **Restore from `f7aa687`:** `evals/assistant/discovery-cases.ts`, fit-grader portions of `evals/assistant/discovery-grade.ts`, removed tests in `evals/assistant/eval-discovery.test.ts`.  
3. **Merge carefully:** regrade exports from `22d331f` / HEAD into restored grader file.  
4. **Freeze** concurrent cursor-agent workers before edits.

### Q5. Is it safe to resume Task 4 now?

**No.** Phase A.4 code exists but **Tasks 1–2 are regressed at HEAD** and regrade results would be misleading. **Safe to resume plan work only after** Stage C–D restore and targeted tests pass. B.2 topic retrieval (plan phase B.2) has **not** started.

---

*End of audit — no recovery operations were executed.*
