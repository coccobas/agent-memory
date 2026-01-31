# Episode Quality Improvement Plan

## Context

### Original Request

Fix 5 interconnected episode quality issues:

1. Events are generic (tool names, not semantic content)
2. Messages not being relevance-scored
3. Episode names stay generic after completion
4. Extracted experiences are shallow
5. Episodes are session-scoped, missing project context

### Root Cause Analysis

All 5 issues stem from **insufficient content capture at event time**. The auto-logger captures `{tool, action}` pairs, not semantic meaning. Downstream systems (experiences, names, patterns) inherit this low-quality foundation.

### Architecture Decision

**Unified "semantic content" approach**: Add `semanticSummary` extraction at tool execution time. This single change propagates quality improvements to events, experiences, and name enrichment.

---

## Work Objectives

### Core Objective

Improve episode quality by capturing semantic content at event time and strengthening non-LLM fallbacks throughout the pipeline.

### Concrete Deliverables

1. Episodes scoped to project (not just session)
2. Events with semantic descriptions (not just tool+action)
3. Template-based name enrichment fallback
4. Improved experience fallback with trajectory-based scenario
5. Heuristic message scoring when LLM unavailable
6. Quality score metric for episodes

### Definition of Done

- [x] `bun test` passes with no regressions
- [x] New episodes created with `scopeType: 'project'` when projectId available
- [x] Events show semantic descriptions like "Learned: auth tokens expire in 1hr"
- [x] Episode names improved even without LLM
- [x] Experience scenarios derived from trajectory, not hardcoded
- [x] Quality score calculated and stored on episode completion

---

## Technical Specifications

### Semantic Content Interface

```typescript
// Add to src/services/episode-auto-logger.ts
interface ToolExecutionEvent {
  toolName: string;
  action?: string;
  success: boolean;
  // NEW: Semantic content from tool output
  semanticSummary?: string; // e.g., "Learned that auth tokens expire after 1 hour"
  context?: {
    entryType?: string;
    entryId?: string;
    entryName?: string;
    // NEW: Output excerpt for trajectory
    outputExcerpt?: string;
  };
}
```

### Quality Score Calculation

```typescript
qualityScore =
  (events.length > 0 ? 0.25 : 0) +
  (hasSemanticEvents ? 0.25 : 0) +
  (name !== originalGenericName ? 0.15 : 0) +
  (messagesLinked > 0 ? 0.15 : 0) +
  (messagesScored > 0 ? 0.1 : 0) +
  (hasLinkedExperiences ? 0.1 : 0);
```

---

## Task Flow

```
Task 0 (Scope Fix) → Task 1 (Semantic Content) → Task 2 (Event Descriptions)
                                                        ↓
                            Task 3 (Experience Fallback) ← Task 4 (Name Template)
                                        ↓
                            Task 5 (Heuristic Scoring)
                                        ↓
                            Task 6 (Quality Score)
                                        ↓
                            Task 7 (Integration Test)
```

---

## TODOs

- [x] 0. Fix episode scope to use project when available (85f64d8f)

  **What to do**:
  - Update `src/services/episode-auto-logger.ts:308-312` to set `scopeType: 'project'` when `event.projectId` exists
  - Update `src/mcp/handlers/quickstart.handler.ts:425-428` same pattern
  - Set `scopeId: projectId ?? sessionId`

  **Must NOT do**:
  - Change existing episode scope (only affects new episodes)
  - Break session-only workflows

  **References**:
  - `src/services/episode-auto-logger.ts:308-320` - Episode creation
  - `src/mcp/handlers/quickstart.handler.ts:420-430` - Auto-episode creation

  **Acceptance Criteria**:
  - [ ] New episodes have `scopeType: 'project'` when projectId available
  - [ ] New episodes have `projectId` populated
  - [ ] `bun test` passes

  **Commit**: YES
  - Message: `fix(episode): scope episodes to project when projectId available`

---

