# Task 1: Tool Outcomes Event-Level Table - COMPLETED

## Summary

Successfully implemented event-level tool outcome tracking with dual-write strategy for backward compatibility.

## Files Created

### 1. `src/db/schema/tool-outcomes.ts`

- Event-level schema (one row per tool execution)
- Columns: id, sessionId, projectId, toolName, outcome, outcomeType, message, toolInputHash, inputSummary, outputSummary, durationMs, precedingToolId, analyzed, createdAt
- NO aggregate fields (occurrenceCount, firstOccurrence, lastOccurrence)
- Indexes: session_idx, created_at_idx, project_idx
- ID format: `out_${UUID v4}` (e.g., "out_a1b2c3d4-...")
- Timestamp: ISO 8601 with millisecond precision

### 2. `src/db/schema/session-tool-counter.ts`

- Counter table for periodic analysis tracking
- Columns: sessionId (PK), toolCount, lastAnalysisCount, updatedAt
- Used for CAS-based analysis claiming

### 3. `src/db/repositories/tool-outcomes.ts`

- Repository with 12 methods:
  - `record()` - Generates ID and createdAt, returns generated ID
  - `getBySession()` - Query by session with ordering
  - `getRecentOutcomes()` - Get N most recent outcomes
  - `getLastOutcomeForSession()` - For precedingToolId computation
  - `getUnanalyzed()` - Query unanalyzed outcomes
  - `markAnalyzed()` - Mark outcome as analyzed
  - `incrementAndGetToolCount()` - Atomic counter increment
  - `getToolCountSinceLastAnalysis()` - Compute delta
  - `markAnalysisComplete()` - Update lastAnalysisCount
  - `deleteCounter()` - Cleanup on session end
  - `getCounterSnapshot()` - Atomic read for CAS
  - `tryClaimAnalysis()` - CAS update for analysis claiming

### 4. `src/db/migrations/0041_add_tool_outcomes.sql`

- Creates tool_outcomes table with event-level schema
- Creates session_tool_counter table
- Migrates existing error_log data as 'failure' outcomes
- Maintains error_log table unchanged (backward compat)
- No sync trigger (dual-write strategy in PostToolUse)

## Files Modified

### 1. `src/db/schema/index.ts`

- Added exports for tool-outcomes.ts and session-tool-counter.ts

### 2. `src/core/interfaces/repositories/index.ts`

- Added ToolOutcomesRepository import
- Added toolOutcomes?: ToolOutcomesRepository to Repositories interface

### 3. `src/core/factory/repositories.ts`

- Added import for createToolOutcomesRepository
- Wired toolOutcomes repository in createRepositories return object

## Key Design Decisions

### Event-Level (NOT Aggregate)

- One row per tool execution (not deduplicated)
- Enables sequence analysis via precedingToolId chain
- Duration varies per execution
- Pattern analysis needs granular data (recovery patterns)

### Dual-Write Strategy (NO Trigger)

- error_log uses UPSERT (repeated errors update existing rows)
- Trigger would only fire on FIRST occurrence
- Solution: PostToolUse writes to BOTH tables directly
- Maintains backward compatibility

### Timestamp Ordering

- UUID v4 IDs are random (NOT insertion-order correlated)
- All ORDER BY queries use: `ORDER BY created_at DESC, id DESC`
- Tie-breaking is deterministic but arbitrary (acceptable per plan)

### Counter Storage (SQLite, NOT In-Memory)

- Hooks run as separate processes → Map would reset
- Counter must persist across hook invocations
- Atomic increment via `ON CONFLICT DO UPDATE` (SQL expression)

## Verification Checklist

✅ Schema created with event-level columns (no aggregate fields)
✅ ID generation uses `out_` prefix with UUID v4
✅ Timestamps use ISO 8601 with millisecond precision
✅ Repository generates id and createdAt (not caller)
✅ All queries use ORDER BY created_at DESC, id DESC
✅ Counter operations use atomic SQL increment
✅ error_log table unchanged (backward compat)
✅ Migration copies error_log data as 'failure' outcomes
✅ ToolOutcomesRepository wired in container
✅ Build passes with no TypeScript errors
✅ Commit created successfully

## Backward Compatibility

- error_log table remains UNCHANGED and WRITABLE
- Existing code using `ctx.repos.errorLog` continues to work
- Migration copies historical errors as 'failure' outcomes
- PostToolUse writes failures to BOTH tables (dual-write)

## Next Steps (Blocked Tasks)

- Task 2: Wire PostToolUse to use dual-write strategy
- Task 4: Implement periodic analysis using counter operations
- Task 5: Implement session-end analysis using outcomes

## Commit

```
feat(db): add tool_outcomes event-level table and session_tool_counter

- Create tool_outcomes table with event-level schema (one row per execution)
- Add session_tool_counter table for periodic analysis tracking
- Implement ToolOutcomesRepository with record() and counter operations
- Add migration 0041 to create both tables and migrate error_log data
- Wire ToolOutcomesRepository into container factory
- Maintain backward compatibility: error_log table unchanged
- ID generation uses 'out_' prefix (UUID v4) with ISO 8601 timestamps
- All queries use ORDER BY created_at DESC, id DESC for deterministic ordering
- Counter operations use atomic SQL increment for CAS-based analysis claiming
```

Commit: 939dd715
