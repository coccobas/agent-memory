# Topic Hierarchy: Three-Tier Session/Topic/Episode Redesign

## TL;DR

> **Quick Summary**: Introduce "Topic" as a new first-class entity to separate temporal context (sessions) from work context (topics). Episodes link directly to topics, sessions become date-based containers.
>
> **Deliverables**:
>
> - New `topics` table with full schema
> - TopicService + TopicRepository
> - LLM-based topic/episode name extraction with fallback
> - Embedding-based topic auto-resume
> - Episode boundary auto-detection
> - Updated `memory_quickstart` integration
> - New `memory_topic` MCP tool
> - Dashboard UI updates for topic display
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Schema → Repository → Service → Quickstart → MCP Tool → Dashboard

---

## Context

### Original Request

"Sessions should be context windows (date-based), topics should be the feature/research being worked on, episodes should be specific tasks within topics."

### Interview Summary

**Key Discussions**:

- Three-tier hierarchy: Session (temporal) → Topic (work context) → Episode (task)
- Topics persist across sessions (days/weeks)
- Episodes link directly to topics, not sessions
- LLM-based extraction for topic/episode names
- Auto-resume topics via embedding similarity
- Generic fallback names if LLM fails, enrich later

**Research Findings**:

- Current coupling at `memory_quickstart.ts:504` - episode inherits session name
- 79 files reference `sessionId` in episode context
- Existing infrastructure: boundary-detector.ts, extraction.service.ts, embedding service
- Episode schema already has `parentEpisodeId`, `depth` - patterns to follow

### Metis Review

**Identified Gaps** (addressed):

- Topic lifecycle: Topics don't complete (ongoing work contexts)
- LLM fallback: Generic name → background enrichment
- Architecture: Topic → Episode (sessions = temporal only)
- Resumption: Embedding-based semantic similarity

---

## Work Objectives

### Core Objective

Introduce Topic as a first-class entity that organizes episodes by work context, independent of temporal sessions.

### Concrete Deliverables

- `src/db/schema/topics.ts` - New topics table schema
- `src/db/repositories/topics.ts` - Topic repository with CRUD + findSimilar
- `src/services/topic/index.ts` - TopicService with lifecycle management
- `src/mcp/descriptors/memory_topic.ts` - MCP tool descriptor
- `src/mcp/handlers/topics.handler.ts` - MCP handlers
- Updated `memory_quickstart.ts` - Topic integration
- Updated episode schema with `topicId` FK
- Dashboard topic grouping UI

### Definition of Done

- [ ] `bun test` - All tests pass (including new topic tests)
- [ ] `bun run build` - No TypeScript errors
- [ ] `memory_quickstart` creates/resumes topics automatically
- [ ] Episodes link to topics via `topicId`
- [ ] Dashboard shows topics with grouped episodes

### Must Have

- Topics table with proper schema
- Topic-Episode linking (topicId FK)
- LLM extraction with fallback
- Embedding-based auto-resume
- Backward compatibility (existing sessions work)

### Must NOT Have (Guardrails)

- Topic hierarchies (topics within topics) - OUT OF SCOPE
- Topic templates or presets - OUT OF SCOPE
- Cross-project topics - OUT OF SCOPE
- Topic sharing/collaboration - OUT OF SCOPE
- Remove sessionId from episodes (keep for backward compat)
- Break existing 14 episode test files
- Require topicId for existing workflows

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (bun test, vitest patterns)
- **User wants tests**: TDD - tests first
- **Framework**: bun test

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Topics schema + migration
├── Task 2: Add topicId to episodes schema
└── Task 3: Topic repository tests (RED phase)

Wave 2 (After Wave 1):
├── Task 4: Topic repository implementation (GREEN)
├── Task 5: Topic service tests (RED phase)
└── Task 6: LLM extraction tests for topics (RED phase)

Wave 3 (After Wave 2):
├── Task 7: Topic service implementation (GREEN)
├── Task 8: LLM topic extraction (GREEN)
├── Task 9: Embedding-based findSimilar

