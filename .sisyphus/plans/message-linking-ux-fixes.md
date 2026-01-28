# Message Linking UX Fixes

## Context

### Original Request

Fix all message linking UX issues identified during testing:

1. Tool call content is generic (shows `[Tool calls: bash]` instead of execution details)
2. Episode list query returns 0 when episodes exist (scope filtering bug)
3. Relevance scoring never runs (maintenance job not triggered)
4. Message linking race condition (late messages orphaned)
5. Timestamp normalization fragile (string substring instead of Date parsing)

### Interview Summary

**Key Discussions**:

- User tested message linking UX and found 5 distinct issues
- 4 parallel explore agents investigated each area
- User confirmed: All 5 issues, Full tool execution capture, TDD approach

**Research Findings**:

- Tool calls: `src/services/ide-conversation/opencode-reader.ts:152` - only extracts tool names, ignores `state.input/output`
- Episode queries: `src/mcp/handlers/episodes.handler.ts:135` - defaults to `scopeType: 'project'`, scopeId may be null
- Relevance: `src/services/librarian/maintenance/message-relevance-scoring.ts` - fully implemented but not triggered
- Message linking: `src/services/episode/index.ts:254-283` - race condition on late messages
- Timestamps: Multiple files use `ts.slice(0, 19)` substring matching

### Metis Review

**Identified Gaps** (addressed):

- Dependencies between fixes: Sequenced Issue 2 first (may be masking others)
- Missing acceptance criteria: Added specific test scenarios
- Edge cases: Added null checks, error handling, large output handling
- Scope creep areas: Explicit MUST NOT boundaries

---

## Work Objectives

### Core Objective

Fix 5 message linking UX bugs to ensure: episode queries work correctly, tool calls show execution details, messages are reliably linked to episodes, and relevance scoring triggers automatically.

### Concrete Deliverables

- Fix 1: `opencode-reader.ts` captures full tool execution in content/metadata
- Fix 2: `episodes.handler.ts` + `episodes.ts` scope detection works correctly
- Fix 3: `episode/index.ts` triggers relevance scoring on complete
- Fix 4: `episode/index.ts` handles late messages via time window extension
- Fix 5: `ide-transcripts.ts` + `conversations.ts` use Date parsing for timestamps

### Definition of Done

- [ ] All 5 issues have failing tests written FIRST
- [ ] All 5 fixes implemented and tests pass
- [ ] `bun test` passes with 0 failures
- [ ] Manual verification: `memory_episode` list returns episodes correctly
- [ ] Manual verification: Tool calls show execution details in `what_happened`

### Must Have

- Full tool execution capture (input + output in content/metadata)
- Episode scope detection auto-populates scopeId
- Relevance scoring triggers after episode.complete()
- Late messages (within 5-second buffer) are linked
- Proper Date parsing for all timestamp comparisons

### Must NOT Have (Guardrails)

- **MUST NOT** modify scoring algorithm (Issue 3) - only fix trigger mechanism
- **MUST NOT** add rich formatting/syntax highlighting to tool output
- **MUST NOT** touch timestamps outside the 2 identified files for Issue 5
- **MUST NOT** combine multiple issues into single commits
- **MUST NOT** add new dependencies or utilities for these bug fixes
- **MUST NOT** address message de-duplication in this fix

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: TDD
- **Framework**: vitest (via `bun test`)

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**

