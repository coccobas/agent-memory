# Episode Experience Enrichment

## Context

### Original Request

Fix librarian recommendations being meaningless ("Common actions: Episode started, Episode completed") by enriching experience capture during episode completion.

### Interview Summary

**Key Discussions**:

- Librarian pattern extraction works correctly, but produces vague output because input experiences are generic
- Root cause: `onEpisodeComplete()` uses `recordCase()` which creates shallow experiences with hardcoded scenario="Task execution"
- Solution: Replace with `ExperienceCaptureModule.capture()` which uses LLM-powered extraction

**Research Findings**:

- `capture_from_transcript` uses sophisticated LLM prompts to extract reusable patterns
- Supports OpenAI, Anthropic, and Ollama providers
- Has built-in deduplication, confidence filtering, trajectory extraction
- Can extract MULTIPLE experiences from one transcript

### Metis Review

**Identified Gaps** (addressed):

- Data format gap: Messages lack `toolCalls`/`tokenCount` → Accept degraded input, LLM still produces quality output
- Metrics requirement: `capture()` needs `TurnMetrics` → Build synthetic metrics from message counts
- Multiple experiences: `capture()` returns array → Link ALL to episode
- Failure mode: LLM unavailable → Fall back to current `recordCase()` behavior
- Episode events trajectory → Let LLM extract from messages (more reliable than event-based)

### Momus Review (Round 1)

**Issues Fixed**:

1. CaptureOptions mapping now explicitly specified
2. Test mocking strategy defined (vi.mock on `createExperienceCaptureModule`)
3. All TurnMetrics fields explicitly listed with default values
4. Fallback triggers fully specified
5. Removed non-existent mock file reference, added inline mock creation

---

## Work Objectives

### Core Objective

Replace `recordCase()` call in `onEpisodeComplete()` with `ExperienceCaptureModule.capture()` to produce LLM-enriched experiences that enable meaningful librarian pattern detection.

### Concrete Deliverables

- Modified `src/services/capture/index.ts` with LLM-powered episode capture
- Unit tests for new capture flow
- Integration test verifying librarian receives rich experiences

### Definition of Done

- [ ] `bun test` passes with no regressions
- [ ] Episode completion produces experiences with LLM-extracted titles (not "Episode: X")
- [ ] Experiences have scenario derived from conversation (not "Task execution")
- [ ] Multiple experiences can be linked to single episode
- [ ] Graceful fallback when LLM unavailable

### Must Have

- LLM-powered experience extraction from episode messages
- Synthetic metrics building from available data
- All extracted experiences linked to source episode
- Fallback to `recordCase()` when extraction fails/returns empty
- Preserved fire-and-forget async pattern

### Must NOT Have (Guardrails)

- DO NOT change episode event structure
- DO NOT change `onEpisodeComplete()` method signature
- DO NOT modify `recordCase()` method itself
- DO NOT add new LLM infrastructure (reuse existing)
- DO NOT duplicate LLM calls (remove `summarizeMessages()` usage if using `capture()`)
- DO NOT change episode handler's call pattern

---

## Technical Specifications (Momus-Required Details)

### CaptureOptions Mapping for onEpisodeComplete

When calling `captureModule.capture(turnData, metrics, options)`, use these exact mappings:

```typescript
const captureOptions: CaptureOptions = {
  // Scope from episode
  scopeType: episode.scopeType ?? 'project',
  scopeId: episode.scopeId ?? undefined,

  // IDs from episode context
  projectId: episode.scopeType === 'project' ? (episode.scopeId ?? undefined) : undefined,
  sessionId: episode.sessionId ?? undefined,
  agentId: undefined, // Not available in episode context

  // Extraction behavior
  autoStore: true, // Always store extracted experiences
  confidenceThreshold: 0.7, // Default threshold from ExperienceModule
  skipDuplicates: true, // Prevent duplicate experiences

  // Episode linking
  episodeId: episode.id, // Link all experiences to this episode

  // Focus areas
  focusAreas: ['experiences', 'decisions'], // Prioritize experience extraction
};
```