Wave 4 (After Wave 3):
├── Task 10: Episode boundary detection for topics
├── Task 11: Quickstart integration
└── Task 12: MCP tool: memory_topic

Wave 5 (After Wave 4):
├── Task 13: Dashboard UI - Topics list
└── Task 14: Dashboard UI - Episode grouping by topic

Critical Path: 1 → 4 → 7 → 11 → 12
```

### Dependency Matrix

| Task | Depends On     | Blocks  | Can Parallelize With |
| ---- | -------------- | ------- | -------------------- |
| 1    | None           | 4, 5, 7 | 2, 3                 |
| 2    | None           | 11      | 1, 3                 |
| 3    | None           | 4       | 1, 2                 |
| 4    | 1, 3           | 7, 9    | 5, 6                 |
| 5    | 1              | 7       | 4, 6                 |
| 6    | 1              | 8       | 4, 5                 |
| 7    | 4, 5           | 11      | 8, 9                 |
| 8    | 6              | 11      | 7, 9                 |
| 9    | 4              | 11      | 7, 8                 |
| 10   | 7              | 11      | None                 |
| 11   | 2, 7, 8, 9, 10 | 12      | None                 |
| 12   | 7              | 13      | 11                   |
| 13   | 12             | 14      | None                 |
| 14   | 13             | None    | None                 |

---

## TODOs

### Phase 1: Data Model

- [x] 1. Create topics table schema

  **What to do**:
  - Create `src/db/schema/topics.ts` following episodes.ts pattern
  - Schema fields: id, projectId, name, description, status (active/inactive), embedding (for similarity), metadata, createdAt, updatedAt, createdBy, isActive
  - Add indexes: project, name, embedding (if vector)
  - Create PostgreSQL variant in `src/db/schema/postgresql/topics.ts`

  **Must NOT do**:
  - Add status like 'completed' - topics don't complete
  - Add parentTopicId - no topic hierarchies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]
    - `coding-standards`: Schema follows project patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None

  **References**:
  - `src/db/schema/episodes.ts` - Schema pattern to follow (table structure, indexes, type exports)
  - `src/db/schema/scopes.ts` - Project FK pattern
  - `src/db/schema/postgresql/episodes.ts` - PostgreSQL variant pattern

  **Acceptance Criteria**:
  - [ ] Test file created: `src/db/schema/__tests__/topics.test.ts`
  - [ ] Schema compiles: `bun run build` passes
  - [ ] Table can be created: `bun run db:push` succeeds
  - [ ] Type exports work: `import { Topic, NewTopic } from './topics'` resolves

  **Commit**: YES
  - Message: `feat(db): add topics table schema`
  - Files: `src/db/schema/topics.ts`, `src/db/schema/postgresql/topics.ts`, `src/db/schema/index.ts`
  - Pre-commit: `bun run build`

---

- [x] 2. Add topicId to episodes schema

  **What to do**:
  - Add `topicId` nullable FK to episodes table (both SQLite and PostgreSQL)
  - Add index on topicId
  - Keep sessionId - backward compatibility

  **Must NOT do**:
  - Remove sessionId
  - Make topicId required

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - `src/db/schema/episodes.ts:39-40` - Existing FK pattern (sessionId, projectId)
  - `src/db/schema/episodes.ts:93` - Index pattern

  **Acceptance Criteria**:
  - [ ] Schema compiles: `bun run build` passes
  - [ ] Existing episode tests pass: `bun test src/db/repositories/__tests__/episodes.test.ts`
  - [ ] topicId is nullable: episodes without topicId still work

  **Commit**: YES
  - Message: `feat(db): add topicId FK to episodes schema`
  - Files: `src/db/schema/episodes.ts`, `src/db/schema/postgresql/episodes.ts`
  - Pre-commit: `bun test src/db/repositories/__tests__/episodes.test.ts`

---

- [x] 3. Write topic repository tests (RED)

  **What to do**:
  - Create `src/db/repositories/__tests__/topics.test.ts`
  - Write tests for: create, getById, list, update, deactivate, findSimilar
  - Tests should FAIL initially (RED phase)

  **Must NOT do**:
  - Implement the repository yet
  - Skip edge cases (duplicate names, not found, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: RED phase - write failing tests first

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `tests/unit/episodes.repo.test.ts` - Test pattern to follow
  - `tests/unit/guidelines.repo.test.ts` - Additional CRUD test patterns

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/unit/topics.repo.test.ts`
  - [ ] Tests fail as expected: `bun test tests/unit/topics.repo.test.ts` shows failures
  - [ ] Covers: create, getById, list (with filters), update, deactivate, findSimilar

  **Commit**: YES
  - Message: `test(db): add topic repository tests (RED)`
  - Files: `src/db/repositories/__tests__/topics.test.ts`
  - Pre-commit: None (tests expected to fail)

