# Notion Database Backup System

## Context

### Original Request

Build a system to backup Notion databases into Agent Memory as tasks, with daily scheduled sync, version history tracking (append-only), and support for multiple databases with configurable field mappings. The purpose is fast access plus change history audit trail.

### Interview Summary

**Key Discussions**:

- Notion databases → Agent Memory tasks with version history
- Daily scheduled sync using node-cron
- JSON config file for database IDs and field mappings
- Soft-delete when Notion items deleted
- TDD approach for testing

**Research Findings**:

- Tasks currently have NO versioning - need to add `task_versions` table
- Version pattern exists in `src/db/schema/memory.ts` (tools/guidelines/knowledge)
- Scheduler pattern exists in `src/services/backup-scheduler.service.ts`
- Notion API: 3 req/sec limit, pagination via `start_cursor`, filter by `last_edited_time`
- Circuit breaker pattern exists in `src/services/embedding.service.ts`

### Metis Review

**Identified Gaps** (addressed):

- Notion API authentication source → Environment variable
- Conflict resolution when both sides modified → Notion wins, log conflict
- Config file vs env vars → JSON for mappings, env vars for credentials/schedule
- Field mapping edge cases → Only support common types, others → JSON metadata
- Partial sync failure recovery → Checkpoint state per database

---

## Work Objectives

### Core Objective

Create a daily-scheduled backup system that syncs Notion database rows into Agent Memory tasks with full version history tracking, enabling both fast access and change audit trails.

### Concrete Deliverables

1. `task_versions` table with migration
2. Updated task repository with versioning support
3. Notion sync service with rate limiting and circuit breaker
4. Notion sync scheduler service
5. JSON config schema and validation
6. Import evidence tracking
7. Comprehensive test suite

### Definition of Done

- [x] `bun test` passes all new tests
- [x] `bun run build` succeeds without errors
- [~] Manual sync via MCP tool works with test Notion database — **PERMANENTLY BLOCKED: Invalid API token, requires human setup (see notepads/blockers.md)**
- [x] Scheduled sync runs daily at configured time
- [x] Version history queryable for synced tasks
- [x] Import evidence records created for each sync

### Must Have

- Task version history (append-only)
- Daily scheduled sync
- Multiple database support
- Configurable field mappings
- Rate limiting (3 req/sec)
- Soft-delete on Notion deletion
- Import evidence audit trail

### Must NOT Have (Guardrails)

- NO bidirectional sync (Notion → Memory only)
- NO webhook support (daily cron only)
- NO Notion page content sync (database properties only)
- NO complex merge logic (Notion wins on conflict)
- NO Notion API key in config file (env var only)
- NO support for all Notion property types (only: title, text, number, select, multi-select, date, checkbox, status)
- NO caching of Notion responses
- NO UI/dashboard for sync status

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test with vitest)
- **User wants tests**: TDD approach
- **Framework**: bun test (vitest)

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

**Test Categories**:

- Unit tests: `tests/unit/*.test.ts`
- Integration tests: `tests/integration/*.test.ts`
- Repository tests: `tests/unit/*-repo.test.ts`

---

## Task Flow

```
Phase 1: Task Versioning (foundational)
  └── 1.0 Schema → 1.1 Repository → 1.2 Handler

Phase 2: Notion Sync Service
  └── 2.0 Config Schema → 2.1 API Client → 2.2 Sync Service → 2.3 Field Mapper

Phase 3: Integration
  └── 3.0 Scheduler → 3.1 Evidence → 3.2 MCP Tool → 3.3 E2E Tests
```

## Parallelization

| Group | Tasks    | Reason                                |
| ----- | -------- | ------------------------------------- |
| A     | 2.0, 2.1 | Config and API client are independent |

