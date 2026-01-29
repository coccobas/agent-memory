## Task 3: ErrorAnalyzerService → OutcomeAnalyzerService Rename

**Date:** 2026-01-29

### Implementation Strategy

**Two-Level Backward Compatibility:**

1. **Symbol-level aliases** in new file (outcome-analyzer.service.ts):

   ```typescript
   export const ErrorAnalyzerService = OutcomeAnalyzerService;
   export const getErrorAnalyzerService = getOutcomeAnalyzerService;
   ```

2. **Module-level re-export** in old file (error-analyzer.service.ts):
   ```typescript
   export {
     OutcomeAnalyzerService,
     OutcomeAnalyzerService as ErrorAnalyzerService,
     // ... etc
   } from './outcome-analyzer.service.js';
   ```

This approach ensures:

- Old imports continue working without modification
- New code uses new names
- Clear deprecation path via `@deprecated` tags

### Pattern Type Detection

**Four pattern types implemented:**

- `best_practice`: Consistently successful approaches
- `recovery`: Successful workarounds after failures
- `sequence`: Effective tool combinations
- `efficiency`: Faster/simpler approaches

**LLM Prompt Design:**

- Separate prompts for success patterns vs error patterns
- JSON output format for structured parsing
- Confidence scoring for pattern quality
- Frequency tracking for pattern importance

### "Pass Data In" Pattern

**Design Decision:** New methods accept pre-fetched `ToolOutcome[]` arrays instead of fetching internally.

**Benefits:**

1. **Testability:** Easy to test with mock outcomes
2. **Flexibility:** Caller can filter/transform before analysis
3. **Separation of concerns:** Analyzer focuses on analysis, not data access
4. **Consistent with existing pattern:** HookLearningService already uses this approach

**Legacy wrappers kept stubbed:**

- `analyzeSessionErrors()` → returns empty result
- `analyzeCrossSessionPatterns()` → returns empty result
- Maintains existing behavior (stubs)
- New code paths use direct methods

### Test Organization

**Learned:** Vitest config pattern is `tests/**/*.test.ts`, not `src/**/*.test.ts`

- Test files must be in `tests/unit/` directory
- Import paths: `../../src/services/learning/outcome-analyzer.service.js`
- Coverage exclusions: `**/*.test.ts` in src/ are excluded

**Test Structure:**

- `outcome-analyzer.test.ts`: Full suite (22 tests)
- `error-analyzer.test.ts`: Backward compat only (20 tests)

### Success Metrics

**All verifications passed:**

- ✅ 42 tests passing (22 new + 20 compat)
- ✅ Build succeeds with no errors
- ✅ LSP diagnostics clean (only expected deprecation hints)
- ✅ All 5 import sites work via re-export
- ✅ Pattern detection methods functional
- ✅ Backward compatibility maintained

### Key Takeaways

1. **Two-level compatibility strategy** is robust and maintainable
2. **"Pass data in" pattern** simplifies testing and separation of concerns
3. **Test file location matters** - follow project conventions strictly
4. **Deprecation tags** guide users through migration path
5. **Symbol aliases** enable seamless backward compatibility

## Integration Test Patterns (2026-01-30)

### Test Data Ordering

- `getBySession()` returns results in DESC order (most recent first)
- When testing sequences, use `.find()` instead of destructuring to avoid order assumptions
- Example: `const read = outcomes.find(o => o.toolName === 'Read')` is more robust than `const [read, edit, bash] = outcomes`

### Type Safety with Optional Fields

- Repository accepts `precedingToolId?: string` but stores as `string | null`
- Use `?? undefined` to convert null to undefined when needed: `precedingToolId: lastId ?? undefined`
- Avoid passing explicit `null` - let the repository handle null conversion

### Test Structure for Integration Tests

- Follow existing pattern from `error-learning.test.ts`
- Use `setupTestDb()` and `cleanupTestDb()` from test-helpers
- Clear tables in `beforeEach()` to ensure test isolation
- Test both happy path AND edge cases (all-success, all-failure, mixed, LLM unavailable)

### Coverage Verification

- Integration tests provide behavioral coverage, not line coverage
- Focus on testing the full pipeline: storage → analysis → knowledge generation
- Test edge cases: thresholds, concurrent access (CAS), graceful degradation

### Test Comments

- Integration test comments are justified (BDD-style: Given-When-Then)
- File header docstring documents test scope and edge cases
- Inline comments explain multi-step test logic and technical terms (e.g., CAS)

## [2026-01-29 23:59] Tool Outcome Tracking Implementation Complete