---

### Phase 2: Repository Layer

- [x] 4. Implement topic repository (GREEN)

  **What to do**:
  - Create `src/db/repositories/topics.ts`
  - Implement all methods to make tests pass
  - Follow episodes.ts patterns exactly
  - Include findSimilar with embedding placeholder (will wire in Task 9)

  **Must NOT do**:
  - Add methods not covered by tests
  - Implement embedding search yet (placeholder)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`coding-standards`, `tdd-workflow`]
    - `tdd-workflow`: GREEN phase - minimum code to pass tests

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 7, 9
  - **Blocked By**: Tasks 1, 3

  **References**:
  - `src/db/repositories/episodes.ts` - Repository pattern (CRUD, list with filters, transactionWithRetry)
  - `src/db/repositories/guidelines.ts` - Additional patterns (deactivate, bulk operations)
  - `src/core/interfaces/repositories.ts` - Interface pattern

  **Acceptance Criteria**:
  - [ ] All tests pass: `bun test tests/unit/topics.repo.test.ts` → PASS
  - [ ] Repository exported: `import { createTopicRepository } from './topics'` works
  - [ ] Interface defined: `ITopicRepository` in `src/core/interfaces/repositories.ts`

  **Commit**: YES
  - Message: `feat(db): implement topic repository`
  - Files: `src/db/repositories/topics.ts`, `src/db/repositories/index.ts`, `src/core/interfaces/repositories.ts`
  - Pre-commit: `bun test src/db/repositories/__tests__/topics.test.ts`

---

- [x] 5. Write topic service tests (RED)

  **What to do**:
  - Create `src/services/topic/__tests__/topic.service.test.ts`
  - Write tests for: create, get, list, update, findOrCreate, getActiveTopic
  - Include test for auto-resume logic
  - Tests should FAIL initially

  **Must NOT do**:
  - Implement the service yet
  - Test LLM extraction (separate task)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`tdd-workflow`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:
  - `tests/unit/episode.service.test.ts` - Service test patterns
  - `src/services/episode/index.ts` - Service structure to follow

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/unit/topic.service.test.ts`
  - [ ] Tests fail as expected: `bun test tests/unit/topic.service.test.ts` shows failures
  - [ ] Covers: create, get, list, findOrCreate, getActiveTopic, auto-resume

  **Commit**: YES
  - Message: `test(services): add topic service tests (RED)`
  - Files: `src/services/topic/__tests__/topic.service.test.ts`
  - Pre-commit: None

---

- [x] 6. Write LLM topic extraction tests (RED)

  **What to do**:
  - Create `src/services/extraction/__tests__/topic-extraction.test.ts`
  - Test extractTopicName from user message
  - Test fallback to generic name when LLM unavailable
  - Test background enrichment trigger

  **Must NOT do**:
  - Implement extraction yet
  - Test episode extraction (existing)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:
  - `tests/unit/extraction.service.test.ts` - Existing extraction tests
  - `src/services/extraction/hybrid-extractor.ts` - Extraction patterns

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/unit/topic-extraction.test.ts`
  - [ ] Tests fail as expected
  - [ ] Covers: successful extraction, LLM failure fallback, enrichment trigger

  **Commit**: YES
  - Message: `test(extraction): add topic name extraction tests (RED)`
  - Files: `src/services/extraction/__tests__/topic-extraction.test.ts`
  - Pre-commit: None

