# Job Queue Auto-Processing

## Context

### Original Request

Add automatic job queue processing to the librarian maintenance job system so that pending jobs are automatically started when the running job completes, rather than sitting idle until the next explicit trigger or expiring after `jobRetentionMs`.

### Problem Statement

The Agent Memory librarian maintenance job system has a gap: jobs queue up but don't auto-drain.

**Current Behavior:**

- Jobs are created and added to a queue with status "pending"
- The system only runs 1 job at a time (`maxConcurrentJobs: 1`)
- When a job completes, pending jobs just sit there
- Pending jobs never auto-execute - they only run when explicitly triggered via:
  - `run_maintenance` MCP call (which creates yet another job)
  - Session-end hook
- Jobs get cleaned up after `jobRetentionMs` (1 hour by default) without ever running

### Evidence

Real job queue state showing the problem:

```
| Job | Status | Tasks |
|-----|--------|-------|
| job_53f7f803 | completed | 17/17 (full maintenance) |
| job_aade128f | completed | 17/17 (session-end) |
| job_5169aa8f | pending | graphBackfill (single task) |
| job_5b61b1c2 | pending | forgetting (single task) |
| job_71393c71 | pending | consolidation (single task) |
| job_d6579c04 | pending | consolidation (single task) |
```

4 single-task jobs stuck pending forever even though nothing is running.

---

## Work Objectives

### Core Objective

Implement automatic job queue processing so pending maintenance jobs are started when the running job completes.

### Concrete Deliverables

- QueueConfig interface in `src/services/librarian/maintenance/types.ts`
- Queue processing methods in `src/services/librarian/maintenance/job-manager.ts`
- Execution callback wiring in `src/mcp/handlers/librarian.handler.ts`

### Definition of Done

- [x] `npm run validate` passes (lint, typecheck, tests)
- [x] Pending jobs auto-start when running job completes
- [x] Deduplication skips redundant jobs
- [x] Queue depth is limited
- [x] Expired pending jobs are cancelled

### Must Have

- Auto-start next pending job when running job completes
- Respect `maxConcurrentJobs` limit (currently 1)
- Queue depth limit to prevent unbounded growth
- Pending job expiration after configurable timeout
- Appropriate logging for queue operations

### Must NOT Have (Guardrails)

- Do NOT add external dependencies
- Do NOT change the database schema
- Do NOT modify the MCP tool interface (memory_librarian parameters)
- Do NOT break existing job creation/completion flows

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (Tests-after)
- **Framework**: vitest

### Manual Verification

After implementation:

1. Start a maintenance job via MCP
2. While running, queue another job
3. Verify first job completes
4. Verify second job auto-starts without manual trigger

---

## Task Flow

```
Phase 1 (Types) → Phase 2 (JobManager Core) → Phase 3 (Integration) → Phase 4 (Cleanup) → Phase 5 (Edge Cases)
```

## Parallelization

| Group | Tasks         | Reason                                    |
| ----- | ------------- | ----------------------------------------- |
| A     | 1             | Foundation - must be first                |
| B     | 2, 3, 4, 5, 6 | Can be done in sequence within JobManager |
| C     | 7, 8          | Depends on B                              |
| D     | 9             | Depends on C                              |
| E     | 10, 11, 12    | Can be done after D                       |

---

## TODOs

### Phase 1: Configuration Types

