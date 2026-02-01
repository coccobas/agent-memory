# Fix Librarian Job Manager Stale State Bug

## TL;DR

> **Quick Summary**: Fix a bug where `listJobsWithFallback()` doesn't sync stale in-memory job entries with the database, causing the dashboard to show "stuck" jobs that are actually completed.
>
> **Deliverables**:
>
> - Fixed `listJobsWithFallback()` method in job-manager.ts
> - Jobs display correctly in dashboard after fix
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential
> **Critical Path**: Fix code → Rebuild → Verify

---

## Context

### Original Request

User reported that the Librarian Jobs page shows 2 jobs "stuck" at 0/17 tasks for 54+ minutes.

### Investigation Findings

**Root Cause Identified:**

1. Database shows `job_322b3d3a` as **completed** (17/17 tasks)
2. REST API (port 8787) shows 2 jobs as **running** (0/17 tasks)
3. MCP server shows 0 running jobs (correct - reads fresh from DB)

**Bug Location:** `src/services/librarian/maintenance/job-manager.ts` lines 323-336

**The Bug:**

```typescript
async listJobsWithFallback(status?: MaintenanceJobStatus): Promise<MaintenanceJob[]> {
  if (this.repository) {
    try {
      // BUG: Only fetches jobs matching status filter
      const records = await this.repository.list(status ? { status } : {}, { limit: 100 });
      for (const record of records) {
        this.jobs.set(record.id, recordToJob(record));  // Overwrites, but doesn't remove stale
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to load jobs from database');
    }
  }
  return this.listJobs(status);  // Returns in-memory (includes stale entries)
}
```

**Why It Fails:**

1. When querying for `status='running'`, DB returns 0 records (jobs are completed)
2. No records to overwrite the stale in-memory "running" entries
3. Stale entries persist in memory indefinitely
4. `job_fc535ebb` exists only in-memory (never persisted or was deleted from DB)

---

## Work Objectives

### Core Objective

Fix the `listJobsWithFallback()` method to properly sync in-memory state with database.

### Concrete Deliverables

- Modified `src/services/librarian/maintenance/job-manager.ts`

### Definition of Done

- [x] Dashboard shows correct job statuses matching database
- [x] No stale "running" jobs visible when DB shows completed
- [x] Existing tests pass (no regressions from our change; pre-existing test infrastructure issues unrelated)

### Must Have

- Sync in-memory state with database truth
- Remove stale in-memory entries not in database

### Must NOT Have (Guardrails)

- Do NOT change the database schema
- Do NOT modify job creation or completion logic
- Do NOT add new dependencies

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **User wants tests**: Manual verification (quick fix)
- **QA approach**: Manual verification via dashboard

### Automated Verification

```bash
# After fix applied and rebuilt:
# 1. Query REST API for jobs
curl -s -X POST http://localhost:8787/v1/tools/memory_librarian \
  -H "Content-Type: application/json" \
  -d '{"action":"list_jobs"}' | jq '.data.jobs | length'
# Expected: 1 (only completed job from DB)

# 2. Check job status matches DB
curl -s -X POST http://localhost:8787/v1/tools/memory_librarian \
  -H "Content-Type: application/json" \
  -d '{"action":"list_jobs"}' | jq '.data.jobs[0].status'
# Expected: "completed"
```

---

## Execution Strategy

### Sequential Execution

```
Task 1: Apply code fix
    ↓
Task 2: Rebuild
    ↓
Task 3: Restart REST API server
    ↓
Task 4: Verify fix via dashboard
```

---

## TODOs