| Task | Depends On | Reason                       |
| ---- | ---------- | ---------------------------- |
| 1.1  | 1.0        | Repository needs schema      |
| 1.2  | 1.1        | Handler needs repository     |
| 2.2  | 2.1        | Sync needs API client        |
| 2.3  | 2.2        | Mapper needs sync context    |
| 3.0  | 2.2        | Scheduler wraps sync service |
| 3.1  | 2.2        | Evidence needs sync results  |
| 3.2  | 3.0, 3.1   | MCP tool orchestrates all    |
| 3.3  | 3.2        | E2E tests verify full flow   |

---

## TODOs

### Phase 1: Task Versioning

- [x] 1.0. Add task_versions schema and migration

  **What to do**:
  - Create migration file `drizzle/migrations/0036_add_task_versions.sql`
  - Add `task_versions` table following pattern from `tool_versions`
  - Add `currentVersionId` column to `tasks` table
  - Update `src/db/schema/tasks.ts` with version table and types
  - Run `bun run db:generate` to update drizzle types

  **Test cases to cover**:
  - Migration applies without error
  - Rollback works (if supported)
  - Schema types compile

  **Must NOT do**:
  - Modify existing task data
  - Break existing task queries

  **Parallelizable**: NO (foundational)

  **References**:
  - `src/db/schema/memory.ts:42-65` - toolVersions table pattern (COPY THIS STRUCTURE)
  - `src/db/schema/memory.ts:102-131` - guidelineVersions (additional reference)
  - `drizzle/migrations/0034_add_episode_id_to_messages.sql` - recent migration example
  - `src/db/schema/tasks.ts` - current tasks table to modify

  **Acceptance Criteria**:
  - [ ] Test: Migration file exists and is valid SQL
  - [ ] `bun run db:generate` → completes without error
  - [ ] `bun run db:migrate` → migration applies successfully
  - [ ] `task_versions` table exists with columns: id, taskId, versionNum, title, description, status, resolution, metadata, createdAt, createdBy, changeReason, conflictFlag
  - [ ] `tasks` table has `currentVersionId` column

  **Commit**: YES
  - Message: `feat(schema): add task_versions table for version history`
  - Files: `drizzle/migrations/0036_add_task_versions.sql`, `src/db/schema/tasks.ts`

---

- [x] 1.1. Update task repository with versioning support

  **What to do**:
  - Modify `create()` to insert initial version (versionNum=1)
  - Modify `update()` to append new version instead of direct mutation
  - Add `getHistory(taskId)` method
  - Add `getVersion(taskId, versionNum)` method
  - Use `transactionWithRetry` for atomic operations
  - Implement conflict detection using existing `checkAndLogConflictWithDb` pattern

  **Test cases to cover**:
  - Create task creates version 1
  - Update task increments versionNum
  - getHistory returns all versions in order
  - getVersion returns specific version
  - Concurrent updates set conflictFlag
  - Current version content matches latest

  **Must NOT do**:
  - Break existing task queries
  - Lose existing task data during update

  **Parallelizable**: NO (depends on 1.0)

  **References**:
  - `src/db/repositories/tools.ts:89-140` - create() with versioning pattern
  - `src/db/repositories/tools.ts:142-200` - update() with version append pattern
  - `src/db/repositories/tools.ts:202-215` - getHistory() pattern
  - `src/db/repositories/base.ts:50-80` - checkAndLogConflictWithDb utility
  - `src/db/repositories/tasks.ts` - current implementation to modify

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/task-versions.repo.test.ts`
  - [ ] `bun test tests/unit/task-versions.repo.test.ts` → all tests pass
  - [ ] Create: Task has `currentVersionId` pointing to version with `versionNum=1`
  - [ ] Update: New version created with `versionNum=previous+1`
  - [ ] History: Returns versions sorted by versionNum ascending

  **Commit**: YES
  - Message: `feat(tasks): add version history support to task repository`
  - Files: `src/db/repositories/tasks.ts`, `tests/unit/task-versions.repo.test.ts`

---

- [x] 1.2. Update task MCP handler for version history

  **What to do**:
  - Add `history` action to task handler
  - Update existing actions to work with versioned repository
  - Ensure backward compatibility (existing task queries work)

  **Test cases to cover**:
  - `action: "history"` returns version list
  - Existing `add`, `update`, `get`, `list` actions work
  - Response includes `currentVersion` data

  **Must NOT do**:
  - Change MCP tool signature (breaking change)
  - Remove existing functionality

  **Parallelizable**: NO (depends on 1.1)

  **References**:
  - `src/mcp/handlers/tasks.handler.ts` - current handler to modify
  - `src/mcp/handlers/factory.ts:591-620` - getVersionHistory pattern for other types
  - `src/mcp/descriptors/memory_task.ts` - descriptor to update with new action

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/task-handler-versions.test.ts`
  - [ ] `bun test tests/unit/task-handler-versions.test.ts` → all tests pass
  - [ ] MCP call `action: "history", id: "<taskId>"` → returns version array
  - [ ] Existing task tests still pass: `bun test tests/unit/tasks`

  **Commit**: YES
  - Message: `feat(mcp): add history action to memory_task tool`
  - Files: `src/mcp/handlers/tasks.handler.ts`, `src/mcp/descriptors/memory_task.ts`, `tests/unit/task-handler-versions.test.ts`

