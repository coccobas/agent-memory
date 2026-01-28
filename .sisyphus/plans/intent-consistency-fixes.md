# Intent vs. Tool Consistency Fixes

## Context

### Original Request

Fix all 8 intent vs. tool inconsistencies identified in the agent-memory codebase, starting with the "learn experience:" prefix bug that exposed architectural issues in how the system handles natural language vs. structured tool interfaces.

### Interview Summary

**Key Discussions**:

- Original bug: `"learn experience: Fixed todowrite error..."` mixed structured syntax (memory_experience `learn` action) with natural language interface (memory tool)
- Root cause analysis revealed 3 separate intent systems running independently
- User confirmed: TDD approach, breaking changes OK (semver major), full merge strategy for intent systems

**Research Findings**:

- **Intent Detection** (`src/services/intent-detection/patterns.ts`): 14 intent types for action routing
- **Query Intent** (`src/services/query-rewrite/classifier.ts`): 6 intent types for search optimization
- **Policy Enum**: Hardcoded in 6+ locations (rl.handler.ts, cli/commands/rl.ts, export formats)
- **Test Coverage**: 9,716 tests passing, but gaps for mixed-intent and "learn experience:" patterns
- **Pre-existing LSP errors**: tests/unit/librarian-handler.test.ts, tests/unit/dispatcher.test.ts (out of scope)

### Metis Review

**Identified Gaps** (addressed):

- Need to validate merge strategy for intent systems → User confirmed full merge
- Missing edge cases (negation, empty content, case sensitivity) → Added to acceptance criteria
- Dependency ordering concerns → Reordered tasks with TDD tests first
- Critical path risk on Task 5 → Added ADR requirement before implementation
- Need to preserve QueryIntent's memory type prioritization → Added as guardrail

---

## Work Objectives

### Core Objective

Fix intent detection inconsistencies by: (1) fixing `learn_experience` confidence threshold (pattern already exists), (2) centralizing duplicated enums, (3) unifying intent systems, and (4) documenting the architecture.

**CRITICAL DISCOVERY**: The `learn_experience` pattern ALREADY EXISTS in the codebase:

- Intent type at `patterns.ts:27`
- Pattern at `patterns.ts:89`: `/^(?!(?:don'?t|do\s+not|never)\s+)learn\s+experience:\s*/i`
- Dispatcher case at `dispatcher.ts:139-140`
- Tests at `tests/unit/intent-detection-learn-experience.test.ts` (20 pass, 4 fail)

The failing tests indicate:

- Confidence threshold expects `>= 0.8` but gets `0.75`
- Missing `src/services/rl/policy-types.ts` file (Task 2 creates this)

### Concrete Deliverables

- `src/services/intent-detection/patterns.ts` - Fix `learn_experience` confidence to `>= 0.8`
- `src/services/rl/policy-types.ts` - Centralized PolicyType enum (NEW FILE - tests expect this)
- `src/services/intent-detection/unified-intents.ts` - Merged Intent+QueryIntent taxonomy (NEW FILE)
- `docs/reference/intent-detection.md` - Intent detection matrix documentation (NEW FILE)
- `tests/unit/intent-detection-*.test.ts` - New and updated tests
- `tests/integration/intent-flow.test.ts` - Cross-system integration tests (NEW FILE)

### Definition of Done

- [ ] `bun test` passes (all 9,716+ tests)
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] Existing "learn experience:" pattern returns confidence `>= 0.8`
- [ ] PolicyType imported from single source in all 6+ locations
- [ ] Intent and QueryIntent merged into unified taxonomy
- [ ] Documentation complete with intent→action matrix

### Must Have

- All existing intent patterns continue to work unchanged
- TDD approach: tests written before implementation
- Full test suite passes after each task
- Breaking changes documented in CHANGELOG

### Must NOT Have (Guardrails)

- Do NOT modify QueryIntent's `getMemoryTypesForIntent()` priority logic during merge
- Do NOT add LLM-based intent detection (out of scope)
- Do NOT add more than 1 new intent type (`learn_experience`)
- Do NOT change dispatcher routing logic in same PR as intent type changes
- Do NOT modify handlers/\*.ts files during action routing standardization
- Do NOT exceed 5 integration test files
- Do NOT create external documentation site (single markdown file only)
- Do NOT fix pre-existing LSP errors (out of scope)

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test, vitest)
- **User wants tests**: TDD
- **Framework**: bun test / vitest

