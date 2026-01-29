# LLM-Based Error Learning

## TL;DR

> **Quick Summary**: Add LLM-based error analysis to detect repeated mistakes across sessions and auto-generate corrective knowledge/guidelines.
>
> **Deliverables**:
>
> - New `error_log` DB table for persistent error storage
> - New `ErrorAnalyzerService` with LLM-based pattern detection
> - Hook integration (PostToolUse stores errors, session-end triggers analysis)
> - Librarian maintenance task for cross-session batch analysis
>
> **Estimated Effort**: Medium (3-4 days)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request

The agent keeps making the same mistake (looking for database in `~/.agent-memory` instead of `data/`) across multiple sessions. The system failed to detect this pattern because:

1. Error tracking is per-session only (in-memory Map)
2. Detection is regex-based, no semantic understanding
3. No cross-session pattern analysis exists

### Interview Summary

**Key Discussions**:

- Chose "Medium" approach: session-end LLM analysis + Librarian batch analysis
- Balances detection speed vs LLM cost
- Leverages existing LLM infrastructure from `experience.module.ts`

**Research Findings**:

- `HookLearningService` already tracks failures per-session
- `parseToolResult()` has regex-based error detection (12 patterns)
- `experience.module.ts` has working LLM clients (OpenAI, Anthropic, Ollama)
- Librarian has job manager infrastructure for async tasks

### Metis Review

**Identified Gaps** (addressed below):

- Deduplication strategy for repeated errors
- LLM analysis trigger thresholds
- Tool input privacy concerns
- Confidence calibration for auto-generated entries
- Edge cases: empty sessions, LLM unavailable, conflicting patterns

---

## Work Objectives

### Core Objective

Enable the system to detect when the agent makes the same conceptual mistake across multiple sessions and automatically generate corrective knowledge to prevent recurrence.

### Concrete Deliverables

- `src/db/schema/error-log.ts` - New DB schema
- `src/db/repositories/error-log.ts` - CRUD repository
- `src/services/learning/error-analyzer.service.ts` - LLM analysis service
- Modified `posttooluse-command.ts` - Store errors in DB
- Modified `hook-learning.service.ts` - Session-end analysis trigger
- Modified `librarian/maintenance/` - Batch error analysis task

### Definition of Done

- [x] Errors persist to DB across sessions (`sqlite3 data/memory.db ".schema error_log"` shows table)
- [x] Session-end triggers LLM analysis (logs show "Starting error analysis")
- [x] Cross-session patterns detected by Librarian (`memory_librarian list_recommendations` shows error patterns)
- [x] Auto-generated knowledge stored at session scope (not project - needs promotion)
- [x] All tests pass (`bun test src/services/learning/error-analyzer.test.ts`)

### Must Have

- Persistent error storage with session/project context
- LLM-based semantic pattern detection
- Cross-session analysis capability
- Auto-generation of corrective knowledge (at session scope)
- Privacy: no raw tool input by default

### Must NOT Have (Guardrails)

- NO auto-storage at project scope (always session, needs promotion)
- NO blocking session-end hook on LLM (fire-and-forget with 30s timeout)
- NO storing raw tool input without explicit opt-in (privacy)
- NO real-time per-error LLM calls (batch at session-end only)
- NO retry on LLM failure (let Librarian batch handle later)
- NO external error tracking integration (Sentry, etc.) - internal only
- NO error alerting/notifications - this is analysis, not alerting
- NO custom LLM prompts - use hardcoded prompts for v1

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (TDD)
- **Framework**: vitest

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: DB schema + repository
└── Task 3: Error analyzer service (can stub DB)

Wave 2 (After Wave 1):
├── Task 2: PostToolUse hook integration
├── Task 4: Session-end integration
└── Task 5: Librarian batch task

Wave 3 (After Wave 2):
└── Task 6: Integration testing + edge cases
```

### Dependency Matrix

| Task | Depends On | Blocks  | Can Parallelize With |
| ---- | ---------- | ------- | -------------------- |
| 1    | None       | 2, 4, 5 | 3                    |
| 2    | 1          | 4       | 3                    |
| 3    | None       | 4, 5    | 1                    |
| 4    | 2, 3       | 6       | 5                    |
| 5    | 1, 3       | 6       | 4                    |
| 6    | 4, 5       | None    | None (final)         |

---

## TODOs

### Task 1: Error Log DB Schema + Repository

**What to do**:

- Create `src/db/schema/error-log.ts` with error_log table
- Create `src/db/repositories/error-log.ts` with CRUD operations
- Add migration for the new table
- Implement deduplication (hash-based, increment counter on dupe)

**Schema Design**:

```typescript
export const errorLog = sqliteTable('error_log', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  projectId: text('project_id'),
  toolName: text('tool_name').notNull(),
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message'), // Truncated to 2000 chars
  errorSignature: text('error_signature').notNull(), // Hash for dedup
  occurrenceCount: integer('occurrence_count').default(1),
  firstOccurrence: text('first_occurrence').notNull(),
  lastOccurrence: text('last_occurrence').notNull(),
  toolInputHash: text('tool_input_hash'), // Optional, privacy-safe
  analyzed: integer('analyzed').default(0), // 0=pending, 1=analyzed
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

**Must NOT do**:

- Store raw tool input (privacy)
- Store more than 2000 chars of error message

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Single-file schema creation, straightforward CRUD
- **Skills**: [`coding-standards`, `backend-patterns`]
  - `coding-standards`: Follow project TypeScript conventions
  - `backend-patterns`: DB schema and repository patterns

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 3)
- **Blocks**: Tasks 2, 4, 5
- **Blocked By**: None