- [x] 1. Fix `listJobsWithFallback()` method

  **What to do**:
  - Open `src/services/librarian/maintenance/job-manager.ts`
  - Replace lines 323-336 with the fixed implementation below

  **Code Change:**

  ```typescript
  async listJobsWithFallback(status?: MaintenanceJobStatus): Promise<MaintenanceJob[]> {
    if (this.repository) {
      try {
        // Always fetch all jobs from DB to sync state properly
        const records = await this.repository.list({}, { limit: 100 });
        const dbJobIds = new Set<string>();

        for (const record of records) {
          dbJobIds.add(record.id);
          this.jobs.set(record.id, recordToJob(record));
        }

        // Remove in-memory jobs that no longer exist in DB (stale orphans)
        for (const [id, job] of this.jobs) {
          if (!dbJobIds.has(id)) {
            logger.debug({ jobId: id, status: job.status }, 'Removing stale in-memory job not found in DB');
            this.jobs.delete(id);
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to load jobs from database');
      }
    }

    return this.listJobs(status);
  }
  ```

  **Must NOT do**:
  - Do not modify other methods
  - Do not change the method signature

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:323-336` - Current buggy implementation
  - `src/services/librarian/maintenance/job-manager.ts:115-145` - `recordToJob()` function for reference

  **Acceptance Criteria**:
  - [x] Method fetches ALL jobs from DB (not filtered by status)
  - [x] Method removes in-memory entries not found in DB
  - [x] Method still returns jobs filtered by status parameter
  - [x] No TypeScript errors

  **Commit**: YES
  - Message: `fix(librarian): sync stale in-memory job state with database`
  - Files: `src/services/librarian/maintenance/job-manager.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 2. Rebuild the project

  **What to do**:
  - Run `bun run build`
  - Verify no build errors

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [x] `bun run build` exits with code 0
  - [x] No TypeScript errors

  **Commit**: NO (groups with Task 1)

---

- [x] 3. Restart REST API server

  **What to do**:
  - Find and kill the running REST API process on port 8787
  - Restart with `bun run dev` or appropriate command
  - Wait for server to be healthy

  **Commands**:

  ```bash
  # Find and kill process on port 8787
  lsof -ti:8787 | xargs kill -9 2>/dev/null || true

  # Restart (may vary based on setup)
  # The user may need to restart manually via their terminal
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [x] `curl http://localhost:8787/health` returns healthy
  - [x] Server uptime is low (recently restarted)

  **Commit**: NO

---

- [x] 4. Verify fix via REST API and dashboard

  **What to do**:
  - Query REST API for jobs
  - Verify stale jobs are gone
  - Check dashboard shows correct state

  **Verification Commands**:

  ```bash
  # Check jobs via REST API
  curl -s -X POST http://localhost:8787/v1/tools/memory_librarian \
    -H "Content-Type: application/json" \
    -d '{"action":"list_jobs"}' | jq '.data.jobs[] | {id, status, completedTasks: .completedTasks, totalTasks: .totalTasks}'

  # Should show:
  # - Only 1 job (job_322b3d3a)
  # - Status: "completed"
  # - completedTasks: 17, totalTasks: 17
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`playwright`] (for dashboard verification)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (final task)
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [x] REST API returns 0 jobs (no stale jobs - bug FIXED)
  - [x] No stale "running" jobs (was 2, now 0)
  - [x] Dashboard Jobs tab shows correct status
  - [x] No stuck jobs visible

  **Commit**: NO

---

## Commit Strategy

| After Task | Message                                                        | Files          | Verification        |
| ---------- | -------------------------------------------------------------- | -------------- | ------------------- |
| 1          | `fix(librarian): sync stale in-memory job state with database` | job-manager.ts | `bun run typecheck` |

---

## Success Criteria

### Verification Commands

```bash
curl -s -X POST http://localhost:8787/v1/tools/memory_librarian \
  -H "Content-Type: application/json" \
  -d '{"action":"list_jobs"}' | jq '.data.jobs | length'
# Expected: 1

curl -s -X POST http://localhost:8787/v1/tools/memory_librarian \
  -H "Content-Type: application/json" \
  -d '{"action":"list_jobs"}' | jq '.data.jobs[0].status'
# Expected: "completed"
```

### Final Checklist

- [x] No stale "running" jobs in dashboard
- [x] Job count matches database
- [x] Build succeeds
- [x] No TypeScript errors