---

### Phase 2: Notion Sync Service

- [x] 2.0. Create Notion sync config schema and validation

  **What to do**:
  - Create `src/services/notion-sync/config.ts` with TypeScript interfaces
  - Create JSON Schema for `notion-sync.config.json`
  - Add Zod validation for runtime config parsing
  - Define field mapping schema (Notion property → task field)
  - Add config loader with validation and error messages

  **Test cases to cover**:
  - Valid config passes validation
  - Missing required fields fail with clear error
  - Invalid database ID format rejected
  - Invalid field mapping rejected
  - Unknown Notion property types warned

  **Must NOT do**:
  - Store Notion API key in config (env var only)
  - Support all Notion property types (limit to common ones)

  **Parallelizable**: YES (with 2.1)

  **References**:
  - `src/config/registry/types.ts` - ConfigSectionMeta pattern
  - `src/services/import.service.ts:20-50` - Zod validation patterns
  - Notion API docs for property types

  **Config Schema**:

  ```typescript
  interface NotionSyncConfig {
    databases: Array<{
      notionDatabaseId: string;
      projectScopeId: string;
      syncEnabled: boolean;
      fieldMappings: Record<string, TaskField>;
      lastSyncTimestamp?: string;
    }>;
  }
  ```

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-sync-config.test.ts`
  - [ ] `bun test tests/unit/notion-sync-config.test.ts` → all tests pass
  - [ ] Config interface exported from `src/services/notion-sync/config.ts`
  - [ ] `loadNotionSyncConfig()` validates and returns typed config
  - [ ] Invalid config throws descriptive error

  **Commit**: YES
  - Message: `feat(notion): add sync config schema and validation`
  - Files: `src/services/notion-sync/config.ts`, `tests/unit/notion-sync-config.test.ts`

---

- [x] 2.1. Create Notion API client wrapper with rate limiting

  **What to do**:
  - Create `src/services/notion-sync/client.ts`
  - Wrap `@notionhq/client` with rate limiting (3 req/sec)
  - Add circuit breaker for API failure protection
  - Implement pagination using `iteratePaginatedAPI`
  - Add retry logic with exponential backoff (max 3 retries)
  - Handle 429 errors with `Retry-After` header

  **Test cases to cover**:
  - Rate limiting enforces 3 req/sec
  - Circuit breaker opens after N failures
  - Pagination fetches all pages
  - 429 error triggers retry with backoff
  - Timeout handled gracefully

  **Must NOT do**:
  - Cache Notion responses
  - Make unbounded concurrent requests

  **Parallelizable**: YES (with 2.0)

  **References**:
  - `src/services/embedding.service.ts:294-350` - circuit breaker pattern
  - `src/utils/circuit-breaker.ts` - CircuitBreaker class
  - `src/services/extraction/ollama-utils.ts:50-100` - external API error handling
  - `@notionhq/client` SDK docs for `iteratePaginatedAPI`

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-client.test.ts`
  - [ ] `bun test tests/unit/notion-client.test.ts` → all tests pass (mocked)
  - [ ] `queryDatabase()` returns paginated results
  - [ ] Rate limiter logs when throttling
  - [ ] Circuit breaker opens after 5 consecutive failures

  **Commit**: YES
  - Message: `feat(notion): add API client with rate limiting and circuit breaker`
  - Files: `src/services/notion-sync/client.ts`, `tests/unit/notion-client.test.ts`