### Key Technical Decisions

1. **Event-Level Storage (NOT Aggregate)**
   - One row per tool execution in tool_outcomes table
   - Enables sequence analysis via precedingToolId chain
   - Aggregation happens at analysis time, not storage time

2. **Dual-Write Strategy for Backward Compatibility**
   - Failures written to BOTH error_log (aggregate) and tool_outcomes (event-level)
   - Successes go to tool_outcomes ONLY
   - No sync trigger needed - PostToolUse writes directly

3. **CAS-Based Concurrency Control**
   - Snapshot → Check → CAS → Query ordering prevents duplicate analysis
   - Counter claimed BEFORE querying outcomes
   - Batch selection by count (N most recent), not timestamp range

4. **SQLite Counter for Process Isolation**
   - Hooks run as separate processes - in-memory Map would reset
   - Atomic increment via onConflictDoUpdate pattern
   - Counter lifecycle tied to session (deleted on session end)

5. **Fire-and-Forget for LLM Analysis**
   - Fast DB ops (record, increment, CAS) are AWAITED (~5ms total)
   - LLM analysis runs in .then() callback (30s+, non-blocking)
   - PostToolUse hook returns immediately

6. **Registry-Based Config**
   - Consistent with existing config system
   - Auto-generates documentation
   - Zod validation on startup

7. **Two Writer Paths with Same Logic**
   - Claude Code hooks: Direct repo access in PostToolUse
   - OpenCode plugin: MCP actions (server-side derivation)
   - Identical field computation (redaction, precedingToolId, duration)

### Patterns That Worked Well

1. **Dependency Injection via setDependencies()**
   - HookLearningService uses explicit setDependencies pattern
   - Avoided this.context anti-pattern
   - Clear ownership of dependencies

2. **Test Scaffolding from test-helpers.ts**
   - setupTestDb() creates migrated SQLite automatically
   - Consistent pattern across integration tests
   - File-based (not in-memory) matches production

3. **Backward Compatibility Strategy**
   - Symbol aliases (ErrorAnalyzerService = OutcomeAnalyzerService)
   - Module re-export wrapper (old path still works)
   - Legacy wrappers stay stubbed (existing behavior preserved)

4. **Ordering Determinism**
   - UUID v4 IDs with `out_` prefix (matches existing patterns)
   - ORDER BY created_at DESC, id DESC for tie-breaking
   - Same-millisecond ties are deterministic but arbitrary (acceptable)

### Gotchas Avoided

1. **PostToolUse Hook Not Generated**
   - Command existed but wasn't in settings.json generation
   - Fixed by adding to generateClaudeCodeSettings()

2. **Wrong Execution Mode**
   - PostToolUse initially used initializeHookDatabase() (no repos)
   - Changed to initializeHookContext() for repo access

3. **Missing Dependency Wiring**
   - HookLearningService needed errorLogRepo and toolOutcomesRepo
   - Had to wire in ALL 3 locations (minimal, full, app context)

4. **Counter Increment Ordering**
   - Must increment AFTER successful outcome insert
   - Ensures counter reflects actual persisted data

### Files Modified (Summary)

**Wave 1 (Foundation):**

- src/db/schema/tool-outcomes.ts (NEW)
- src/db/schema/session-tool-counter.ts (NEW)
- src/db/repositories/tool-outcomes.ts (NEW)
- src/db/migrations/0041_add_tool_outcomes.sql (NEW)
- src/services/learning/outcome-analyzer.service.ts (NEW)
- src/services/learning/error-analyzer.service.ts (wrapper)

**Wave 2 (Services):**

- src/commands/hook/posttooluse-command.ts (outcome recording)
- src/commands/hook/outcome-utils.ts (NEW - utilities)
- src/commands/hook.ts (execution mode change)
- src/services/hook-generator.service.ts (PostToolUse generation)
- src/services/learning/hook-learning.service.ts (storePatternKnowledge, recordToolOutcome)
- src/mcp/handlers/hook-learning.handler.ts (tool_outcome, session_end_analysis)
- src/config/registry/sections/periodicAnalysis.ts (NEW)
- src/commands/hook/session-end-command.ts (onSessionEnd call)

**Wave 3 (Integration):**

- tests/integration/tool-outcome-tracking.test.ts (NEW - 23 tests)
- plugins/opencode/agent-memory.ts (MCP calls)

### Metrics

- Total files created: 6
- Total files modified: 15
- Integration tests: 23/23 passing
- Build: 0 errors, 92 pre-existing warnings
- Total implementation time: ~45 minutes (7 parallel tasks)