**References**:

- `src/db/schema/hook-metrics.ts` - Similar schema pattern for hook data
- `src/db/schema/feedback.ts` - Pattern for tracking events with dedup
- `src/db/repositories/experiences.ts` - Repository pattern to follow
- `src/db/index.ts` - Where to export new schema

**Acceptance Criteria**:

**RED (test first)**:

```bash
# Create test file: src/db/repositories/error-log.test.ts
bun test src/db/repositories/error-log.test.ts
# Expected: FAIL - module not found
```

**GREEN (implement)**:

```bash
# After implementation
bun test src/db/repositories/error-log.test.ts
# Expected: PASS

# Verify schema
sqlite3 data/memory.db ".schema error_log"
# Expected: CREATE TABLE error_log (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ...)

# Verify deduplication
bun -e "
import { ErrorLogRepository } from './src/db/repositories/error-log';
const repo = new ErrorLogRepository();
await repo.record({ sessionId: 'test', toolName: 'Bash', errorType: 'ENOENT', errorMessage: 'file not found', errorSignature: 'hash1' });
await repo.record({ sessionId: 'test', toolName: 'Bash', errorType: 'ENOENT', errorMessage: 'file not found', errorSignature: 'hash1' });
const errors = await repo.getBySession('test');
console.log(errors.length, errors[0].occurrenceCount);
"
# Expected: 1 2 (one entry with count=2)
```

**Commit**: YES

- Message: `feat(db): add error_log schema and repository for cross-session error tracking`
- Files: `src/db/schema/error-log.ts`, `src/db/repositories/error-log.ts`, `src/db/repositories/error-log.test.ts`
- Pre-commit: `bun test src/db/repositories/error-log.test.ts`

---

### Task 2: PostToolUse Hook Integration

**What to do**:

- Modify `posttooluse-command.ts` to store errors in DB
- Call `ErrorLogRepository.record()` when `success: false`
- Generate error signature from toolName + errorType + normalized message
- Respect privacy: hash tool input, don't store raw

**Must NOT do**:

- Change existing error detection logic (keep regex)
- Store raw tool input
- Block on DB write (fire-and-forget)

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Small modification to existing hook
- **Skills**: [`coding-standards`, `backend-patterns`]
  - `coding-standards`: Follow existing code patterns
  - `backend-patterns`: Non-blocking DB writes

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (after Task 1)
- **Blocks**: Task 4
- **Blocked By**: Task 1

**References**:

- `src/commands/hook/posttooluse-command.ts:222-300` - Where to add DB storage
- `src/commands/hook/posttooluse-command.ts:66-130` - parseToolResult function
- `src/services/learning/hook-learning.service.ts:361-425` - Pattern for non-blocking error handling

**Acceptance Criteria**:

```bash
# Simulate tool failure and verify DB storage
bun -e "
import { executePostToolUseHook } from './src/commands/hook/posttooluse-command';
await executePostToolUseHook({
  session_id: 'test-session',
  tool_name: 'Bash',
  tool_input: { command: 'sqlite3 ~/.agent-memory/memory.db' },
  tool_response: 'Error: unable to open database'
});
"

# Verify error stored
sqlite3 data/memory.db "SELECT tool_name, error_type, occurrence_count FROM error_log WHERE session_id='test-session'"
# Expected: Bash|error|1
```

**Commit**: YES

- Message: `feat(hooks): store tool errors in DB for cross-session analysis`
- Files: `src/commands/hook/posttooluse-command.ts`
- Pre-commit: `bun test src/commands/hook`

---

### Task 3: Error Analyzer Service

**What to do**:

- Create `src/services/learning/error-analyzer.service.ts`
- Implement `analyzeSessionErrors(sessionId)` - LLM analysis of session errors
- Implement `analyzeCrossSessionPatterns(projectId, days)` - batch analysis
- Implement `generateCorrectiveEntry(pattern)` - create knowledge/guideline
- Reuse LLM client pattern from `experience.module.ts`