1. **RED**: Write failing test first
   - Test file: `tests/unit/*.test.ts` or `tests/integration/*.test.ts`
   - Test command: `bun test [file]`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test [file]`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `bun test [file]`
   - Expected: PASS (still)

---

## Task Flow

```
Issue 2 (Scope) → Issue 5 (Timestamps) → Issue 4 (Race) → Issue 1 (Tools) → Issue 3 (Scoring)
```

**Rationale** (from Metis):

1. Fix scope detection first - may be masking other issues
2. Fix timestamp normalization - foundational for message linking
3. Fix race condition - ensures messages are linked
4. Fix tool content - improves what's captured
5. Fix relevance trigger - scores the now-complete message set

## Parallelization

| Task           | Depends On | Reason                                |
| -------------- | ---------- | ------------------------------------- |
| 1 (Scope)      | None       | Foundation fix                        |
| 2 (Timestamps) | 1          | Needs scope fix to verify linking     |
| 3 (Race)       | 2          | Uses timestamp logic                  |
| 4 (Tools)      | 1          | Needs scope fix to test what_happened |
| 5 (Scoring)    | 3, 4       | Needs complete message set            |

---

## TODOs

### Task 0: Establish Baseline

- [ ] 0. Run existing tests and verify baseline

  **What to do**:
  - Run full test suite to establish baseline state
  - Document any pre-existing failures
  - Verify test infrastructure is working

  **Must NOT do**:
  - Fix pre-existing failures (out of scope)

  **Parallelizable**: NO (must be first)

  **References**:
  - `package.json` - test scripts
  - `tests/` - existing test files

  **Acceptance Criteria**:
  - [ ] `bun test` completes (may have pre-existing failures)
  - [ ] Document baseline: N tests, M failures
  - [ ] Test infrastructure confirmed working

  **Commit**: NO (no changes)

---

### Task 1: Fix Episode Scope Detection (Issue 2)

- [x] 1. Fix episode scope detection bug

  **What to do**:
  - Write test: Create episode with sessionId only, query with sessionId, expect to find it
  - Write test: Create episode with scopeType='session', query with scopeType='session', expect to find it
  - Fix `episodes.handler.ts` addHandler to auto-populate scopeId from projectId
  - Fix scope detection: if sessionId provided without scopeType, detect appropriate scope
  - Ensure list query works with sessionId filter

  **Must NOT do**:
  - Change existing episode data (no migration)
  - Modify scope inheritance logic for other memory types

  **Parallelizable**: NO (foundation - must be first)

  **References**:
  - `src/mcp/handlers/episodes.handler.ts:129-186` - addHandler with scope logic (line 135: defaults to 'project', lines 166-172: projectId auto-populated but NOT scopeId)
  - `src/db/repositories/episodes.ts:147-186` - list method with scope filtering
  - `src/core/interfaces/repositories/temporal.ts:46-54` - ListEpisodesFilter interface
  - `tests/unit/episodes-handler.test.ts` - existing episode handler tests (pattern reference)
  - `tests/integration/episode-message-linking.test.ts` - existing integration tests (pattern reference)

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/episode-scope-detection.test.ts`
  - [ ] Test: create episode with sessionId → list with sessionId → returns episode
  - [ ] Test: create episode with scopeType='session' → list with scopeType='session' → returns episode
  - [ ] `bun test tests/unit/episode-scope-detection.test.ts` → PASS

  **Manual Execution Verification**:
  - [ ] Using memory_episode MCP tool:
    - Create episode: `{"action": "begin", "sessionId": "<current-session>", "name": "Test Scope"}`
    - List episodes: `{"action": "list", "sessionId": "<current-session>"}`
    - Verify: returned count > 0, episode found

  **Commit**: YES
  - Message: `fix(episodes): auto-populate scopeId and fix session-scoped queries`
  - Files: `src/mcp/handlers/episodes.handler.ts`, `src/db/repositories/episodes.ts`, `tests/unit/episode-scope-detection.test.ts`
  - Pre-commit: `bun test tests/unit/episode-scope-detection.test.ts`

---

### Task 2: Fix Timestamp Normalization (Issue 5)

- [x] 2. Replace string substring with Date parsing for timestamps

  **What to do**:
  - Search for all `slice(0, 19)` patterns in timestamp handling
  - Write tests for timestamp edge cases: ISO with Z, timezone offsets, milliseconds
  - Replace `ts.slice(0, 19)` with proper Date parsing and numeric comparison
  - Add null safety checks for invalid timestamps
  - Update both `ide-transcripts.ts` and `conversations.ts`

  **Must NOT do**:
  - Touch timestamps outside the 2 identified files
  - Change timestamp storage format (only comparison logic)

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `src/db/repositories/ide-transcripts.ts:271-273` - `normalizeTimestamp` function using `slice(0,19)`
  - `src/db/repositories/conversations.ts:520-522` - similar substring pattern
  - `src/services/unified-message-source.ts:229-250` - time-range fallback that uses timestamps
  - `tests/integration/episode-message-linking.test.ts:256-290` - existing time-range tests (pattern reference)

  **Edge Cases to Handle**:
  - Timestamps with `Z` suffix (ISO 8601)
  - Timestamps with timezone offsets (e.g., `+05:30`)
  - Timestamps with milliseconds (e.g., `.123`)
  - Invalid/null timestamp strings

  **Acceptance Criteria**:
  - [ ] Test file created/updated: `tests/unit/timestamp-normalization.test.ts`
  - [ ] Test: ISO timestamp with Z → compares correctly
  - [ ] Test: timestamp with timezone offset → compares correctly
  - [ ] Test: timestamp with milliseconds → compares correctly
  - [ ] Test: null/invalid timestamp → doesn't crash
  - [ ] `bun test tests/unit/timestamp-normalization.test.ts` → PASS

  **Manual Execution Verification**:
  - [ ] No direct manual test needed - covered by Task 3 verification

  **Commit**: YES
  - Message: `fix(timestamps): use Date parsing instead of string substring`
  - Files: `src/db/repositories/ide-transcripts.ts`, `src/db/repositories/conversations.ts`, `tests/unit/timestamp-normalization.test.ts`
  - Pre-commit: `bun test tests/unit/timestamp-normalization.test.ts`