### TDD Workflow for Each Task

Each task follows RED-GREEN-REFACTOR:

**Task Structure:**

1. **RED**: Write failing test first
   - Test file: `tests/unit/[feature].test.ts`
   - Test command: `bun test [file]`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test [file]`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `bun test`
   - Expected: PASS (all tests)

---

## Task Flow

```
     Task 0 (TDD Tests - RED)
              │
              ▼
    ┌─────────┴─────────┐
    ▼                   ▼
Task 1              Task 2
(fix confidence)    (policy enum)
    │                   │
    └─────────┬─────────┘
              ▼
          Task 3
     (design decision)
              │
              ▼
          Task 4
     (unify intents)
              │
              ▼
          Task 5
     (action routing)
              │
              ▼
          Task 6
     (thresholds)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
Task 7              Task 8
(docs)              (integration)
```

## Parallelization

| Group | Tasks | Reason                                   |
| ----- | ----- | ---------------------------------------- |
| A     | 1, 2  | Independent: different files, no overlap |
| B     | 7, 8  | Independent: docs vs. tests              |

| Task | Depends On | Reason                                                |
| ---- | ---------- | ----------------------------------------------------- |
| 0    | None       | TDD tests come first                                  |
| 1    | 0          | Tests must exist before implementation                |
| 2    | 0          | Tests must exist before implementation                |
| 3    | 1, 2       | Need stable foundation for design decision            |
| 4    | 3          | Must decide merge strategy first                      |
| 5    | 4          | Need unified intents before routing changes           |
| 6    | 4          | Need unified intents before threshold standardization |
| 7    | 4, 5, 6    | Document final state                                  |
| 8    | 4, 5, 6    | Test final architecture                               |

---

## TODOs

- [x] 0. Write TDD Tests (RED phase) — **ALREADY COMPLETE**

  **Status**: Tests exist at `tests/unit/intent-detection-learn-experience.test.ts`
  - 20 tests PASS
  - 4 tests FAIL (confidence threshold and missing policy-types.ts)

  **Failing tests to fix in subsequent tasks**:
  1. Confidence threshold: expects `>= 0.8`, gets `0.75`
  2. PolicyType import: expects `src/services/rl/policy-types.ts` to exist

  **Parallelizable**: NO (already done)

  **References**:
  - `tests/unit/intent-detection-learn-experience.test.ts` - Existing test file (20 pass, 4 fail)
  - `src/services/intent-detection/patterns.ts:89` - Pattern exists with 0.75 confidence
  - `src/services/intent-detection/patterns.ts:27` - Intent type exists

  **Acceptance Criteria**:
  - [x] Test file exists: `tests/unit/intent-detection-learn-experience.test.ts`
  - [x] Tests cover: `detectIntent("learn experience: Fixed X")` → `intent: 'learn_experience'`
  - [x] Tests cover: empty content after colon → error
  - [x] Tests cover: case insensitivity (`LEARN EXPERIENCE:` works)
  - [x] Tests cover: extra whitespace normalization
  - [x] Tests cover: negation (`"don't learn experience:"` → different behavior)
  - [ ] 4 failing tests will pass after Tasks 1 and 2

  **Commit**: NO (already committed)

---

- [ ] 1. Fix `learn_experience` Confidence Threshold

  **What to do**:
  The `learn_experience` pattern ALREADY EXISTS but returns confidence `0.75`. Tests expect `>= 0.8`.
  - Locate the confidence assignment for `learn_experience` in `patterns.ts`
  - The pattern uses descriptor-based confidence from `INTENT_PATTERNS.learn_experience`:
    ```typescript
    // Current (patterns.ts around line 89):
    learn_experience: {
      patterns: [/^(?!(?:don'?t|do\s+not|never)\s+)learn\s+experience:\s*/i],
      confidence: 0.75,  // ← Change to 0.85
      ...
    }
    ```
  - Increase confidence to `0.85` (or `0.8`) to pass tests
  - Run tests to verify

  **Must NOT do**:
  - Do NOT add a new pattern (it exists!)
  - Do NOT modify the regex
  - Do NOT change dispatcher routing (already works)

  **Parallelizable**: YES (with Task 2)

  **References**:
  - `src/services/intent-detection/patterns.ts:89` - Pattern definition with `confidence: 0.75`
  - `src/services/intent-detection/patterns.ts:27` - Intent type `'learn_experience'` (exists)
  - `src/services/intent-detection/patterns.ts:551-558` - Parameter extraction (exists)
  - `src/services/unified-memory/dispatcher.ts:139-140` - Dispatcher case (exists)
  - `tests/unit/intent-detection-learn-experience.test.ts` - Tests expecting `>= 0.8`

  **Acceptance Criteria**:
  - [ ] `detectIntent("learn experience: Fixed X")` returns:
    ```typescript
    { intent: 'learn_experience', confidence: >= 0.8, extractedParams: { text: 'Fixed X' } }
    ```
  - [ ] Confidence threshold tests pass (currently 4 failing)
  - [ ] `bun test tests/unit/intent-detection-learn-experience.test.ts` → ALL 24 PASS
  - [ ] `bun test` → ALL PASS

  **Commit**: YES
  - Message: `fix(intent): increase learn_experience confidence to 0.85 for test compliance`
  - Files: `src/services/intent-detection/patterns.ts`
  - Pre-commit: `bun test tests/unit/intent-detection-learn-experience.test.ts`

---

- [x] 2. Centralize Policy Enum (REQUIRED - Tests Depend on This)

  **What to do**:
  The test file `tests/unit/intent-detection-learn-experience.test.ts` imports from
  `src/services/rl/policy-types.ts` which does NOT exist yet. This causes test failures.
  - Create `src/services/rl/policy-types.ts` with:
    - `POLICY_TYPES` const array: `['extraction', 'retrieval', 'consolidation'] as const`
    - `PolicyType` type alias
    - `isPolicyType()` type guard function
  - Update all 6+ locations to import from this file
  - Remove duplicate definitions

  **Must NOT do**:
  - Do NOT change policy semantics
  - Do NOT add new policy types
  - Do NOT modify policy behavior

  **Parallelizable**: YES (with Task 1)

  **References**:
  - `src/services/rl/training/export/types.ts:19` - Canonical definition location (to move from)
  - `src/services/rl/training/model-loader.ts` - Has duplicate, needs import
  - `src/mcp/handlers/rl.handler.ts` - 6 occurrences of string literals to replace
  - `src/mcp/handlers/feedback.handler.ts` - String literal occurrences
  - `src/cli/commands/rl.ts` - 6 occurrences of string literals
  - `tests/unit/intent-detection-learn-experience.test.ts` - IMPORTS FROM THIS FILE (will fail until created)

  **Acceptance Criteria**:
  - [ ] File created: `src/services/rl/policy-types.ts`
  - [ ] Exports: `POLICY_TYPES`, `PolicyType`, `isPolicyType()`
  - [ ] Test import resolves: `import { PolicyType } from '@/services/rl/policy-types'`
  - [ ] `lsp_find_references` for PolicyType shows single definition
  - [ ] `grep -r "policyType === 'extraction'" src/` returns 0 results (all replaced)
  - [ ] `bun test tests/unit/rl*.test.ts` → PASS
  - [ ] `bun test tests/unit/intent-detection-learn-experience.test.ts` → PASS (after Task 1 too)
  - [ ] `bun test` → ALL PASS

  **Commit**: YES
  - Message: `refactor(rl): centralize PolicyType enum to single source of truth`
  - Files: `src/services/rl/policy-types.ts` (new), 6+ updated files
  - Pre-commit: `bun test && bun run typecheck`

---

- [ ] 3. Design Decision: Intent Unification Strategy

  **What to do**:
  - Create ADR document at `docs/adr/ADR-001-intent-unification.md`
  - Document the three options: (A) full merge, (B) bridge layer, (C) separate with mapping
  - Analyze pros/cons of each
  - Confirm full merge (A) based on user decision
  - Document how QueryIntent's memory type prioritization will be preserved
  - Get team sign-off on design

  **Must NOT do**:
  - Do NOT implement yet - design only
  - Do NOT delete any existing code

  **Parallelizable**: NO (blocking for Tasks 4-8)

  **References**:
  - `src/services/intent-detection/patterns.ts:12-27` - Current Intent type (14 values)
  - `src/services/query-rewrite/types.ts` - QueryIntent type (6 values)
  - `src/services/query-rewrite/classifier.ts:189-218` - `getMemoryTypesForIntent()` to preserve

  **Acceptance Criteria**:
  - [ ] ADR file created: `docs/adr/ADR-001-intent-unification.md`
  - [ ] Documents: full merge strategy confirmed
  - [ ] Documents: how to preserve `getMemoryTypesForIntent()` behavior
  - [ ] Documents: deprecation plan for QueryIntent type
  - [ ] Documents: migration path for any external consumers
  - [ ] Sign-off: PR approval from user OR explicit "LGTM" on ADR review

  **Commit**: YES
  - Message: `docs(adr): add ADR-001 for intent system unification strategy`
  - Files: `docs/adr/ADR-001-intent-unification.md`
  - Pre-commit: none (documentation only)

  **Note on Sign-off**: "Team sign-off" = PR approval when ADR is committed, or user explicitly
  approving the design during review. No formal process required for solo projects.

---

- [ ] 4. Unify Intent Systems

  **What to do**:
  - Create `src/services/intent-detection/unified-intents.ts` with merged taxonomy
  - Merge Intent (14 types) + QueryIntent (6 types) into single type (~18-20 types after dedup)
  - Add mapping function `getSearchContextForIntent()` to preserve QueryIntent behavior
  - Update `patterns.ts` to use unified type
  - Update `classifier.ts` to use unified type
  - Mark old QueryIntent as deprecated

  **Must NOT do**:
  - Do NOT modify `getMemoryTypesForIntent()` priority logic
  - Do NOT change dispatcher switch statement yet
  - Do NOT remove deprecated types in this PR

  **Parallelizable**: NO (critical path)

  **References**:
  - `src/services/intent-detection/patterns.ts:12-27` - Intent type to extend
  - `src/services/query-rewrite/types.ts:1-20` - QueryIntent type to merge
  - `src/services/query-rewrite/classifier.ts:189-218` - Memory type priorities to preserve
  - `docs/adr/ADR-001-intent-unification.md` - Design decision to follow

  **Acceptance Criteria**:
  - [ ] File created: `src/services/intent-detection/unified-intents.ts`
  - [ ] Unified type includes all existing intents + `learn_experience`
  - [ ] `getSearchContextForIntent()` returns same priorities as old `getMemoryTypesForIntent()`
  - [ ] QueryIntent marked with `@deprecated` JSDoc
  - [ ] All existing intent detection tests pass
  - [ ] All query rewrite tests pass
  - [ ] `bun test` → ALL PASS

  **Commit**: YES
  - Message: `feat(intent): unify Intent and QueryIntent into single taxonomy`
  - Files: `src/services/intent-detection/unified-intents.ts` (new), `patterns.ts`, `classifier.ts`, `types.ts`
  - Pre-commit: `bun test && bun run typecheck`

---

- [ ] 5. Standardize Action Routing

  **What to do**:
  - Update dispatcher to use descriptor-based pattern for all cases
  - Ensure all switch cases follow consistent pattern
  - `learn_experience` case already exists at `dispatcher.ts:139-140` (no action needed)
  - Document handler interface

  **Descriptor-based pattern example** (what each case should look like):

  ```typescript
  // Current inconsistent patterns:
  case 'store':
    return handleStore(params);  // Direct call
  case 'retrieve':
    return this.handleRetrieve(params);  // Method call
  case 'learn_experience':
    return memoryExperienceDescriptor.handlers.learn(params);  // Descriptor-based ✓

  // Target: ALL cases use descriptor-based pattern:
  case 'store':
    return memoryDescriptor.handlers.store(params);
  case 'retrieve':
    return memoryDescriptor.handlers.retrieve(params);
  ```

  **Must NOT do**:
  - Do NOT modify individual handler implementations
  - Do NOT change handler signatures
  - Do NOT modify handlers/\*.ts files

  **Parallelizable**: NO (depends on Task 4)

  **References**:
  - `src/services/unified-memory/dispatcher.ts:109-147` - Switch statement to standardize
  - `src/services/unified-memory/dispatcher.ts:139-140` - `learn_experience` case (already descriptor-based)
  - `src/mcp/descriptors/types.ts` - Descriptor interface definition
  - `src/mcp/descriptors/memory_experience.ts` - Example of descriptor with handlers
  - `src/mcp/tool-runner.ts:580-620` - Tool execution flow

  **Acceptance Criteria**:
  - [ ] All dispatcher cases use descriptor-based pattern (import descriptor, call `.handlers.action()`)
  - [ ] Handler interface documented in JSDoc on dispatcher or descriptors
  - [ ] No behavioral changes to existing routing (same inputs → same outputs)
  - [ ] All dispatcher tests pass
  - [ ] `bun test tests/unit/dispatcher.test.ts` → PASS
  - [ ] `bun test` → ALL PASS

  **Commit**: YES
  - Message: `refactor(dispatcher): standardize action routing to descriptor-based pattern`
  - Files: `src/services/unified-memory/dispatcher.ts`
  - Pre-commit: `bun test`

---

- [ ] 6. Fix Confidence Threshold Inconsistencies

  **What to do**:
  - Audit all confidence threshold locations
  - Create config file: `src/services/intent-detection/config.ts`
  - Export config constant: `INTENT_CONFIDENCE_THRESHOLDS`
    ```typescript
    export const INTENT_CONFIDENCE_THRESHOLDS = {
      /** Below this = low confidence warning */
      low: 0.5,
      /** Default threshold for intent detection */
      default: 0.7,
      /** High confidence (used for learn_experience) */
      high: 0.85,
    } as const;
    ```
  - Update dispatcher to use config: `if (confidence < INTENT_CONFIDENCE_THRESHOLDS.low)`
  - Update classification service to use same thresholds
  - Document threshold meanings in JSDoc

  **Must NOT do**:
  - Do NOT change threshold values significantly (could break existing behavior)
  - Do NOT add dynamic/runtime thresholds

  **Parallelizable**: NO (depends on Task 4)

  **References**:
  - `src/services/unified-memory/dispatcher.ts:99` - `confidence < 0.5` threshold (hardcoded)
  - `src/services/intent-detection/index.ts:66` - `confidenceThreshold: 0.7` (hardcoded)
  - `src/services/intent-detection/patterns.ts:89` - Per-intent confidence values
  - `src/services/classification/index.ts` - Classification thresholds

  **Acceptance Criteria**:
  - [ ] Config file created: `src/services/intent-detection/config.ts`
  - [ ] Exports: `INTENT_CONFIDENCE_THRESHOLDS` with `low`, `default`, `high` values
  - [ ] All hardcoded thresholds replaced with config imports
  - [ ] `grep -rn "< 0.5" src/services/` returns ONLY config reference or 0 results
  - [ ] `grep -rn "0.7" src/services/intent-detection/` returns ONLY config reference
  - [ ] Threshold meanings documented in JSDoc
  - [ ] `bun test` → ALL PASS

  **Commit**: YES
  - Message: `refactor(intent): centralize confidence thresholds to config.ts`
  - Files: `src/services/intent-detection/config.ts` (new), dispatcher.ts, index.ts
  - Pre-commit: `bun test`

---

- [ ] 7. Create Intent Detection Documentation

  **What to do**:
  - Create `docs/reference/intent-detection.md`
  - Include: Intent→Action routing matrix
  - Include: Confidence scoring explanation
  - Include: Pattern examples for each intent
  - Include: Troubleshooting guide
  - Include: Migration notes for breaking changes

  **Must NOT do**:
  - Do NOT create external documentation site
  - Do NOT add inline JSDoc beyond what exists
  - Do NOT exceed single markdown file

  **Parallelizable**: YES (with Task 8)

  **References**:
  - `src/services/intent-detection/patterns.ts` - All patterns to document
  - `src/services/intent-detection/unified-intents.ts` - Unified taxonomy
  - `src/services/unified-memory/dispatcher.ts` - Routing logic
  - `docs/adr/ADR-001-intent-unification.md` - Design rationale

  **Acceptance Criteria**:
  - [ ] File created: `docs/reference/intent-detection.md`
  - [ ] Matrix shows all 18-20 intents and their actions
  - [ ] Confidence scoring explained with examples
  - [ ] Each intent has at least 2 example inputs
  - [ ] Troubleshooting section covers common misclassifications
  - [ ] CHANGELOG.md updated with breaking changes

  **Commit**: YES
  - Message: `docs(intent): add comprehensive intent detection reference`
  - Files: `docs/reference/intent-detection.md`, `CHANGELOG.md`
  - Pre-commit: none (documentation only)

---

- [ ] 8. Add Integration Tests

  **What to do**:
  - Create `tests/integration/intent-flow.test.ts`
  - Test full flow: natural language → intent detection → dispatcher → handler
  - Test each major intent type
  - Test confidence threshold boundaries
  - Test error cases

  **Must NOT do**:
  - Do NOT exceed 5 test files
  - Do NOT test individual handler implementations (unit test scope)
  - Do NOT test MCP protocol (different layer)

  **Parallelizable**: YES (with Task 7)

  **References**:
  - `tests/integration/` - Existing integration test patterns
  - `tests/e2e/ux-flows.test.ts` - End-to-end test examples
  - `src/services/unified-memory/index.ts` - UnifiedMemoryService to test

  **Acceptance Criteria**:
  - [ ] File created: `tests/integration/intent-flow.test.ts`
  - [ ] Tests: store intent → handleStore
  - [ ] Tests: retrieve intent → handleRetrieve
  - [ ] Tests: learn_experience intent → memory_experience.learn
  - [ ] Tests: session intents → session handlers
  - [ ] Tests: confidence = 0.5 (boundary) → not low_confidence
  - [ ] Tests: confidence = 0.49 → low_confidence status
  - [ ] `bun test tests/integration/intent-flow.test.ts` → PASS
  - [ ] `bun test` → ALL PASS (9,716+ tests)

  **Commit**: YES
  - Message: `test(integration): add intent flow integration tests`
  - Files: `tests/integration/intent-flow.test.ts`
  - Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message                                                                | Files                                                | Verification                                                    |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 0          | (already committed)                                                    | tests/unit/intent-detection-learn-experience.test.ts | N/A                                                             |
| 1          | `fix(intent): increase learn_experience confidence to 0.85`            | patterns.ts                                          | `bun test tests/unit/intent-detection-learn-experience.test.ts` |
| 2          | `refactor(rl): centralize PolicyType enum to single source of truth`   | policy-types.ts (new), 6+ files                      | `bun test && bun run typecheck`                                 |
| 3          | `docs(adr): add ADR-001 for intent system unification strategy`        | docs/adr/ADR-001-intent-unification.md               | none                                                            |
| 4          | `feat(intent): unify Intent and QueryIntent into single taxonomy`      | unified-intents.ts (new), patterns.ts, classifier.ts | `bun test && bun run typecheck`                                 |
| 5          | `refactor(dispatcher): standardize action routing to descriptor-based` | dispatcher.ts                                        | `bun test`                                                      |
| 6          | `refactor(intent): centralize confidence thresholds to config.ts`      | config.ts (new), dispatcher.ts, index.ts             | `bun test`                                                      |
| 7          | `docs(intent): add comprehensive intent detection reference`           | docs/reference/intent-detection.md, CHANGELOG.md     | none                                                            |
| 8          | `test(integration): add intent flow integration tests`                 | tests/integration/intent-flow.test.ts                | `bun test`                                                      |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
bun test                    # Expected: 9,716+ tests pass

# Type checking
bun run typecheck           # Expected: no errors

# Linting
bun run lint                # Expected: no errors

# Specific intent tests
bun test intent             # Expected: all intent tests pass

# Integration tests
bun test tests/integration  # Expected: all integration tests pass
```

### Final Checklist

- [ ] "learn experience:" pattern works correctly
- [ ] PolicyType has single source of truth
- [ ] Intent and QueryIntent unified
- [ ] All action routing uses consistent pattern
- [ ] Confidence thresholds standardized
- [ ] Documentation complete
- [ ] Integration tests pass
- [ ] All 9,716+ existing tests pass
- [ ] CHANGELOG updated with breaking changes
- [ ] Version bumped for semver major
