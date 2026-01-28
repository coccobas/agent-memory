# Task 1: Episode Scope Detection - Learnings

## Date: 2025-01-28

### Problem Summary

Episode list queries returned 0 results when episodes existed because `scopeId` was not auto-populated during episode creation. The handler defaulted `scopeType` to 'project' but left `scopeId` undefined, causing scope filtering to fail.

### Solution Pattern

Auto-populate `scopeId` based on `scopeType` in the `addHandler` function:

- If `scopeType === 'session'` and `scopeId` not provided → set `scopeId = sessionId`
- If `scopeType === 'project'` and `scopeId` not provided → set `scopeId = projectId`
- If `scopeId` explicitly provided → respect it (don't override)

### Implementation Location

**File**: `src/mcp/handlers/episodes.handler.ts` (lines 173-182)

Added after projectId auto-population:

```typescript
// Auto-populate scopeId based on scopeType
let finalScopeId = scopeId;
if (!finalScopeId) {
  if (scopeType === 'session' && sessionId) {
    finalScopeId = sessionId;
  } else if (scopeType === 'project' && projectId) {
    finalScopeId = projectId;
  }
}
```

### Key Insights

1. **Scope hierarchy**: scopeType determines which ID should be used as scopeId
2. **Auto-population pattern**: Similar to existing projectId auto-population from session
3. **Explicit override**: Respects explicitly provided scopeId (doesn't override)
4. **Repository filtering**: `episodes.ts` list method already filters correctly by scopeId once it's set

### Test Coverage

- Test 1: Create with sessionId only → scopeId auto-populated from projectId
- Test 2: Create with scopeType='session' → scopeId auto-populated from sessionId
- Test 3: Create with explicit scopeId → scopeId preserved (not overridden)
- Test 4: List with sessionId filter → returns episodes correctly

### Verification

- All 4 unit tests pass
- Full test suite: 9788 tests pass, 0 failures
- No regressions introduced

## Task 2: Timestamp Normalization (2026-01-28)

### Problem

- Original code used fragile string manipulation: `ts.slice(0, 19)` after `replace('T', ' ').replace('Z', '')`
- Failed on timezone offsets (e.g., `+05:30`, `-05:00`)
- Failed on milliseconds (e.g., `.123`)
- No validation for null/undefined inputs
- String comparison instead of proper Date parsing

### Solution

Replaced string manipulation with proper Date parsing:

```typescript
const normalizeTimestamp = (ts: string): string => {
  const date = new Date(ts);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${ts}`);
  }
  return date.toISOString().replace('T', ' ').slice(0, 19);
};
```

### Key Insight

- SQLite's `CURRENT_TIMESTAMP` returns `YYYY-MM-DD HH:MM:SS` format (space, not T)
- Must convert ISO format to SQLite format for SQL BETWEEN comparisons
- `date.toISOString()` handles all timezone offsets and milliseconds correctly
- Then convert back to SQLite format with `.replace('T', ' ').slice(0, 19)`

### Files Modified

- `src/db/repositories/ide-transcripts.ts` line 270-277
- `src/db/repositories/conversations.ts` line 520-527

### Tests Created

- `tests/unit/timestamp-normalization.test.ts` - 12 comprehensive test cases
  - ISO 8601 with Z suffix
  - Timezone offsets (+05:30, -05:00)
  - Milliseconds preservation
  - Null/undefined handling
  - Invalid format error handling
  - Numeric comparison verification
  - BETWEEN comparison logic

### Test Results

- 12 new tests added (all passing)
- Full suite: 9800 tests passing, 0 failures
- No regressions in integration tests
- Episode message linking now works correctly

### Pattern Applied

- TDD workflow: RED → GREEN → REFACTOR
- Consistent implementation across both repository files
- Proper error handling with descriptive messages
- Maintains backward compatibility with SQL queries

## [2026-01-28] Task 3: Message Linking Race Condition (Late-Arriving Messages)

### Problem

Messages arriving shortly after `episode.complete()` were orphaned because they fell outside the exact time window (startedAt to endedAt). This is a race condition where:

1. Episode completes at T=60s → `episode.endedAt = T=60s`
2. Message arrives at T=62s (2 seconds later)
3. `linkMessagesToEpisode` uses time range [T=0, T=60s]
4. Message at T=62s is OUTSIDE the range → NOT LINKED (orphaned)

### Solution

Added 5-second buffer to `endTime` when linking messages to episodes. This captures late-arriving messages without changing the episode's actual `endedAt` timestamp.

### Implementation Details

- **File**: `src/services/episode/index.ts`
- **Constant**: `LATE_MESSAGE_BUFFER_MS = 5000` (line 32)
- **Function**: `importAndLinkMessages` (lines 120-214)
- **Pattern**: Calculate `endTimeWithBuffer = new Date(new Date(episode.endedAt).getTime() + LATE_MESSAGE_BUFFER_MS).toISOString()`
- **Applied to**: Both code paths (unifiedMessageSource and conversationRepo fallback)

### Key Insight

The buffer extends the time window for message linking WITHOUT modifying the episode's actual `endedAt` timestamp. This preserves episode timing accuracy while capturing late messages.

### Test Coverage

- **Test File**: `tests/integration/episode-late-messages.test.ts`
- **Test 1**: Message arriving T+2s after complete() → GETS LINKED (within 5s buffer)
- **Test 2**: Message arriving T+10s after complete() → NOT LINKED (outside 5s buffer)
- **Timeout**: Second test requires 15s timeout due to 10-second wait

### Logging

Added debug logging showing:

- `originalEndTime`: The actual episode.endedAt
- `bufferedEndTime`: The extended time with 5s buffer
- Helps diagnose late-message linking behavior

### Test Results

- New tests: 2 passing
- Existing episode-message-linking tests: 13 passing (no regressions)
- Full test suite: 9802 tests passing (up from 9800)
- 0 failures

### Lessons Learned

1. Race conditions in async systems require temporal buffers
2. Buffers should be configurable constants, not magic numbers
3. Both code paths (primary + fallback) must implement the same logic
4. Debug logging with before/after timestamps helps troubleshooting
5. Integration tests with real timing (setTimeout) validate race condition fixes

## [2026-01-28 23:33] Task 4: Tool Execution Capture

### Problem

Tool calls showed generic `[Tool calls: bash]` instead of actual execution details (command + output). Users couldn't see what the tool actually did.

### Solution

Extract `state.input` and `state.output` from tool parts and store in metadata.

### Implementation Details

**File**: `src/services/ide-conversation/opencode-reader.ts` lines 144-194

**Key Changes**:

1. Filter tool parts separately to access state
2. Extract input/output from `p.state` when available
3. Truncate large outputs (>5KB) with marker
4. Store full execution details in `metadata.toolExecutions`
5. Format content preview with input preview (first 100 chars)

**Constants Extracted**:

- `MAX_INPUT_PREVIEW_LENGTH = 100` - Input preview truncation
- `MAX_OUTPUT_LENGTH = 5000` - Output truncation threshold
- `TRUNCATION_MARKER = '... [truncated]'` - Truncation indicator

### Pattern: Tool Execution Metadata

```typescript
toolExecutions: Array<{
  name: string;
  input?: unknown;
  output?: string;
  status?: string;
}>;
```

Stored in `metadata.toolExecutions` for full details while content shows preview.

### Test Coverage

- 5 new test cases added (all passing)
- Test case 1: Tool with state.input → content shows input preview
- Test case 2: Tool with large output (>5KB) → truncated with marker
- Test case 3: Tool without state → graceful fallback
- Test case 4: Tool with non-completed status → status shown in preview
- Test case 5: Multiple tool calls → each formatted separately

### Results

- 22 tests pass in opencode-reader.test.ts
- 9807 total tests pass (exceeds 9802+ baseline)
- 0 failures, 0 regressions
- LSP diagnostics: clean

### Learnings

1. JSON.stringify escapes quotes - tests must check for escaped content or use partial matches
2. Truncation marker adds 15 chars to output length (5000 + "... [truncated]" = 5015)
3. Tool execution details should be stored separately from preview content
4. Constants improve readability and maintainability for magic numbers
5. TDD workflow (RED-GREEN-REFACTOR) ensures comprehensive test coverage

## [2026-01-28 23:45] Task 5: Relevance Scoring Trigger (FINAL CORE FIX) ✅

### Problem

Relevance scoring never ran automatically after episode completion. The `runMessageRelevanceScoring` function existed but was never called, leaving messages unscored and making relevance-based filtering impossible.

### Solution

Added relevance scoring trigger to `episode.complete()` function after message linking completes.

### Implementation Details

**Files Modified:**

1. `src/services/episode/index.ts` - Added scoring trigger in complete() function
2. `src/core/factory/context-wiring.ts` - Passed db and extractionService to episode service
3. `tests/integration/episode-relevance-scoring.test.ts` - Created 3 test cases

**Key Changes:**

- Added `db` and `extractionService` to `EpisodeServiceDeps` interface
- Imported `runMessageRelevanceScoring` from maintenance module
- Added try-catch block after `importAndLinkMessages()` to trigger scoring
- Non-fatal error handling: scoring failures don't crash episode completion
- Debug logging for scoring execution and results

**Pattern Used:**

```typescript
try {
  if (messagesLinked > 0 && db && extractionService) {
    const scoringResult = await runMessageRelevanceScoring(
      { db, extractionService },
      { scopeType: 'project', scopeId: episode.projectId ?? undefined, initiatedBy: 'episode-complete' },
      { enabled: true, maxMessagesPerRun: 100, thresholds: { high: 0.8, medium: 0.5, low: 0.0 } }
    );
    // Log results
  }
} catch (error) {
  logger.warn({ episodeId: episode.id, error: ... }, 'Failed to score message relevance (non-fatal)');
}
```

### Test Results

- RED phase: 1 test failed (messagesLinked was 0)
- GREEN phase: 3 tests pass (all scenarios covered)
- Full suite: 9810 tests pass (+3 new tests, 0 failures)
- No regressions detected

### Test Coverage

1. **Test 1**: Episode with messages → scoring runs → messages have relevanceScore/relevanceCategory
2. **Test 2**: Extraction service unavailable → graceful failure (non-fatal)
3. **Test 3**: Episode with no messages → doesn't crash

### Key Insights

- Scoring is optional: if extractionService unavailable, episode still completes successfully
- Scoring only runs if messages were linked (messagesLinked > 0)
- Non-fatal error handling ensures episode completion is never blocked by scoring failures
- Debug logging helps troubleshoot scoring execution in production

### Dependencies

- Requires `db` connection (AppDb) - passed from context
- Requires `extractionService` (IExtractionService) - optional, gracefully skipped if unavailable
- Uses existing `runMessageRelevanceScoring` function from maintenance module

### Verification

✅ Tests pass: 9810 total (9807 baseline + 3 new)
✅ No regressions: All existing tests still pass
✅ Error handling: Non-fatal, doesn't block episode completion
✅ Logging: Debug and warn levels for troubleshooting

### Status: COMPLETE ✅

All 5 core fixes now complete. Message linking UX fully functional.