---

### Phase 3: Service Layer

- [x] 7. Implement topic service (GREEN)

  **What to do**:
  - Create `src/services/topic/index.ts`
  - Implement TopicService class with all methods
  - Wire to repository
  - Add getActiveTopic for current session's topic

  **Must NOT do**:
  - Implement embedding similarity yet (Task 9)
  - Implement LLM extraction yet (Task 8)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`coding-standards`, `tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 4, 5

  **References**:
  - `src/services/episode/index.ts` - Service class pattern (constructor, methods, factory function)
  - `src/services/episode/handlers/` - Handler patterns if needed
  - `src/core/context.ts` - Service registration pattern

  **Acceptance Criteria**:
  - [ ] All service tests pass: `bun test tests/unit/topic.service.test.ts` → PASS
  - [ ] Service exported and typed: `ITopicService` interface exists
  - [ ] Factory function: `createTopicService()` works

  **Commit**: YES
  - Message: `feat(services): implement topic service`
  - Files: `src/services/topic/index.ts`, `src/services/topic/types.ts`
  - Pre-commit: `bun test src/services/topic`

---

- [x] 8. Implement LLM topic extraction (GREEN)

  **What to do**:
  - Add `extractTopicName(userMessage: string)` to extraction service
  - Implement fallback: generic name "Topic #N" if LLM fails
  - Add background enrichment job to rename later
  - Use existing LLM infrastructure

  **Must NOT do**:
  - Change existing extraction methods
  - Block on LLM response (async with fallback)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 6

  **References**:
  - `src/services/extraction/hybrid-extractor.ts` - Existing extraction patterns
  - `src/services/episode/episode-name-enrichment.service.ts` - Background enrichment pattern
  - `src/services/llm/client.ts` - LLM client infrastructure

  **Acceptance Criteria**:
  - [ ] Extraction tests pass: `bun test tests/unit/topic-extraction.test.ts` → PASS
  - [ ] Fallback works: When LLM unavailable, returns "Topic #N"
  - [ ] Non-blocking: Function returns immediately with fallback, enriches in background

  **Commit**: YES
  - Message: `feat(extraction): add topic name extraction with LLM`
  - Files: `src/services/extraction/topic-extractor.ts`, `src/services/extraction/index.ts`
  - Pre-commit: `bun test src/services/extraction`

---

- [x] 9. Implement embedding-based findSimilar

  **What to do**:
  - Wire TopicRepository.findSimilar to embedding service
  - Use existing vector search infrastructure
  - Return topics above similarity threshold (configurable, default 0.8)
  - Add embedding column population on topic create/update

  **Must NOT do**:
  - Create new embedding infrastructure
  - Change embedding service interface

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Task 11
  - **Blocked By**: Task 4

  **References**:
  - `src/services/embedding.service.ts` - Embedding service implementation
  - `src/services/vector.service.ts` - Vector service for similarity search
  - `src/services/consolidation/similarity.ts` - Similarity calculation patterns

  **Acceptance Criteria**:
  - [ ] findSimilar returns semantically similar topics
  - [ ] Test: `bun test tests/unit/topics.repo.test.ts -t "findSimilar"` → PASS
  - [ ] Threshold configurable via parameter

  **Commit**: YES
  - Message: `feat(topics): add embedding-based similarity search`
  - Files: `src/db/repositories/topics.ts`, topic service updates
  - Pre-commit: `bun test src/db/repositories/__tests__/topics.test.ts`

---

### Phase 4: Integration

- [ ] 10. Episode boundary detection for topics

  **What to do**:
  - Extend boundary-detector.ts to detect task switches within topics
  - Add patterns: "now let me...", "next I need to...", "switching to..."
  - When boundary detected, auto-complete current episode with inferred outcome
  - Create new episode under same topic

  **Must NOT do**:
  - Detect topic boundaries (topics don't switch mid-session)
  - Break existing boundary detection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: Task 11
  - **Blocked By**: Task 7

  **References**:
  - `src/services/episode/boundary-detector.ts` - Existing boundary detection
  - `src/services/intent-detection/patterns.ts` - Pattern matching infrastructure
  - `src/services/episode/handlers/complete.ts` - Episode completion with outcome inference

  **Acceptance Criteria**:
  - [ ] Test: Boundary detection recognizes task switch patterns
  - [ ] Test: Previous episode auto-completes with inferred outcome
  - [ ] Test: New episode created under same topic
  - [ ] `bun test src/services/episode/boundary-detector` → PASS

  **Commit**: YES
  - Message: `feat(episodes): add topic-aware boundary detection`
  - Files: `src/services/episode/boundary-detector.ts`, patterns.ts updates
  - Pre-commit: `bun test src/services/episode`

---

- [ ] 11. Integrate topics into memory_quickstart

  **What to do**:
  - Update quickstart to create/resume topics
  - Flow: User message → extract topic name → findSimilar → resume or create
  - Link new episodes to topic (not just session)
  - Update session to be date-based name if not specified
  - Keep backward compatibility (existing calls work)

  **Must NOT do**:
  - Require topic for quickstart (graceful fallback)
  - Break existing quickstart behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`coding-standards`, `tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 2, 7, 8, 9, 10

  **References**:
  - `src/mcp/descriptors/memory_quickstart.ts:490-522` - Current episode auto-creation
  - `src/mcp/descriptors/memory_quickstart.ts:304-387` - Session creation flow

  **Acceptance Criteria**:
  - [ ] Test: quickstart with message creates topic via LLM extraction
  - [ ] Test: quickstart finds similar topic and resumes it
  - [ ] Test: episode linked to topic (topicId populated)
  - [ ] Test: existing quickstart calls still work (backward compat)
  - [ ] `bun test tests/integration/full-workflow.test.ts` → PASS (includes quickstart)

  **Commit**: YES
  - Message: `feat(quickstart): integrate topic creation and resumption`
  - Files: `src/mcp/descriptors/memory_quickstart.ts`
  - Pre-commit: `bun test src/mcp/descriptors/__tests__/memory_quickstart.test.ts`