- [x] 1. Add QueueConfig interface to maintenance types

  **What to do**:
  - Add `QueueConfig` interface with: `maxQueueDepth`, `pendingJobExpirationMs`, `enableDeduplication`, `deduplicationWindowMs`, `enableMerging`
  - Add `DEFAULT_QUEUE_CONFIG` constant with sensible defaults
  - Export both from the module

  **Must NOT do**:
  - Do not modify existing config interfaces
  - Do not change default maintenance config

  **Parallelizable**: NO (foundation for all other tasks)

  **References**:
  - `src/services/librarian/maintenance/types.ts:366-376` - HealthConfig pattern to follow
  - `src/services/librarian/maintenance/types.ts:427-555` - DEFAULT_MAINTENANCE_CONFIG pattern

  **Acceptance Criteria**:
  - [x] `QueueConfig` interface exported from types.ts
  - [x] `DEFAULT_QUEUE_CONFIG` constant exported
  - [x] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(librarian): add QueueConfig interface for job queue auto-processing`
  - Files: `src/services/librarian/maintenance/types.ts`

---

### Phase 2: JobManager Core Logic

- [x] 2. Add queue configuration to JobManager

  **What to do**:
  - Import `QueueConfig` and `DEFAULT_QUEUE_CONFIG` from types
  - Add `queue` property to `JobManagerConfig` interface
  - Update `DEFAULT_CONFIG` to include queue settings
  - Add `queue` field to constructor config handling

  **Must NOT do**:
  - Do not change existing config properties
  - Do not break existing JobManager instantiation

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:40-50` - JobManagerConfig and DEFAULT_CONFIG
  - `src/services/librarian/maintenance/job-manager.ts:139-144` - Constructor

  **Acceptance Criteria**:
  - [x] `JobManagerConfig` includes optional `queue?: QueueConfig`
  - [x] Config merging preserves existing behavior
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 3-6)

---

- [x] 3. Add job expiration logic and cancelJob method

  **What to do**:
  - Add `isJobExpired(job: MaintenanceJob): boolean` private method
  - Add `cancelJob(id: string, reason: string): Promise<void>` public method
  - Cancel sets status to 'failed', completedAt, and error message
  - Persist cancellation to database if repository exists

  **Must NOT do**:
  - Do not cancel running jobs (only pending)
  - Do not delete jobs, only mark as failed

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:372-396` - failJob pattern to follow
  - `src/services/librarian/maintenance/job-manager.ts:435-460` - cleanup method for expiration logic pattern

  **Acceptance Criteria**:
  - [x] `cancelJob()` method exists and works
  - [x] `isJobExpired()` checks creation time against config
  - [x] Cancelled jobs have status 'failed' and error message
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 2, 4-6)

---

- [x] 4. Add job deduplication logic

  **What to do**:
  - Add `getRecentCompletedJobs(windowMs: number): MaintenanceJob[]` private method
  - Add `isJobCoveredByRecent(job: MaintenanceJob, recentJobs: MaintenanceJob[]): boolean` private method
  - Check if all tasks in pending job were completed by a recent job with same scope
  - Return true if job should be skipped (deduplicated)

  **Must NOT do**:
  - Do not modify completed jobs
  - Do not deduplicate across different scopes

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:243-266` - listJobs and listJobsWithFallback patterns
  - `src/services/librarian/maintenance/job-manager.ts:100-130` - recordToJob for understanding job structure

  **Acceptance Criteria**:
  - [x] `getRecentCompletedJobs()` returns jobs completed within window
  - [x] `isJobCoveredByRecent()` correctly identifies redundant jobs
  - [x] Scope matching is enforced (scopeType + scopeId)
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 2, 3, 5, 6)

---