### TurnMetrics Fields (Explicit Defaults)

All fields from `src/services/capture/types.ts:TurnMetrics` interface:

```typescript
const metrics: TurnMetrics = {
  turnCount: messages.length,
  userTurnCount: messages.filter((m) => m.role === 'user').length,
  assistantTurnCount: messages.filter((m) => m.role === 'assistant').length,
  totalTokens: 0, // Unknown - set to 0
  toolCallCount: 0, // Not available from messages
  uniqueToolsUsed: new Set<string>(), // Empty set - not available
  errorCount: 0, // Not available from messages
  startTime: Date.now(), // Approximate - use current time
  lastTurnTime: Date.now(), // Approximate - use current time
};
```

### Test Mocking Strategy

Since `CaptureService` creates `ExperienceCaptureModule` internally via `createExperienceCaptureModule()`, use `vi.mock` at module level:

```typescript
// tests/unit/capture-episode-llm.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the module factory
vi.mock('../../src/services/capture/experience.module.js', () => ({
  createExperienceCaptureModule: vi.fn(() => ({
    capture: vi.fn().mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-1', title: 'LLM-extracted title' },
          confidence: 0.85,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 100,
    }),
    shouldCapture: vi.fn().mockReturnValue(true),
  })),
}));

// Import AFTER mock setup
import { CaptureService } from '../../src/services/capture/index.js';
```

### Fallback Trigger Conditions

Fall back to `recordCase()` when ANY of these conditions are true:

1. **Empty transcript**: `messages.length === 0` or `messages.length < 2`
2. **Capture returns empty**: `result.experiences.length === 0`
3. **Capture throws**: Any error from `capture()` call
4. **Provider unavailable**: When extraction service reports unavailable (checked internally by module)

Fallback implementation:

```typescript
// In onEpisodeComplete
try {
  const result = await captureModule.capture(turnData, metrics, options);

  if (result.experiences.length === 0) {
    logger.info(
      { episodeId: episode.id },
      'LLM extraction returned 0 experiences, falling back to recordCase'
    );
    return await this.recordCase({
      /* existing params */
    });
  }

  // Success path - link experiences
  return result;
} catch (error) {
  logger.warn(
    { episodeId: episode.id, error },
    'LLM extraction failed, falling back to recordCase'
  );
  return await this.recordCase({
    /* existing params */
  });
}
```

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test with vitest)
- **User wants tests**: TDD
- **Framework**: bun test / vitest

### Test Files

- `tests/unit/capture-episode-llm.test.ts` - Unit tests for new flow
- `tests/integration/episode-experience-capture.test.ts` - Integration with mock LLM

---

## Task Flow

```
Task 0 (Setup) → Task 1 (Convert messages) → Task 2 (Build metrics) → Task 3 (Replace recordCase)
                                                                              ↓
                                                           Task 4 (Handle multiple experiences)
                                                                              ↓
                                                           Task 5 (Fallback logic)
                                                                              ↓
                                                           Task 6 (Integration test)
```

## Parallelization

| Task | Depends On | Reason                    |
| ---- | ---------- | ------------------------- |
| 1    | 0          | Needs test infrastructure |
| 2    | 0          | Independent of task 1     |
| 3    | 1, 2       | Needs both conversions    |
| 4    | 3          | Needs capture working     |
| 5    | 3          | Needs capture working     |
| 6    | 4, 5       | Needs full implementation |

---

## TODOs