---

- [x] 2.2. Create Notion sync service core logic

  **What to do**:
  - Create `src/services/notion-sync/sync.service.ts`
  - Implement `syncDatabase(databaseConfig)` function
  - Query Notion with `last_edited_time > lastSyncTimestamp` filter
  - For each row: upsert task (create or append version)
  - Track Notion page ID in task metadata for deduplication
  - Handle deleted items (not returned by Notion) → soft-delete
  - Update `lastSyncTimestamp` after successful sync
  - Return sync result summary

  **Test cases to cover**:
  - New items create tasks with version 1
  - Changed items append new version
  - Unchanged items skipped
  - Deleted items soft-deleted
  - lastSyncTimestamp updated on success
  - Partial failure rolls back cleanly

  **Must NOT do**:
  - Sync in both directions
  - Complex merge logic (Notion wins)

  **Parallelizable**: NO (depends on 2.1)

  **References**:
  - `src/services/graph/sync.service.ts` - sync service pattern
  - `src/db/repositories/tasks.ts` - task repository (versioned from 1.1)
  - `src/services/notion-sync/client.ts` - Notion client (from 2.1)

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-sync.service.test.ts`
  - [ ] `bun test tests/unit/notion-sync.service.test.ts` → all tests pass (mocked Notion)
  - [ ] Sync result includes: synced count, created count, updated count, deleted count, errors
  - [ ] Task metadata includes `{ notionPageId: "<id>", notionDatabaseId: "<id>" }`
  - [ ] Incremental sync only fetches changed items

  **Commit**: YES
  - Message: `feat(notion): add core sync service logic`
  - Files: `src/services/notion-sync/sync.service.ts`, `tests/unit/notion-sync.service.test.ts`

---

- [x] 2.3. Create Notion field mapper

  **What to do**:
  - Create `src/services/notion-sync/field-mapper.ts`
  - Map Notion property types to task fields
  - Support: title, rich_text, number, select, multi_select, date, checkbox, status
  - Unsupported types → store raw value in metadata JSON
  - Handle null/empty values gracefully
  - Log warnings for unmapped properties

  **Test cases to cover**:
  - Each supported type maps correctly
  - Unsupported types go to metadata
  - Null values handled
  - Empty strings handled
  - Date parsing works for Notion format

  **Must NOT do**:
  - Support relation, rollup, formula types (too complex)
  - Lose data silently (always store in metadata if can't map)

  **Parallelizable**: NO (depends on 2.2 for context)

  **References**:
  - Notion API property type documentation
  - `src/services/import.service.ts:100-150` - data transformation patterns

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-field-mapper.test.ts`
  - [ ] `bun test tests/unit/notion-field-mapper.test.ts` → all tests pass
  - [ ] `mapNotionRowToTask(row, mappings)` returns valid task input
  - [ ] Unmapped fields stored in `metadata.notionProperties`

  **Commit**: YES
  - Message: `feat(notion): add field mapper for property type conversion`
  - Files: `src/services/notion-sync/field-mapper.ts`, `tests/unit/notion-field-mapper.test.ts`