- [x] 5. Add job merging logic

  **What to do**:
  - Add `attemptMerge(pendingJobs: MaintenanceJob[]): Promise<MaintenanceJob | null>` method
  - Group pending jobs by scope (scopeType:scopeId)
  - Find groups with multiple single-task jobs
  - Create merged job with combined unique tasks
  - Cancel original jobs with "Merged into job_xxx" message

  **Must NOT do**:
  - Do not merge jobs with different scopes
  - Do not merge if merging is disabled in config
  - Do not merge multi-task jobs (only single-task)

  **Parallelizable**: NO (depends on 3, 4)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:179-217` - createJob pattern
  - `src/services/librarian/maintenance/job-manager.ts:23-38` - MaintenanceJob structure

  **Acceptance Criteria**:
  - [x] `attemptMerge()` creates combined job when appropriate
  - [x] Original jobs are cancelled with merge message
  - [x] Merged job has all unique tasks from originals
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 2, 3, 4, 6)

---

- [x] 6. Add queue depth limit to createJob

  **What to do**:
  - At start of `createJob()`, check pending job count
  - If count >= `maxQueueDepth`, throw error with message
  - Log warning when approaching limit (e.g., 80%)

  **Must NOT do**:
  - Do not count running jobs toward depth limit
  - Do not silently drop jobs (throw error instead)

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:179-217` - createJob method
  - `src/services/librarian/maintenance/job-manager.ts:243-249` - listJobs for counting

  **Acceptance Criteria**:
  - [x] `createJob()` throws when queue is full
  - [x] Error message includes current/max counts
  - [x] Warning logged when approaching limit
  - [x] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(librarian): add queue management to JobManager (expiration, deduplication, merging, depth limit)`
  - Files: `src/services/librarian/maintenance/job-manager.ts`
  - Pre-commit: `npm run typecheck`

---

### Phase 3: Queue Processing and Integration

- [x] 7. Add processQueue method and trigger after completion

  **What to do**:
  - Add `processQueue(): Promise<MaintenanceJob | null>` public method
  - Check `canStartJob()` first, return null if can't start
  - Get pending jobs sorted by creation time (FIFO)
  - Apply expiration check, cancel expired jobs
  - Apply deduplication check, cancel deduplicated jobs
  - Attempt merge if enabled
  - Get next eligible job and call `startJob()`
  - Modify `completeJob()` to call `processQueue()` via `setImmediate()`
  - Modify `failJob()` to call `processQueue()` via `setImmediate()`

  **Must NOT do**:
  - Do not block completion response waiting for queue processing
  - Do not start multiple jobs if maxConcurrentJobs would be exceeded

  **Parallelizable**: NO (depends on 2-6)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:339-370` - completeJob method
  - `src/services/librarian/maintenance/job-manager.ts:372-396` - failJob method
  - `src/services/librarian/maintenance/job-manager.ts:276-295` - startJob method

  **Acceptance Criteria**:
  - [x] `processQueue()` method exists and works
  - [x] Expired jobs cancelled during queue processing
  - [x] Deduplicated jobs cancelled during queue processing
  - [x] `completeJob()` triggers queue processing
  - [x] `failJob()` triggers queue processing
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 8)

---

- [x] 8. Add execution callback mechanism

  **What to do**:
  - Add private `executeCallback?: (job: MaintenanceJob) => Promise<void>` property
  - Add `setExecuteCallback(callback: ...)` public method
  - In `processQueue()`, after `startJob()`, call callback if set
  - Fire-and-forget: callback handles its own completion/failure
  - Wrap callback call in try-catch, call `failJob()` on error

  **Must NOT do**:
  - Do not wait for callback to complete in processQueue
  - Do not create circular dependency with LibrarianService

  **Parallelizable**: NO (depends on 7)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:132-144` - Class properties and constructor
  - `src/services/librarian/maintenance/job-manager.ts:146-148` - setRepository pattern for setter

  **Acceptance Criteria**:
  - [x] `setExecuteCallback()` method exists
  - [x] Callback is invoked when queue-started job begins
  - [x] Errors in callback result in job failure
  - [x] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(librarian): add queue auto-processing with execution callback`
  - Files: `src/services/librarian/maintenance/job-manager.ts`
  - Pre-commit: `npm run typecheck`

---

- [x] 9. Wire up execute callback in handler

  **What to do**:
  - In `ensureJobManagerInitialized()`, after setting repository, set execute callback
  - Get LibrarianService from context
  - Create callback that calls `service.runMaintenance()` with progress updates
  - On success, call `jobManager.completeJob()`
  - On failure, call `jobManager.failJob()`

  **Must NOT do**:
  - Do not call callback if LibrarianService is not available
  - Do not change existing run_maintenance handler logic

  **Parallelizable**: NO (depends on 8)

  **References**:
  - `src/mcp/handlers/librarian.handler.ts:34-44` - ensureJobManagerInitialized function
  - `src/mcp/handlers/librarian.handler.ts:866-882` - run_maintenance job execution pattern
  - `src/services/librarian/index.ts:656-722` - runMaintenanceWithJob pattern

  **Acceptance Criteria**:
  - [x] Execute callback set during initialization
  - [x] Callback executes maintenance and updates job status
  - [x] Handler still works if LibrarianService unavailable
  - [x] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(librarian): wire up queue execution callback in MCP handler`
  - Files: `src/mcp/handlers/librarian.handler.ts`
  - Pre-commit: `npm run typecheck`

---

### Phase 4: Cleanup Integration

- [x] 10. Integrate expiration into periodic cleanup

  **What to do**:
  - In `cleanup()` method, after cleaning completed/failed jobs
  - Get all pending jobs via `listJobs('pending')`
  - For each, check `isJobExpired()`
  - If expired, call `cancelJob(id, 'Expired while pending')`
  - Log count of expired jobs

  **Must NOT do**:
  - Do not expire jobs that are currently running
  - Do not modify existing cleanup logic for completed/failed jobs

  **Parallelizable**: YES (with 11, 12)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:435-460` - cleanup method

  **Acceptance Criteria**:
  - [x] Expired pending jobs cancelled during cleanup
  - [x] Cleanup logs count of expired jobs
  - [x] Existing cleanup behavior unchanged
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 11, 12)

