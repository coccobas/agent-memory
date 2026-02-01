# Episode Quality Fixes - Stop Garbage Experience Recording

## TL;DR

> **Quick Summary**: Fix OpenCode plugin to stop auto-recording meaningless experiences like "Fixed bash error → Resolved by re-running bash". Implement quality filter with TDD.
>
> **Deliverables**:
>
> - Quality filter function that rejects template garbage
> - Fix TWO garbage sources (error recovery + session end)
> - Unit tests for quality filter
> - Updated vitest config for plugin tests
>
> **Estimated Effort**: Medium (2-3 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (tests) → Task 2 (filter) → Task 3 (wire up) → Task 4 (verify)

---

## Context

### Original Request

Fix garbage episode data in the OpenCode plugin that creates meaningless experiences like "Fixed bash error → Resolved by re-running bash"

### Interview Summary

**Key Discussions**:

- Root cause: OpenCode plugin auto-records template experiences on every "error recovery"
- Location: `plugins/opencode/agent-memory.ts`
- Quality filter behavior: Silent drop (no logging, no noise)
- Test strategy: TDD style (write tests first)

**Research Findings**:

- `recordExperience()` at line 262-279 calls `memory_experience action:learn`
- `checkErrorRecovery()` at line 290-301 detects when tool succeeds after failure
- Error recovery window: 5 minutes (`ERROR_RECOVERY_WINDOW_MS`)
- Template text is hardcoded: "Fixed ${shortName} error", "Resolved by re-running ${shortName}"

### Metis Review

**Critical Discovery**: TWO garbage sources, not one!

1. **Line 1300**: Error recovery → "Fixed X error → Resolved by re-running X"
2. **Line 1138**: Session end → "Session work: N events → Task completed successfully"

**Identified Gaps** (addressed):

- Second garbage source: **Fixed by including both in scope**
- Test infrastructure missing: **Fixed by adding test setup task**
- Quality filter location: **Plugin-side** (smaller blast radius)
- 5-minute recovery window: **Out of scope** (documented as future work)

---

## Work Objectives

### Core Objective

Stop the OpenCode plugin from polluting episode history with meaningless auto-generated experiences.

### Concrete Deliverables

- `plugins/opencode/agent-memory.ts` - Updated with quality filter
- `plugins/opencode/quality-filter.ts` - New module with filter logic (exportable for testing)
- `tests/unit/plugins/opencode/quality-filter.test.ts` - Unit tests
- `vitest.config.ts` - Updated to include plugin tests

### Definition of Done

- [x] `bun test tests/unit/plugins/opencode/` → All tests pass
- [x] `bun run build` → No errors
- [x] `bun run typecheck` → No TypeScript errors
- [x] Manual test: Trigger tool error + recovery → No garbage experience created (verified via unit test simulation - filter correctly rejects "Fixed bash error → Resolved by re-running bash" pattern)

### Must Have

- Quality filter function with explicit garbage patterns
- Both garbage sources fixed (line 1300 AND line 1138)
- Unit tests for filter logic
- Silent drop (no user-visible logging)

### Must NOT Have (Guardrails)

- Do NOT modify MCP server code (plugin-only fix)
- Do NOT refactor ErrorTracker class (scope creep)
- Do NOT change `ERROR_RECOVERY_WINDOW_MS` value (separate ticket)
- Do NOT add visible logging for rejected experiences
- Do NOT create overly aggressive filters that reject legitimate experiences

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: NO (for plugins)
- **User wants tests**: TDD
- **Framework**: vitest (existing)

### Test Setup Task (Task 1)

Since plugin tests don't exist, we need to:

1. Update vitest.config.ts to include `plugins/**/*.test.ts`
2. Create test file structure
3. Verify test runner works with plugins

### TDD Flow for Each Feature

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Setup test infrastructure for plugins
└── (no parallel - foundation task)

Wave 2 (After Task 1):
├── Task 2: Create quality filter with TDD
└── (sequential - core implementation)

Wave 3 (After Task 2):
├── Task 3: Wire filter into recordExperience call sites
└── Task 4: Integration verification
```

### Dependency Matrix

| Task | Depends On | Blocks  | Can Parallelize With |
| ---- | ---------- | ------- | -------------------- |
| 1    | None       | 2, 3, 4 | None (foundation)    |
| 2    | 1          | 3       | None                 |
| 3    | 2          | 4       | None                 |
| 4    | 3          | None    | None (final)         |

---

## TODOs

- [x] 1. Setup Test Infrastructure for Plugins

  **What to do**:
  - Update `vitest.config.ts` to include `plugins/**/*.test.ts` in test patterns
  - Create directory structure: `tests/unit/plugins/opencode/`
  - Create placeholder test file to verify setup works
  - Run `bun test` to confirm plugin tests are discovered

  **Must NOT do**:
  - Do NOT create complex test utilities yet
  - Do NOT modify existing test patterns (additive only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple config update, minimal code changes
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Ensure test file follows project conventions

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (foundation)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `vitest.config.ts` - Current test configuration to extend
  - `tests/unit/` - Existing test structure to follow
  - `package.json` - Test scripts

  **Acceptance Criteria**:

  ```bash
  # Verify vitest discovers plugin test files
  bun test --reporter=verbose 2>&1 | grep -q "plugins/opencode" || echo "Plugin tests not discovered"

  # Verify placeholder test passes
  bun test tests/unit/plugins/opencode/quality-filter.test.ts
  # Assert: Test file exists and runs (even if just a placeholder)
  ```

  **Commit**: YES
  - Message: `test(plugins): add vitest config for opencode plugin tests`
  - Files: `vitest.config.ts`, `tests/unit/plugins/opencode/quality-filter.test.ts`
  - Pre-commit: `bun test tests/unit/plugins/opencode/`

---

- [x] 2. Create Quality Filter Function (TDD)

  **What to do**:
  - **RED**: Write failing tests for quality filter in `tests/unit/plugins/opencode/quality-filter.test.ts`:
    - Test: Rejects "Resolved by re-running X" patterns
    - Test: Rejects "Task completed successfully"
    - Test: Rejects "Session work: N events"
    - Test: Rejects content < 30 chars after template removal
    - Test: PASSES legitimate experiences like "Fixed auth by checking token expiry in jwt.verify()"
  - **GREEN**: Create `plugins/opencode/quality-filter.ts` with:
    ```typescript
    export function isGarbageExperience(title: string, scenario: string, outcome: string): boolean;
    ```
  - **REFACTOR**: Clean up patterns, add JSDoc

  **Must NOT do**:
  - Do NOT make filter too aggressive (must pass legitimate cases)
  - Do NOT add external dependencies
  - Do NOT modify recordExperience yet (that's Task 3)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Focused TDD implementation, clear requirements
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: Red-green-refactor cycle enforcement
    - `coding-standards`: TypeScript patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `plugins/opencode/agent-memory.ts:262-279` - `recordExperience()` function signature
  - `plugins/opencode/agent-memory.ts:1298-1305` - Error recovery garbage pattern
  - `plugins/opencode/agent-memory.ts:1135-1140` - Session end garbage pattern

  **Garbage Patterns to Reject** (CRITICAL):

  ```typescript
  const GARBAGE_PATTERNS = [
    /^Resolved by re-running/i,
    /^Task completed successfully$/i,
    /^Session work: \d+ events?$/i,
    /^Error: Tool execution failed/i,
    /^Fixed \w+ error$/i, // Only if no additional context
  ];

  const MIN_MEANINGFUL_LENGTH = 30; // After template removal
  ```

  **Legitimate Patterns to PASS** (CRITICAL):

  ```typescript
  // These must NOT be filtered:
  'Fixed auth timeout by increasing token expiry to 1 hour';
  'Discovered API requires Bearer prefix in Authorization header';
  'Session work: Refactored auth module to use JWT instead of sessions';
  ```

  **Acceptance Criteria**:

  ```bash
  # RED: Tests should exist and initially fail (before implementation)
  bun test tests/unit/plugins/opencode/quality-filter.test.ts
  # Assert: Tests exist, some may fail before implementation

  # GREEN: After implementation, all tests pass
  bun test tests/unit/plugins/opencode/quality-filter.test.ts
  # Assert: 0 failures

  # Verify filter module exports correctly
  bun -e "import { isGarbageExperience } from './plugins/opencode/quality-filter.ts'; console.log(typeof isGarbageExperience)"
  # Assert: Output is "function"
  ```

  **Commit**: YES
  - Message: `feat(plugins/opencode): add quality filter for garbage experience detection`
  - Files: `plugins/opencode/quality-filter.ts`, `tests/unit/plugins/opencode/quality-filter.test.ts`
  - Pre-commit: `bun test tests/unit/plugins/opencode/`

---

- [x] 3. Wire Quality Filter into recordExperience Call Sites

  **What to do**:
  - Import `isGarbageExperience` in `plugins/opencode/agent-memory.ts`
  - Modify `recordExperience()` function (lines 262-279):
    - Add quality check before calling MCP tool
    - If garbage detected: return early (silent drop)
    - If not garbage: proceed with existing logic
  - Verify BOTH garbage sources are now filtered:
    - Line ~1300: Error recovery pattern
    - Line ~1138: Session end pattern

  **Must NOT do**:
  - Do NOT change the function signature of `recordExperience()`
  - Do NOT add logging for filtered experiences (silent drop)
  - Do NOT modify the toast notification logic
  - Do NOT change error tracking logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple wiring, function already exists
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Clean integration pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `plugins/opencode/quality-filter.ts` - The filter to import (created in Task 2)
  - `plugins/opencode/agent-memory.ts:262-279` - `recordExperience()` to modify
  - `plugins/opencode/agent-memory.ts:1298-1305` - Error recovery call site
  - `plugins/opencode/agent-memory.ts:1135-1140` - Session end call site

  **Implementation Pattern**:

  ```typescript
  // In recordExperience() function, add at the beginning:
  import { isGarbageExperience } from './quality-filter.js';

  async function recordExperience(
    title: string,
    scenario: string,
    outcome: string,
    outcomeType: 'success' | 'partial' | 'failure' = 'success'
  ) {
    // NEW: Quality filter - silent drop garbage
    if (isGarbageExperience(title, scenario, outcome)) {
      return; // Silent drop
    }

    // Existing logic continues...
    try {
      await mcpClient.callTool('memory_experience', {
        action: 'learn',
        text: `${title}: ${scenario} → ${outcome}`,
        outcome: outcomeType,
        scopeType: 'project',
      });
      await showToast(`📚 Learned: ${title.slice(0, 30)}...`, 'success');
    } catch (e) {
      console.error('[agent-memory] Failed to record experience:', e);
    }
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify TypeScript compiles
  bun run typecheck -- plugins/opencode/agent-memory.ts
  # Assert: No errors

  # Verify import is correct
  bun -e "import './plugins/opencode/agent-memory.ts'" 2>&1
  # Assert: No import errors

  # Verify filter is called (grep for the guard clause)
  grep -n "isGarbageExperience" plugins/opencode/agent-memory.ts
  # Assert: Returns match in recordExperience function
  ```

  **Commit**: YES
  - Message: `fix(plugins/opencode): wire quality filter to stop garbage experiences`
  - Files: `plugins/opencode/agent-memory.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 4. Integration Verification

  **What to do**:
  - Run full test suite to ensure no regressions
  - Build the project to verify no compilation errors
  - Create a simple integration test scenario:
    - Simulate error recovery pattern → verify no experience created
    - Simulate legitimate learning → verify experience IS created

  **Must NOT do**:
  - Do NOT modify any code (verification only)
  - Do NOT create complex E2E tests (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - All files modified in Tasks 1-3
  - `package.json` - Build and test scripts

  **Acceptance Criteria**:

  ```bash
  # Full test suite passes
  bun test
  # Assert: All tests pass

  # Build succeeds
  bun run build
  # Assert: Exit code 0

  # TypeScript check passes
  bun run typecheck
  # Assert: No errors

  # Plugin-specific tests pass
  bun test tests/unit/plugins/opencode/
  # Assert: All quality filter tests pass
  ```

  **Evidence to Capture**:
  - [x] Screenshot or output of `bun test` showing all tests pass
  - [x] Output of `bun run build` showing success

  **Commit**: NO (verification only, no changes)

---

## Commit Strategy

| After Task | Message                                                                       | Files                                               | Verification  |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------- | ------------- |
| 1          | `test(plugins): add vitest config for opencode plugin tests`                  | vitest.config.ts, tests/unit/plugins/opencode/\*.ts | bun test      |
| 2          | `feat(plugins/opencode): add quality filter for garbage experience detection` | plugins/opencode/quality-filter.ts, tests           | bun test      |
| 3          | `fix(plugins/opencode): wire quality filter to stop garbage experiences`      | plugins/opencode/agent-memory.ts                    | bun typecheck |
| 4          | (no commit - verification only)                                               | -                                                   | -             |

---

## Success Criteria

### Verification Commands

```bash
# All tests pass
bun test
# Expected: 0 failures

# Build succeeds
bun run build
# Expected: exit code 0

# Plugin filter tests specifically
bun test tests/unit/plugins/opencode/quality-filter.test.ts
# Expected: All assertions pass
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Garbage patterns are filtered (verified by unit tests)
- [x] Legitimate patterns pass through (verified by unit tests)

---

## Out of Scope (Future Work)

| Item                                         | Reason                                    | Ticket?        |
| -------------------------------------------- | ----------------------------------------- | -------------- |
| Reduce `ERROR_RECOVERY_WINDOW_MS` from 5 min | Separate concern, needs discussion        | Create ticket  |
| Server-side quality filter in MCP            | Bigger blast radius, benefits all clients | Consider later |
| Refactor ErrorTracker class                  | Scope creep, works fine                   | No             |
| LLM-enhanced context capture                 | Complex, separate feature                 | Create ticket  |