---

### Phase 3: Integration

- [x] 3.0. Create Notion sync scheduler service

  **What to do**:
  - Create `src/services/notion-sync/scheduler.service.ts`
  - Follow `backup-scheduler.service.ts` pattern exactly
  - Add config section in `src/config/registry/sections/notion-sync.ts`
  - Environment variables: `AGENT_MEMORY_NOTION_SYNC_SCHEDULE`, `AGENT_MEMORY_NOTION_SYNC_ENABLED`
  - Validate cron expression before scheduling
  - Track last run status and next run time

  **Test cases to cover**:
  - Valid cron schedule starts successfully
  - Invalid cron schedule fails with error
  - Disabled scheduler doesn't start
  - Status returns running state and next run time

  **Must NOT do**:
  - Run without valid config
  - Allow multiple concurrent sync runs

  **Parallelizable**: NO (depends on 2.2)

  **References**:
  - `src/services/backup-scheduler.service.ts` - EXACT pattern to follow
  - `src/config/registry/sections/backup.ts` - config section pattern
  - `src/cli.ts:150-170` - scheduler initialization in CLI

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-sync-scheduler.test.ts`
  - [ ] `bun test tests/unit/notion-sync-scheduler.test.ts` → all tests pass
  - [ ] `startNotionSyncScheduler(config)` → returns true on valid config
  - [ ] `getNotionSyncSchedulerStatus()` → returns { running, schedule, nextRun, lastRun }
  - [ ] Scheduler runs sync service at scheduled time

  **Commit**: YES
  - Message: `feat(notion): add scheduled sync with cron support`
  - Files: `src/services/notion-sync/scheduler.service.ts`, `src/config/registry/sections/notion-sync.ts`, `tests/unit/notion-sync-scheduler.test.ts`

---

- [x] 3.1. Add import evidence for sync audit trail

  **What to do**:
  - After each sync, create evidence record with `evidenceType: 'import'`
  - Store: source (notion), sourceId (database ID), recordCount, timestamps
  - Include sync summary in evidence metadata
  - Link evidence to project scope

  **Test cases to cover**:
  - Evidence created after successful sync
  - Evidence created after failed sync (with error info)
  - Evidence metadata includes sync statistics

  **Must NOT do**:
  - Skip evidence creation on errors

  **Parallelizable**: NO (depends on 2.2)

  **References**:
  - `src/db/schema/evidence.ts` - evidence table schema
  - `src/db/repositories/evidence.ts` - evidence repository
  - `src/mcp/handlers/evidence.handler.ts` - evidence creation pattern

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-sync-evidence.test.ts`
  - [ ] `bun test tests/unit/notion-sync-evidence.test.ts` → all tests pass
  - [ ] Evidence record created with: evidenceType='import', source='notion'
  - [ ] Evidence metadata includes: syncedCount, createdCount, updatedCount, deletedCount, errors

  **Commit**: YES
  - Message: `feat(notion): add import evidence for sync audit trail`
  - Files: `src/services/notion-sync/sync.service.ts` (update), `tests/unit/notion-sync-evidence.test.ts`

---