---

### Task 3: Fix Message Linking Race Condition (Issue 4)

- [ ] 3. Handle late-arriving messages with time window extension

  **What to do**:
  - Write test: message arriving after episode.complete() but within 5s window → gets linked
  - Write test: message arriving way after episode.complete() (>5s) → not linked
  - In `importAndLinkMessages`, extend `endTime` by 5 seconds before linking
  - Add logging to show when late messages are captured
  - Alternative: add post-completion re-link hook if buffer approach insufficient

  **Must NOT do**:
  - Fix message de-duplication (separate issue)
  - Change how `episode.complete()` sets `endedAt`

  **Parallelizable**: NO (depends on Task 2)

  **References**:
  - `src/services/episode/index.ts:254-283` - `importAndLinkMessages` function
  - `src/services/episode/index.ts:169-211` - message linking with startTime/endTime
  - `src/services/unified-message-source.ts:171-207` - `linkMessagesToEpisode` implementation
  - `tests/integration/episode-message-linking.test.ts:367-422` - auto-linking tests (pattern reference)

  **Acceptance Criteria**:
  - [ ] Test file created/updated: `tests/integration/episode-late-messages.test.ts`
  - [ ] Test: message at T+2s after complete → linked
  - [ ] Test: message at T+10s after complete → NOT linked
  - [ ] `bun test tests/integration/episode-late-messages.test.ts` → PASS

  **Manual Execution Verification**:
  - [ ] Create episode, wait, add message via conversation, complete episode
  - [ ] Call `what_happened` → verify message appears in messages array

  **Commit**: YES
  - Message: `fix(episodes): extend time window to capture late-arriving messages`
  - Files: `src/services/episode/index.ts`, `tests/integration/episode-late-messages.test.ts`
  - Pre-commit: `bun test tests/integration/episode-late-messages.test.ts`

---

### Task 4: Capture Full Tool Execution Details (Issue 1)

- [ ] 4. Modify OpenCode reader to capture tool input/output

  **What to do**:
  - Write test: message with tool call → content includes tool input summary
  - Write test: message with tool call → toolsUsed metadata includes full details
  - Modify `opencode-reader.ts` to extract `state.input` and `state.output` from tool parts
  - Format tool content as: `[tool_name: first 100 chars of input]`
  - Store full execution details in `toolsUsed` metadata field (JSON with input/output)
  - Add null checks for `state`, `state.input`, `state.output`
  - Truncate large outputs (>5KB) with `... [truncated]`

  **Must NOT do**:
  - Add rich formatting or syntax highlighting
  - Capture `tool-result` parts (separate from tool call parts)
  - Change schema - use existing `toolsUsed` JSON field

  **Parallelizable**: NO (depends on Task 1 for testing)

  **References**:
  - `src/services/ide-conversation/opencode-reader.ts:19-31` - MessagePart interface with `state` field
  - `src/services/ide-conversation/opencode-reader.ts:138-159` - message parsing loop
  - `src/services/ide-conversation/opencode-reader.ts:152` - current `[Tool calls: X]` fallback
  - `tests/unit/ide-conversation/opencode-reader.test.ts` - existing reader tests (pattern reference)
  - `src/services/ide-conversation/types.ts` - IDEMessage interface definition

  **Edge Cases to Handle**:
  - `state: undefined` → use fallback label
  - `state.status !== 'completed'` → indicate pending/failed
  - Large output (>5KB) → truncate with marker
  - Multiple tool calls in single message → format each separately

  **Acceptance Criteria**:
  - [ ] Test file updated: `tests/unit/ide-conversation/opencode-reader.test.ts`
  - [ ] Test: tool with state.input → content shows input preview
  - [ ] Test: tool with large output → truncated correctly
  - [ ] Test: tool with undefined state → graceful fallback
  - [ ] `bun test tests/unit/ide-conversation/opencode-reader.test.ts` → PASS

  **Manual Execution Verification**:
  - [ ] Run bash command in this session
  - [ ] Complete episode
  - [ ] Call `what_happened` → verify messages show tool execution details, not just `[Tool calls: bash]`

  **Commit**: YES
  - Message: `feat(ide-conversation): capture full tool execution details`
  - Files: `src/services/ide-conversation/opencode-reader.ts`, `tests/unit/ide-conversation/opencode-reader.test.ts`
  - Pre-commit: `bun test tests/unit/ide-conversation/opencode-reader.test.ts`