---

- [ ] 12. Create memory_topic MCP tool

  **What to do**:
  - Create `src/mcp/descriptors/memory_topic.ts`
  - Actions: list, get, create, update, deactivate, find_similar
  - Create `src/mcp/handlers/topics.handler.ts`
  - Register in tool index

  **Must NOT do**:
  - Add 'complete' action (topics don't complete)
  - Add topic hierarchies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 7

  **References**:
  - `src/mcp/descriptors/memory_episode.ts` - MCP tool descriptor pattern
  - `src/mcp/handlers/episodes.handler.ts` - Handler pattern
  - `src/mcp/descriptors/index.ts` - Tool registration
  - `tests/unit/episodes-handler.test.ts` - Handler test pattern

  **Acceptance Criteria**:
  - [ ] Tool appears in MCP tool list
  - [ ] Test: `memory_topic` action=list returns topics
  - [ ] Test: `memory_topic` action=create creates topic
  - [ ] Test: `memory_topic` action=find_similar returns similar topics
  - [ ] `bun test tests/unit/topics-handler.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(mcp): add memory_topic tool`
  - Files: `src/mcp/descriptors/memory_topic.ts`, `src/mcp/handlers/topics.handler.ts`, index updates
  - Pre-commit: `bun test src/mcp/handlers/__tests__/topics.handler.test.ts`

---

### Phase 5: Dashboard UI

- [ ] 13. Dashboard: Topics list view

  **What to do**:
  - Add Topics page to dashboard
  - Show topics with: name, episode count, last activity, project
  - Add filters: project, active/inactive
  - Link to episodes within topic

  **Must NOT do**:
  - Add topic editing (keep read-only for now)
  - Add topic creation UI (happens via agent)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 14
  - **Blocked By**: Task 12

  **References**:
  - `dashboard/src/pages/episodes.tsx` - Episodes page pattern
  - `dashboard/src/components/ui/` - UI component patterns
  - `dashboard/src/api/hooks/use-episodes.ts` - API hook patterns

  **Acceptance Criteria**:
  - [ ] Topics page accessible at `/topics` route
  - [ ] Topics list displays with correct data
  - [ ] Filter by project works
  - [ ] Click topic → shows episodes
  - [ ] Visual verification via playwright: navigate to /topics, screenshot

  **Commit**: YES
  - Message: `feat(dashboard): add topics list page`
  - Files: `dashboard/src/pages/topics.tsx`, `dashboard/src/api/hooks/use-topics.ts`
  - Pre-commit: `cd dashboard && bun run build`

---

- [ ] 14. Dashboard: Episode grouping by topic

  **What to do**:
  - Update Episodes page to group by topic
  - Show topic name as section header
  - Add topic filter dropdown
  - Update episode cards to show topic badge

  **Must NOT do**:
  - Remove existing session-based views (keep both)
  - Major redesign of episode cards

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: None (final task)
  - **Blocked By**: Task 13

  **References**:
  - `dashboard/src/pages/episodes.tsx` - Current episodes page
  - `dashboard/src/pages/sessions.tsx` - Grouping patterns

  **Acceptance Criteria**:
  - [ ] Episodes grouped by topic header
  - [ ] Topic filter dropdown works
  - [ ] Episode cards show topic badge
  - [ ] Visual verification via playwright

  **Commit**: YES
  - Message: `feat(dashboard): group episodes by topic`
  - Files: `dashboard/src/pages/episodes.tsx`
  - Pre-commit: `cd dashboard && bun run build`

---

## Commit Strategy

| After Task | Message                                                     | Files             | Verification          |
| ---------- | ----------------------------------------------------------- | ----------------- | --------------------- |
| 1          | `feat(db): add topics table schema`                         | schema files      | `bun run build`       |
| 2          | `feat(db): add topicId FK to episodes schema`               | episodes schema   | `bun test episodes`   |
| 3          | `test(db): add topic repository tests (RED)`                | test file         | None                  |
| 4          | `feat(db): implement topic repository`                      | repository        | `bun test topics`     |
| 5          | `test(services): add topic service tests (RED)`             | test file         | None                  |
| 6          | `test(extraction): add topic name extraction tests (RED)`   | test file         | None                  |
| 7          | `feat(services): implement topic service`                   | service           | `bun test topic`      |
| 8          | `feat(extraction): add topic name extraction with LLM`      | extractor         | `bun test extraction` |
| 9          | `feat(topics): add embedding-based similarity search`       | repository        | `bun test topics`     |
| 10         | `feat(episodes): add topic-aware boundary detection`        | boundary-detector | `bun test episode`    |
| 11         | `feat(quickstart): integrate topic creation and resumption` | quickstart        | `bun test quickstart` |
| 12         | `feat(mcp): add memory_topic tool`                          | mcp files         | `bun test handlers`   |
| 13         | `feat(dashboard): add topics list page`                     | dashboard         | dashboard tests       |
| 14         | `feat(dashboard): group episodes by topic`                  | dashboard         | dashboard tests       |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
bun test
# Expected: All tests pass

# Build check
bun run build
# Expected: No TypeScript errors

# Integration test: topic creation flow
bun test src/mcp/descriptors/__tests__/memory_quickstart.test.ts -t "topic"
# Expected: Topic created, episode linked

# MCP tool test
bun test src/mcp/handlers/__tests__/topics.handler.test.ts
# Expected: All topic actions work
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (`bun test`)
- [ ] Build succeeds (`bun run build`)
- [ ] Backward compatibility verified (existing sessions work)
- [ ] 14 commits with descriptive messages