---

### Phase 5: Edge Cases and Safety

- [x] 11. Handle server restart orphaned jobs

  **What to do**:
  - In `initialize()` method, after loading running jobs from DB
  - Mark each "running" job as failed with "Server restarted while job was running"
  - Log warning for each orphaned job
  - After marking orphans, trigger `processQueue()` to start pending jobs

  **Must NOT do**:
  - Do not delete orphaned jobs
  - Do not fail pending jobs on startup

  **Parallelizable**: YES (with 10, 12)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:150-177` - initialize method

  **Acceptance Criteria**:
  - [x] Running jobs marked as failed on startup
  - [x] Error message indicates server restart
  - [x] Queue processing triggered after initialization
  - [x] `npm run typecheck` passes

  **Commit**: NO (groups with 10, 12)

---

- [x] 12. Add comprehensive logging for queue operations

  **What to do**:
  - Add info log when queue processing starts
  - Add debug log for each job evaluated (expired, deduplicated, eligible)
  - Add info log when job auto-started from queue
  - Add info log when jobs merged
  - Add warning log when queue depth approaching limit

  **Must NOT do**:
  - Do not log at error level for normal operations
  - Do not log sensitive data

  **Parallelizable**: YES (with 10, 11)

  **References**:
  - `src/services/librarian/maintenance/job-manager.ts:10` - Logger setup
  - `src/services/librarian/maintenance/job-manager.ts:214` - Existing logging pattern

  **Acceptance Criteria**:
  - [x] Queue processing has appropriate logging
  - [x] Log levels are appropriate (info for actions, debug for details)
  - [x] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(librarian): add cleanup integration and edge case handling for job queue`
  - Files: `src/services/librarian/maintenance/job-manager.ts`
  - Pre-commit: `npm run validate`

---

### Phase 6: Testing

- [x] 13. Test the implementation

  **What to do**:
  - Run `npm run validate` to ensure all checks pass
  - Manually test by:
    1. Call `memory_librarian` with `action: "run_maintenance"`
    2. While running, call again to queue a second job
    3. Wait for first to complete
    4. Verify second auto-starts (check via `action: "list_jobs"`)

  **Must NOT do**:
  - Do not skip validation
  - Do not merge with failing tests

  **Parallelizable**: NO (final verification)

  **References**:
  - `package.json` - validate script

  **Acceptance Criteria**:
  - [x] `npm run validate` passes
  - [x] Manual test confirms queue auto-processing works
  - [x] No regressions in existing functionality

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message                                                                    | Files                | Verification |
| ---------- | -------------------------------------------------------------------------- | -------------------- | ------------ |
| 1          | `feat(librarian): add QueueConfig interface for job queue auto-processing` | types.ts             | typecheck    |
| 6          | `feat(librarian): add queue management to JobManager`                      | job-manager.ts       | typecheck    |
| 8          | `feat(librarian): add queue auto-processing with execution callback`       | job-manager.ts       | typecheck    |
| 9          | `feat(librarian): wire up queue execution callback in MCP handler`         | librarian.handler.ts | typecheck    |
| 12         | `feat(librarian): add cleanup integration and edge case handling`          | job-manager.ts       | validate     |

---

## Success Criteria

### Verification Commands

```bash
npm run validate  # Expected: All checks pass
```

### Final Checklist

- [x] Pending jobs auto-start when running job completes
- [x] `maxConcurrentJobs` limit respected (never >1 running)
- [x] Deduplication skips redundant jobs
- [x] Queue depth limited (default 10)
- [x] Pending jobs expire after 30 minutes
- [x] Server restart handles orphaned running jobs
- [x] All operations have appropriate logging
- [x] `npm run validate` passes