**LLM Prompt for Session Analysis**:

```
You are analyzing tool errors from an AI coding assistant session.

Errors from this session:
---
{errors_formatted}
---

Analyze these errors and identify:
1. Are there repeated mistakes (same conceptual error)?
2. What is the agent doing wrong?
3. What corrective knowledge would prevent this?

Output JSON:
{
  "patterns": [{
    "patternType": "wrong_path" | "missing_dependency" | "config_error" | "permission" | "other",
    "description": "What the agent keeps getting wrong",
    "frequency": number,
    "suggestedCorrection": {
      "type": "knowledge" | "guideline",
      "title": "Short title",
      "content": "Corrective content"
    },
    "confidence": 0.0-1.0
  }],
  "noPatternDetected": boolean
}
```

**Must NOT do**:

- Call LLM for every individual error (batch only)
- Auto-store at project scope (session only)
- Block on LLM timeout (30s max, then give up)

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
  - Reason: New service with LLM integration, moderate complexity
- **Skills**: [`coding-standards`, `backend-patterns`]
  - `coding-standards`: TypeScript patterns
  - `backend-patterns`: Service architecture

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1)
- **Blocks**: Tasks 4, 5
- **Blocked By**: None (can stub DB initially)

**References**:

- `src/services/capture/experience.module.ts:446-540` - LLM client patterns (OpenAI, Anthropic, Ollama)
- `src/services/capture/experience.module.ts:388-415` - Extraction dispatch pattern
- `src/services/learning/hook-learning.service.ts:428-490` - Experience creation from patterns
- `src/utils/logger.ts` - Logger creation pattern

**Acceptance Criteria**:

**RED (test first)**:

```bash
# Create test: src/services/learning/error-analyzer.test.ts
bun test src/services/learning/error-analyzer.test.ts
# Expected: FAIL - module not found
```

**GREEN (implement)**:

```bash
# Unit test with mocked LLM
bun test src/services/learning/error-analyzer.test.ts
# Expected: PASS

# Integration test (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)
AGENT_MEMORY_LOG_LEVEL=debug bun -e "
import { ErrorAnalyzerService } from './src/services/learning/error-analyzer.service';
const analyzer = new ErrorAnalyzerService();
const result = await analyzer.analyzeSessionErrors('test-session');
console.log(JSON.stringify(result, null, 2));
"
# Expected: { patterns: [...], analyzed: true }
```

**Commit**: YES

- Message: `feat(learning): add LLM-based error analyzer service`
- Files: `src/services/learning/error-analyzer.service.ts`, `src/services/learning/error-analyzer.test.ts`
- Pre-commit: `bun test src/services/learning/error-analyzer.test.ts`

---

### Task 4: Session-End Integration

**What to do**:

- Modify `hook-learning.service.ts` to trigger error analysis on session end
- Add `onSessionEnd(sessionId)` method
- Fire-and-forget: don't block session termination
- Respect thresholds: only analyze if 2+ unique error types in session
- Store generated knowledge at session scope

**Configuration**:

```typescript
interface ErrorAnalysisConfig {
  enabled: boolean; // default: true
  minUniqueErrorTypes: number; // default: 2
  analysisTimeoutMs: number; // default: 30000
  confidenceThreshold: number; // default: 0.7
  maxErrorsToAnalyze: number; // default: 50
}
```

**Must NOT do**:

- Block session-end on LLM analysis
- Analyze sessions with < 2 unique error types
- Store knowledge at project scope (session only)
- Retry on LLM failure

**Recommended Agent Profile**:

- **Category**: `quick`
  - Reason: Integration into existing service
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 5)
- **Blocks**: Task 6
- **Blocked By**: Tasks 2, 3

**References**:

- `src/services/learning/hook-learning.service.ts:269-290` - Service structure
- `src/services/learning/hook-learning.service.ts:684-820` - Error pattern handling
- `src/commands/hook/session-end-command.ts` - Session end hook entry point

**Acceptance Criteria**:

```bash
# Simulate session with errors, then end session
bun -e "
import { getHookLearningService } from './src/services/learning/hook-learning.service';
const service = getHookLearningService();

// Record multiple errors
await service.onToolFailure({ sessionId: 'test-456', toolName: 'Bash', errorType: 'ENOENT', errorMessage: 'file not found' });
await service.onToolFailure({ sessionId: 'test-456', toolName: 'Read', errorType: 'file_not_found', errorMessage: 'path does not exist' });

// Trigger session end analysis
const result = await service.onSessionEnd('test-456');
console.log(JSON.stringify(result, null, 2));
"
# Expected: { analyzed: true, patternsDetected: N, knowledgeCreated: N }

# Verify knowledge created at session scope
sqlite3 data/memory.db "SELECT title, scope_type FROM knowledge WHERE created_by='error-analyzer'"
# Expected: Shows entries with scope_type='session'
```