---

### Task 5: Trigger Relevance Scoring on Episode Complete (Issue 3)

- [ ] 5. Add relevance scoring trigger after episode.complete()

  **What to do**:
  - Write test: episode.complete() → relevance scoring runs → messages have scores
  - In `episode.complete()`, after message linking, call relevance scoring
  - Use existing `runMessageRelevanceScoring` from maintenance module
  - Add error handling (non-fatal if scoring fails)
  - Log when scoring is triggered and results

  **Must NOT do**:
  - Modify the scoring algorithm itself
  - Make scoring synchronous (should be fire-and-forget or awaited with timeout)
  - Add scoring to episode.fail() or episode.cancel()

  **Parallelizable**: NO (depends on Tasks 3, 4 for complete message set)

  **References**:
  - `src/services/episode/index.ts:254-283` - importAndLinkMessages function (add scoring call after)
  - `src/services/librarian/maintenance/message-relevance-scoring.ts:99-241` - `runMessageRelevanceScoring` function
  - `src/services/librarian/maintenance/orchestrator.ts:229-251` - how orchestrator calls scoring (pattern reference)
  - `src/services/librarian/maintenance/types.ts:533-537` - DEFAULT_MAINTENANCE_CONFIG with scoring enabled
  - `tests/unit/librarian/message-enrichment.test.ts` - scoring unit tests (pattern reference)

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/integration/episode-relevance-scoring.test.ts`
  - [ ] Test: complete episode with messages → messages have relevanceScore set
  - [ ] Test: complete episode, extraction service unavailable → graceful failure
  - [ ] `bun test tests/integration/episode-relevance-scoring.test.ts` → PASS

  **Manual Execution Verification**:
  - [ ] Complete an episode with several messages
  - [ ] Call `what_happened` → verify messages have `relevanceCategory` (not null)

  **Commit**: YES
  - Message: `feat(episodes): trigger relevance scoring on episode complete`
  - Files: `src/services/episode/index.ts`, `tests/integration/episode-relevance-scoring.test.ts`
  - Pre-commit: `bun test tests/integration/episode-relevance-scoring.test.ts`

---

### Task 6: Final Verification

- [ ] 6. Run full test suite and manual end-to-end verification

  **What to do**:
  - Run complete test suite
  - Perform manual E2E test of all 5 fixes
  - Document any regressions

  **Must NOT do**:
  - Fix unrelated test failures
  - Add new features

  **Parallelizable**: NO (must be last)

  **References**:
  - All test files created in Tasks 1-5

  **Acceptance Criteria**:
  - [ ] `bun test` → all tests pass (or only pre-existing failures)
  - [ ] Manual: episode list with sessionId → returns episodes
  - [ ] Manual: what_happened → tool calls show execution details
  - [ ] Manual: what_happened → messages have relevance scores

  **Commit**: NO (no changes if all tests pass)

---

## Commit Strategy

| After Task | Message                                                               | Files                                | Verification                                                   |
| ---------- | --------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| 1          | `fix(episodes): auto-populate scopeId and fix session-scoped queries` | episodes.handler.ts, episodes.ts     | `bun test tests/unit/episode-scope-detection.test.ts`          |
| 2          | `fix(timestamps): use Date parsing instead of string substring`       | ide-transcripts.ts, conversations.ts | `bun test tests/unit/timestamp-normalization.test.ts`          |
| 3          | `fix(episodes): extend time window to capture late-arriving messages` | episode/index.ts                     | `bun test tests/integration/episode-late-messages.test.ts`     |
| 4          | `feat(ide-conversation): capture full tool execution details`         | opencode-reader.ts                   | `bun test tests/unit/ide-conversation/opencode-reader.test.ts` |
| 5          | `feat(episodes): trigger relevance scoring on episode complete`       | episode/index.ts                     | `bun test tests/integration/episode-relevance-scoring.test.ts` |

---

## Success Criteria

### Verification Commands

```bash
# Run all new tests
bun test tests/unit/episode-scope-detection.test.ts
bun test tests/unit/timestamp-normalization.test.ts
bun test tests/integration/episode-late-messages.test.ts
bun test tests/unit/ide-conversation/opencode-reader.test.ts
bun test tests/integration/episode-relevance-scoring.test.ts

# Run full suite
bun test
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Episode list with sessionId returns episodes
- [ ] Tool calls show execution details (not generic labels)
- [ ] Messages have relevance scores after episode complete
- [ ] Late messages (within 5s) are captured