- [x] 1. Add semanticSummary to ToolExecutionEvent interface (c3bb1c07)

  **What to do**:
  - Add `semanticSummary?: string` to `ToolExecutionEvent` interface
  - Add `outputExcerpt?: string` to context
  - Update type exports

  **Must NOT do**:
  - Change existing event processing logic yet (that's task 2)

  **References**:
  - `src/services/episode-auto-logger.ts:20-50` - Interface definitions

  **Acceptance Criteria**:
  - [ ] Interface updated with new optional fields
  - [ ] TypeScript compiles without errors

  **Commit**: NO (groups with task 2)

---

- [x] 2. Update episode-auto-logger to use semanticSummary (c3bb1c07)

  **What to do**:
  - Update event description generation (line 358-359):
    ```typescript
    description: event.semanticSummary ??
      (event.context?.entryName
        ? `${event.action}: ${event.context.entryName}`
        : `Tool ${event.toolName} with action ${event.action}`);
    ```
  - Update event name to use semantic summary excerpt

  **Must NOT do**:
  - Break existing event logging
  - Require semanticSummary (must be optional)

  **References**:
  - `src/services/episode-auto-logger.ts:355-365` - Event name/description generation

  **Acceptance Criteria**:
  - [ ] Events with semanticSummary use it in description
  - [ ] Events without semanticSummary fall back to current behavior
  - [ ] Test: create event with semanticSummary → verify description

  **Commit**: YES
  - Message: `feat(episode): add semantic summary support to episode events`

---

- [x] 3. Update tool-runner to extract semantic summaries (a06fdfdc)

  **What to do**:
  - Identify where tool execution results are captured
  - For key tools (memory_experience, memory_guideline, memory_knowledge, Edit, Write), extract 1-liner semantic summary:
    - `memory_experience.learn`: `"Learned: ${parsed.title}"`
    - `memory_guideline.add`: `"Added guideline: ${name}"`
    - `Edit`: `"Edited ${filePath}"`
  - Pass to episode-auto-logger

  **Must NOT do**:
  - Require all tools to provide summaries (opt-in)
  - Change tool handler return types

  **References**:
  - `src/services/episode-auto-logger.ts:logToolExecution()` - Entry point
  - Tool handlers in `src/mcp/handlers/`

  **Acceptance Criteria**:
  - [ ] memory_experience.learn events show "Learned: {title}"
  - [ ] memory_guideline.add events show "Added guideline: {name}"
  - [ ] Edit events show "Edited {filepath}"

  **Commit**: YES
  - Message: `feat(episode): extract semantic summaries from key tool outputs`

---

- [x] 4. Improve experience fallback with trajectory-based scenario (72d22028)

  **What to do**:
  - Add `buildScenarioFromTrajectory()` helper to CaptureService
  - Add `buildOutcomeString()` helper
  - Update recordCase fallback (line 1073-1081) to use these

  **Must NOT do**:
  - Change LLM extraction path (only fallback)
  - Break existing recordCase API

  **References**:
  - `src/services/capture/index.ts:1064-1127` - onEpisodeComplete fallback

  **Acceptance Criteria**:
  - [ ] Fallback scenario includes first trajectory steps
  - [ ] Fallback outcome includes outcomeType prefix
  - [ ] Test: complete episode without LLM → verify improved scenario

  **Commit**: YES
  - Message: `feat(capture): improve episode experience fallback with trajectory-based scenario`

---

- [x] 5. Add template-based name enrichment fallback (fb2cace8)

  **What to do**:
  - Add `templateEnrich()` method to EpisodeNameEnrichmentService
  - Call as fallback when LLM enrichment fails/disabled
  - Templates:
    - If outcome starts with verb: use outcome
    - Otherwise: prefix with outcomeType

  **Must NOT do**:
  - Change LLM enrichment path
  - Make template enrichment the default

  **References**:
  - `src/services/episode-name-enrichment.service.ts:150-206` - enrichName method

  **Acceptance Criteria**:
  - [ ] Names improved when LLM unavailable
  - [ ] "Fix auth bug" + outcome "Fixed token expiry" → "Fixed token expiry"
  - [ ] Test: enrich without LLM → verify template applied

  **Commit**: YES
  - Message: `feat(episode): add template-based name enrichment fallback`

---

- [x] 6. Add heuristic message relevance scoring (abe62652)

  **What to do**:
  - Add `heuristicScore()` function to message-relevance-scoring.ts
  - Score based on: length, code blocks, decision words, role
  - Use when extractionService unavailable
  - Mark with `source: 'heuristic'` to distinguish from LLM

  **Must NOT do**:
  - Replace LLM scoring when available
  - Store heuristic scores without marking source

  **References**:
  - `src/services/librarian/maintenance/message-relevance-scoring.ts` - Scoring logic

  **Acceptance Criteria**:
  - [ ] Messages scored even without LLM
  - [ ] Heuristic scores marked as such
  - [ ] Long messages with code blocks score higher

  **Commit**: YES
  - Message: `feat(episode): add heuristic message relevance scoring fallback`

---

- [x] 7. Add quality score to episodes (ffec7650)

  **What to do**:
  - Add `qualityScore` and `qualityFactors` columns to episodes table
  - Calculate on episode.complete()
  - Factors: events, semanticEvents, nameEnriched, messagesLinked, messagesScored, experiences

  **Must NOT do**:
  - Block completion on quality calculation
  - Require quality score for existing episodes

  **References**:
  - `src/db/schema/episodes.ts` - Schema
  - `src/services/episode/index.ts:279-343` - complete() method

  **Acceptance Criteria**:
  - [ ] Migration adds columns
  - [ ] Quality score calculated on completion
  - [ ] Score visible in what_happened output

  **Commit**: YES
  - Message: `feat(episode): add quality score metric to track episode completeness`

---

- [x] 8. Integration test: verify quality improvements (3b5db179)

  **What to do**:
  - Create integration test that:
    1. Creates episode with projectId
    2. Logs events with semantic summaries
    3. Completes episode
    4. Verifies: scope, event descriptions, name, experience scenario, quality score

  **Must NOT do**:
  - Test with real LLM (use mocks)

  **References**:
  - `tests/integration/` - Existing patterns

  **Acceptance Criteria**:
  - [ ] Test verifies all 5 quality improvements
  - [ ] Test passes with mocked LLM
  - [ ] `bun test` passes

  **Commit**: YES
  - Message: `test(episode): add integration test for episode quality improvements`

---

## Commit Strategy

| After Task | Message                                                                             | Files                                 |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| 0          | `fix(episode): scope episodes to project when projectId available`                  | auto-logger.ts, quickstart.handler.ts |
| 2          | `feat(episode): add semantic summary support to episode events`                     | auto-logger.ts                        |
| 3          | `feat(episode): extract semantic summaries from key tool outputs`                   | tool handlers                         |
| 4          | `feat(capture): improve episode experience fallback with trajectory-based scenario` | capture/index.ts                      |
| 5          | `feat(episode): add template-based name enrichment fallback`                        | episode-name-enrichment.service.ts    |
| 6          | `feat(episode): add heuristic message relevance scoring fallback`                   | message-relevance-scoring.ts          |
| 7          | `feat(episode): add quality score metric to track episode completeness`             | schema, episode service               |
| 8          | `test(episode): add integration test for episode quality improvements`              | integration test                      |

---

## Success Criteria

### Verification Commands

```bash
bun test                    # All tests pass
bun test --coverage         # Coverage maintained
```

### Final Checklist

- [x] New episodes scoped to project when projectId available
- [x] Events show semantic descriptions
- [x] Names improved even without LLM
- [x] Experience scenarios derived from trajectory
- [x] Messages scored with heuristics when LLM unavailable
- [x] Quality score visible on completed episodes
- [x] No regressions in existing tests

---

## Estimated Effort

| Task                         | Effort      |
| ---------------------------- | ----------- |
| Task 0 (Scope)               | 1 hour      |
| Tasks 1-3 (Semantic Content) | 4 hours     |
| Task 4 (Experience Fallback) | 2 hours     |
| Task 5 (Name Template)       | 2 hours     |
| Task 6 (Heuristic Scoring)   | 3 hours     |
| Task 7 (Quality Score)       | 3 hours     |
| Task 8 (Integration Test)    | 2 hours     |
| Buffer                       | 2 hours     |
| **Total**                    | **~2 days** |