**Commit**: YES

- Message: `feat(learning): trigger LLM error analysis on session end`
- Files: `src/services/learning/hook-learning.service.ts`
- Pre-commit: `bun test src/services/learning`

---

### Task 5: Librarian Batch Task

**What to do**:

- Add `errorAnalysis` task to Librarian maintenance
- Implement `analyzeCrossSessionErrors()` in maintenance pipeline
- Query errors from last 7 days across sessions
- Detect patterns appearing in 2+ different sessions
- Generate recommendations (not auto-store)

**Must NOT do**:

- Auto-store at project scope (create recommendations instead)
- Analyze more than 7 days of history (performance)
- Block maintenance on single analysis failure

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
  - Reason: Integration into existing maintenance framework
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 4)
- **Blocks**: Task 6
- **Blocked By**: Tasks 1, 3

**References**:

- `src/services/librarian/maintenance/job-manager.ts` - Job infrastructure
- `src/services/librarian/index.ts:233-380` - Maintenance orchestration
- `src/mcp/handlers/librarian.handler.ts:884-913` - runMaintenance handler
- `src/services/librarian/maintenance/consolidation.ts` - Example maintenance task

**Acceptance Criteria**:

```bash
# Run maintenance with errorAnalysis task
bun -e "
import { getLibrarianService } from './src/services/librarian';
const librarian = getLibrarianService();
const result = await librarian.runMaintenance({
  scopeType: 'project',
  scopeId: 'test-project',
  tasks: ['errorAnalysis'],
  dryRun: false
});
console.log(JSON.stringify(result, null, 2));
"
# Expected: { errorAnalysis: { patternsDetected: N, recommendationsCreated: N } }

# Verify recommendations created
sqlite3 data/memory.db "SELECT pattern_type, status FROM recommendations WHERE source='error-analysis'"
# Expected: Shows recommendations with status='pending'
```

**Commit**: YES

- Message: `feat(librarian): add cross-session error analysis to maintenance`
- Files: `src/services/librarian/maintenance/error-analysis.ts`, `src/services/librarian/index.ts`
- Pre-commit: `bun test src/services/librarian`

---

### Task 6: Integration Testing + Edge Cases

**What to do**:

- Create integration test for full flow
- Test edge cases:
  - Empty session (0 errors) → skip analysis
  - LLM unavailable → graceful degradation
  - Session without projectId → use global scope
  - Conflicting patterns → create separate recommendations

**Must NOT do**:

- Skip edge case testing
- Leave untested code paths

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
  - Reason: Test creation following patterns
- **Skills**: [`coding-standards`, `tdd-workflow`]
  - `tdd-workflow`: Comprehensive test coverage

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocks**: None
- **Blocked By**: Tasks 4, 5

**References**:

- `tests/integration/` - Integration test patterns
- `tests/unit/services/learning/` - Unit test patterns

**Acceptance Criteria**:

```bash
# Run full integration test suite
bun test tests/integration/error-learning.test.ts
# Expected: All tests pass

# Run with coverage
bun test:coverage src/services/learning/error-analyzer
# Expected: >80% coverage
```

**Commit**: YES

- Message: `test(learning): add integration tests for LLM error learning`
- Files: `tests/integration/error-learning.test.ts`
- Pre-commit: `bun test tests/integration/error-learning.test.ts`

---

## Commit Strategy

| After Task | Message                                              | Files               | Verification              |
| ---------- | ---------------------------------------------------- | ------------------- | ------------------------- |
| 1          | `feat(db): add error_log schema and repository`      | schema, repo, test  | `bun test error-log`      |
| 2          | `feat(hooks): store tool errors in DB`               | posttooluse-command | `bun test hook`           |
| 3          | `feat(learning): add LLM error analyzer service`     | service, test       | `bun test error-analyzer` |
| 4          | `feat(learning): trigger analysis on session end`    | hook-learning       | `bun test learning`       |
| 5          | `feat(librarian): add error analysis to maintenance` | maintenance         | `bun test librarian`      |
| 6          | `test(learning): add integration tests`              | integration test    | `bun test integration`    |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
bun test src/services/learning/
# Expected: All tests pass

# DB has error_log table
sqlite3 data/memory.db ".schema error_log"
# Expected: CREATE TABLE error_log (...)

# End-to-end: error → analysis → knowledge
AGENT_MEMORY_LOG_LEVEL=debug bun run test:e2e:error-learning
# Expected: Logs show full pipeline execution
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Privacy: no raw tool input stored
- [x] Performance: session-end doesn't block
- [x] Cross-session patterns detectable