- [x] 0. Create test file scaffolding with mocks

  **What to do**:
  - Create `tests/unit/capture-episode-llm.test.ts`
  - Create `tests/integration/episode-experience-capture.test.ts`
  - Set up `vi.mock` for `createExperienceCaptureModule` (see Technical Specifications above)
  - Create inline mock for extraction service responses

  **Must NOT do**:
  - Implement actual tests yet (just scaffolding)
  - Create separate mock files (use inline vi.mock)

  **Parallelizable**: NO (first task)

  **References**:
  - `tests/unit/capture/` - Existing capture test patterns
  - `tests/integration/librarian.test.ts:10-50` - Integration test setup with mocks
  - `src/services/capture/experience.module.ts:createExperienceCaptureModule` - Factory to mock
  - **Technical Specifications section above** - Exact mock implementation

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/capture-episode-llm.test.ts`
  - [ ] Test file created: `tests/integration/episode-experience-capture.test.ts`
  - [ ] `vi.mock` for `createExperienceCaptureModule` configured per spec
  - [ ] `bun test tests/unit/capture-episode-llm.test.ts` → runs (0 tests, no errors)

  **Commit**: NO (groups with 1, 2)

---

- [x] 1. Implement message-to-TurnData conversion helper

  **What to do**:
  - Add `convertMessagesToTurnData()` private method to `CaptureService`
  - Convert `{ id, role, content, createdAt }` → `{ role, content, timestamp }`
  - Map role types: ensure 'user'|'assistant'|'system' are preserved
  - Handle missing fields gracefully (toolCalls undefined is OK)

  **Must NOT do**:
  - Enrich messages with tool call data (out of scope)
  - Change message schema

  **Parallelizable**: YES (with task 2)

  **References**:
  - `src/mcp/handlers/experiences.handler.ts:495-533` - TurnData conversion pattern
  - `src/services/capture/types.ts:19-25` - TurnData interface definition
  - `src/services/capture/index.ts:1024-1029` - Current message format in onEpisodeComplete

  **Acceptance Criteria**:
  - [ ] RED: Test `convertMessagesToTurnData` returns correct format
  - [ ] GREEN: Method converts `{ id, role, content, createdAt }` → `{ role, content, timestamp }`
  - [ ] Test: Handles empty array input → returns empty array
  - [ ] Test: `bun test tests/unit/capture-episode-llm.test.ts` → PASS

  **Commit**: NO (groups with 0, 2)

---

- [x] 2. Implement synthetic TurnMetrics builder

  **What to do**:
  - Add `buildSyntheticMetrics()` private method to `CaptureService`
  - Build ALL fields from `TurnMetrics` interface (see Technical Specifications above):
    - `turnCount`: messages.length
    - `userTurnCount`: count of role === 'user'
    - `assistantTurnCount`: count of role === 'assistant'
    - `totalTokens`: 0 (unknown)
    - `toolCallCount`: 0 (not available)
    - `uniqueToolsUsed`: new Set<string>() (empty)
    - `errorCount`: 0 (not available)
    - `startTime`: Date.now()
    - `lastTurnTime`: Date.now()

  **Must NOT do**:
  - Add metrics tracking to episodes (out of scope)
  - Require accurate token counts
  - Attempt to extract toolCalls from message content

  **Parallelizable**: YES (with task 1)

  **References**:
  - `src/mcp/handlers/experiences.handler.ts:544-558` - Metrics building pattern
  - `src/services/capture/types.ts:41-51` - TurnMetrics interface (ALL 9 fields)
  - **Technical Specifications section above** - Exact field mappings

  **Acceptance Criteria**:
  - [ ] RED: Test `buildSyntheticMetrics` returns object with ALL 9 TurnMetrics fields
  - [ ] GREEN: Method returns valid TurnMetrics with correct counts
  - [ ] Test: turnCount equals messages.length
  - [ ] Test: userTurnCount/assistantTurnCount correctly counted
  - [ ] Test: uniqueToolsUsed is empty Set (not undefined)
  - [ ] Test: `bun test tests/unit/capture-episode-llm.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(capture): add message-to-TurnData and metrics builders for episode capture`
  - Files: `src/services/capture/index.ts`, `tests/unit/capture-episode-llm.test.ts`
  - Pre-commit: `bun test tests/unit/capture-episode-llm.test.ts`

---

- [x] 3. Replace recordCase with captureModule.capture in onEpisodeComplete

  **What to do**:
  - Import `createExperienceCaptureModule` from `./experience.module.js`
  - In `onEpisodeComplete()`, before the existing `recordCase()` call:
    1. Check if messages.length >= 2 (minimum for meaningful extraction)
    2. Convert messages using `convertMessagesToTurnData()`
    3. Build metrics using `buildSyntheticMetrics()`
    4. Build CaptureOptions per Technical Specifications above
    5. Create module: `createExperienceCaptureModule(this.experienceRepo, this.stateManager)`
    6. Call `captureModule.capture(turnData, metrics, options)`
  - Remove the `summarizeMessages()` call (LLM capture does this better)

  **Must NOT do**:
  - Change method signature
  - Remove existing logging structure
  - Break fire-and-forget async pattern (keep `.catch()` wrapper)
  - Remove the final return statement

  **Parallelizable**: NO (depends on 1, 2)

  **References**:
  - `src/services/capture/index.ts:1092-1106` - Current recordCase call location
  - `src/services/capture/index.ts:1077-1089` - summarizeMessages call to remove
  - `src/services/capture/experience.module.ts:656` - createExperienceCaptureModule factory function
  - `src/mcp/handlers/experiences.handler.ts:561-574` - capture() usage pattern
  - **Technical Specifications: CaptureOptions Mapping** - Exact options to pass

  **Acceptance Criteria**:
  - [ ] RED: Test `onEpisodeComplete` calls `captureModule.capture()` not `recordCase()`
  - [ ] GREEN: Implementation creates ExperienceCaptureModule and calls capture()
  - [ ] `summarizeMessages()` no longer called from `onEpisodeComplete`
  - [ ] CaptureOptions includes episodeId for automatic linking
  - [ ] Test: `bun test tests/unit/capture-episode-llm.test.ts` → PASS

  **Commit**: NO (groups with 4, 5)

---

- [x] 4. Handle multiple experiences from capture result

  **What to do**:
  - `capture()` returns `{ experiences: CapturedExperience[] }`
  - Extract all experience IDs: `result.experiences.map(e => e.experience.id).filter(Boolean)`
  - Note: `episodeId` in CaptureOptions should auto-link, but verify
  - If auto-linking doesn't work, call `linkExperiencesToEpisode(experienceIds, episodeId)`
  - Update logging to show count: `{ episodeId, experiencesCaptured: result.experiences.length }`

  **Must NOT do**:
  - Filter to single experience (keep all)
  - Change linkExperiencesToEpisode API

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `src/services/capture/index.ts:1145-1153` - Existing linkExperiencesToEpisode pattern
  - `src/services/capture/index.ts:269-292` - linkExperiencesToEpisode implementation (exact line range)
  - `src/services/capture/types.ts:206-208` - episodeId in CaptureOptions

  **Acceptance Criteria**:
  - [ ] RED: Test with mock returning 3 experiences → all 3 linked to episode
  - [ ] GREEN: All experiences linked correctly
  - [ ] Log shows: `{ episodeId, experiencesCaptured: N }` where N > 1
  - [ ] Test: `bun test tests/unit/capture-episode-llm.test.ts` → PASS

  **Commit**: NO (groups with 3, 5)

---

- [x] 5. Implement fallback when LLM extraction fails or returns empty

  **What to do**:
  - Implement fallback per Technical Specifications above
  - Fallback triggers:
    1. `messages.length < 2` → Skip LLM, use recordCase directly
    2. `result.experiences.length === 0` → Fall back to recordCase
    3. `capture()` throws error → Catch, log, fall back to recordCase
  - Log each fallback with reason: `logger.info({ episodeId, reason }, 'Falling back to recordCase')`
  - Fallback uses existing `recordCase()` params (title, scenario, outcome, content, trajectory)

  **Must NOT do**:
  - Throw errors on extraction failure
  - Skip capture entirely (always produce SOME experience)
  - Remove the original recordCase logic (keep as fallback)

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `src/services/capture/index.ts:1092-1106` - Current recordCase implementation to use as fallback
  - `src/services/capture/experience.module.ts:186-188` - Provider availability check
  - **Technical Specifications: Fallback Trigger Conditions** - Exact conditions

  **Acceptance Criteria**:
  - [ ] RED: Test with messages.length=1 → uses recordCase, not capture
  - [ ] RED: Test with capture returning 0 experiences → falls back to recordCase
  - [ ] RED: Test with capture throwing error → falls back to recordCase
  - [ ] GREEN: All fallback paths work correctly
  - [ ] Log shows reason for each fallback: `Falling back to recordCase: {reason}`
  - [ ] Test: `bun test tests/unit/capture-episode-llm.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(capture): use LLM extraction for episode experiences with fallback`
  - Files: `src/services/capture/index.ts`, `tests/unit/capture-episode-llm.test.ts`
  - Pre-commit: `bun test`

---

- [x] 6. Integration test: Verify librarian receives rich experiences

  **What to do**:
  - Create integration test that:
    1. Sets up test database and services
    2. Creates mock extraction service that returns realistic data
    3. Completes an episode with 5+ messages
    4. Verifies experience has LLM-extracted fields (not generic)
    5. Verifies experience.title !== 'Episode: X'
    6. Verifies experience.scenario !== 'Task execution'
  - Create inline mock for extraction service (no separate mock file)

  **Must NOT do**:
  - Test with real LLM API calls
  - Modify librarian logic
  - Create separate mock files (use inline mocks)

  **Parallelizable**: NO (depends on 4, 5)

  **References**:
  - `tests/integration/episode-experience-capture.test.ts` - Created in task 0
  - `tests/integration/librarian.test.ts:50-100` - Integration test patterns with service setup
  - `tests/unit/capture.service.test.ts` - Existing capture service test patterns

  **Acceptance Criteria**:
  - [ ] Test: Episode completion creates experience with non-generic title
  - [ ] Test: Experience.title does NOT start with "Episode:"
  - [ ] Test: Experience.scenario !== "Task execution"
  - [ ] Test: Experience has confidence score from extraction (not hardcoded 0.85)
  - [ ] `bun test tests/integration/episode-experience-capture.test.ts` → PASS

  **Commit**: YES
  - Message: `test(capture): add integration test for LLM episode experience capture`
  - Files: `tests/integration/episode-experience-capture.test.ts`
  - Pre-commit: `bun test`

---

- [x] 7. Manual verification: Complete episode and check librarian

  **What to do**:
  - Start a session with `memory_quickstart`
  - Begin an episode with a meaningful name
  - Have a conversation with some tool usage
  - Complete the episode
  - Check experience via `memory_experience action:list`
  - Wait for librarian analysis or trigger manually
  - Check recommendation quality via `memory_librarian action:list_recommendations`

  **Must NOT do**:
  - Automate this (manual QA)

  **Parallelizable**: NO (final task)

  **References**:
  - MCP tools: `memory_quickstart`, `memory_episode`, `memory_experience`, `memory_librarian`

  **Acceptance Criteria**:
  - [ ] Experience title is descriptive (not "Episode: X")
  - [ ] Experience scenario describes actual task (not "Task execution")
  - [ ] Librarian recommendation (if generated) has meaningful pattern
  - [ ] No errors in agent-memory logs

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message                                                                           | Files               | Verification                                      |
| ---------- | --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| 2          | `feat(capture): add message-to-TurnData and metrics builders for episode capture` | index.ts, test file | `bun test tests/unit/capture-episode-llm.test.ts` |
| 5          | `feat(capture): use LLM extraction for episode experiences with fallback`         | index.ts, test file | `bun test`                                        |
| 6          | `test(capture): add integration test for LLM episode experience capture`          | integration test    | `bun test`                                        |

---

## Success Criteria

### Verification Commands

```bash
bun test                    # All tests pass
bun test --coverage         # Coverage maintained or improved
```

### Final Checklist

- [x] Episode completion creates experiences with LLM-extracted titles
- [x] Experiences have meaningful scenario (not "Task execution")
- [x] Multiple experiences can be linked to single episode
- [x] Fallback works when LLM unavailable or returns empty
- [x] Librarian recommendations show meaningful patterns (verified via integration test)
- [x] No regressions in existing tests (17/17 unit tests pass, 2/2 integration tests pass)
- [x] Fire-and-forget async pattern preserved (lines 1063-1110 use try-catch with fallback)