- [x] 3.2. Add MCP tool for manual sync trigger

  **What to do**:
  - Add `notion_sync` tool to MCP server
  - Actions: `sync`, `status`, `list_databases`
  - `sync` action: trigger immediate sync (single DB or all)
  - `status` action: return scheduler and last sync info
  - `list_databases` action: return configured databases

  **Test cases to cover**:
  - Manual sync triggers and returns result
  - Status returns scheduler info
  - List databases returns config
  - Invalid database ID returns error

  **Must NOT do**:
  - Allow sync without proper authentication
  - Expose Notion API key in responses

  **Parallelizable**: NO (depends on 3.0, 3.1)

  **References**:
  - `src/mcp/handlers/librarian.handler.ts:200-250` - MCP tool with status action
  - `src/mcp/descriptors/` - tool descriptor patterns
  - `src/mcp/server.ts` - tool registration

  **Acceptance Criteria**:
  - [ ] Test file: `tests/unit/notion-sync-handler.test.ts`
  - [ ] `bun test tests/unit/notion-sync-handler.test.ts` → all tests pass
  - [ ] MCP tool `notion_sync` registered and callable
  - [ ] `action: "sync"` returns sync result summary
  - [ ] `action: "status"` returns scheduler status

  **Commit**: YES
  - Message: `feat(mcp): add notion_sync tool for manual sync and status`
  - Files: `src/mcp/handlers/notion-sync.handler.ts`, `src/mcp/descriptors/notion_sync.ts`, `tests/unit/notion-sync-handler.test.ts`

---

- [x] 3.3. Add integration tests for full sync flow

  **What to do**:
  - Create integration test with mocked Notion API
  - Test full flow: config → client → sync → evidence → history
  - Test scheduler integration
  - Test error recovery scenarios

  **Test cases to cover**:
  - Full sync creates tasks with versions
  - Incremental sync only processes changes
  - Soft-delete works for removed items
  - Evidence trail complete
  - Scheduler triggers sync correctly
  - Rate limiting doesn't break sync
  - Circuit breaker recovery works

  **Must NOT do**:
  - Hit real Notion API in tests
  - Leave test data in database

  **Parallelizable**: NO (depends on 3.2)

  **References**:
  - `tests/integration/` - existing integration test patterns
  - `tests/fixtures/test-helpers.ts` - test database setup

  **Acceptance Criteria**:
  - [ ] Test file: `tests/integration/notion-sync.test.ts`
  - [ ] `bun test tests/integration/notion-sync.test.ts` → all tests pass
  - [ ] Coverage includes: create, update, delete, error handling
  - [ ] No flaky tests

  **Commit**: YES
  - Message: `test(notion): add integration tests for full sync flow`
  - Files: `tests/integration/notion-sync.test.ts`

---

## Commit Strategy

| After Task | Message                                           | Files                 | Verification         |
| ---------- | ------------------------------------------------- | --------------------- | -------------------- |
| 1.0        | `feat(schema): add task_versions table`           | migrations, schema    | `bun run db:migrate` |
| 1.1        | `feat(tasks): add version history support`        | repository, tests     | `bun test`           |
| 1.2        | `feat(mcp): add history action to memory_task`    | handler, descriptor   | `bun test`           |
| 2.0        | `feat(notion): add sync config schema`            | config, tests         | `bun test`           |
| 2.1        | `feat(notion): add API client with rate limiting` | client, tests         | `bun test`           |
| 2.2        | `feat(notion): add core sync service`             | service, tests        | `bun test`           |
| 2.3        | `feat(notion): add field mapper`                  | mapper, tests         | `bun test`           |
| 3.0        | `feat(notion): add scheduled sync`                | scheduler, config     | `bun test`           |
| 3.1        | `feat(notion): add import evidence`               | service update, tests | `bun test`           |
| 3.2        | `feat(mcp): add notion_sync tool`                 | handler, descriptor   | `bun test`           |
| 3.3        | `test(notion): add integration tests`             | integration tests     | `bun test`           |

---

## Success Criteria

### Verification Commands

```bash
# All tests pass
bun test

# Build succeeds
bun run build

# Type check passes
bun run typecheck

# Lint passes
bun run lint
```

### Final Checklist

- [x] All "Must Have" features implemented
- [x] All "Must NOT Have" guardrails respected
- [x] All tests pass (unit + integration)
- [x] No TypeScript errors
- [x] Documentation updated (if applicable) — Created `docs/guides/notion-sync.md`
- [~] Manual verification with test Notion database — **PERMANENTLY BLOCKED: Invalid API token, requires human setup (see notepads/blockers.md)**
