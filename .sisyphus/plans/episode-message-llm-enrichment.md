# Episode Message LLM Enrichment

## Overview

Enhance the episode-message linking with LLM-powered analysis to extract more value from conversation context.

## Status: READY FOR IMPLEMENTATION

## Implementation Order

1. **Phase 2: Infrastructure** (enables all other phases)
2. **Phase 1: Conversation Summarization** (real-time, highest impact)
3. **Phase 4: Message Relevance Scoring** (enables filtering)
4. **Phase 5: Experience Title Improvement** (builds on context)
5. **Phase 3: Insight Extraction** (most complex, do last)

---

## TODOs

### Phase 2: Librarian Task Infrastructure

- [x] 2.1 Add task config types to `src/services/librarian/maintenance/types.ts`

  **What to do:**
  - Add `MessageInsightExtractionConfig` interface
  - Add `MessageRelevanceScoringConfig` interface
  - Add `ExperienceTitleImprovementConfig` interface
  - Add these to `MaintenanceConfig` interface
  - Add to `DEFAULT_MAINTENANCE_CONFIG`
  - Add to `MaintenanceRequest.tasks` array type
  - Add result types for each task

  **References:**
  - `src/services/librarian/maintenance/types.ts:39-178` - Existing config patterns
  - `src/services/librarian/maintenance/types.ts:222-284` - DEFAULT_MAINTENANCE_CONFIG
  - `src/services/librarian/maintenance/types.ts:293-315` - MaintenanceRequest
  - `src/services/librarian/maintenance/types.ts:324-481` - Result type patterns

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] New config interfaces match pattern of existing ones
  - [ ] Default configs have `enabled: false` initially

  **Parallelizable:** NO (foundation for other tasks)
  **Commit:** YES
  - Message: `feat(librarian): add config types for message enrichment tasks`

---

- [x] 2.2 Add result types to maintenance types

  **What to do:**
  - Add `MessageInsightExtractionResult` interface
  - Add `MessageRelevanceScoringResult` interface
  - Add `ExperienceTitleImprovementResult` interface
  - Add these to `MaintenanceResult` interface

  **References:**
  - `src/services/librarian/maintenance/types.ts:324-481` - Existing result patterns

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Result types include: executed, entriesProcessed, durationMs, errors

  **Parallelizable:** YES (with 2.1)
  **Commit:** NO (groups with 2.1)

---

### Phase 1: Conversation Summarization (Real-time)

- [x] 1.1 Add message enrichment config to capture types

  **What to do:**
  - Add `MessageEnrichmentConfig` interface to `src/services/capture/types.ts`
  - Add `messageEnrichment` field to `CaptureConfig` interface
  - Define summarization settings: enabled, maxMessages, fallbackToTruncated

  **References:**
  - `src/services/capture/types.ts` - Existing type patterns
  - `src/services/extraction/providers/types.ts:72-78` - GenerationInput for LLM calls

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Config is optional with sensible defaults

  **Parallelizable:** YES (with Phase 2)
  **Commit:** NO (groups with 1.2)

---

- [x] 1.2 Update CaptureServiceDeps to include extraction provider

  **What to do:**
  - Add `extractionProvider?: IExtractionProvider | null` to `CaptureServiceDeps`
  - Store in CaptureService constructor
  - Add to context-wiring.ts to inject the provider

  **References:**
  - `src/services/capture/index.ts:48-61` - CaptureServiceDeps
  - `src/services/extraction/providers/types.ts:94-114` - IExtractionProvider interface
  - `src/core/factory/context-wiring.ts` - Service wiring

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] CaptureService receives extractionProvider

  **Parallelizable:** NO (depends on 1.1)
  **Commit:** NO (groups with 1.3)

---

- [x] 1.3 Implement summarizeMessages helper in CaptureService

  **What to do:**
  - Add private `summarizeMessages(messages)` method
  - Use `extractionProvider.generate()` with summarization prompt
  - Handle errors gracefully, return null on failure
  - Log summarization attempts and results

  **References:**
  - `src/services/extraction/providers/types.ts:72-89` - GenerationInput/Result
  - `src/services/capture/index.ts` - CaptureService class

  **Prompt template:**

  ```
  Summarize this conversation in 2-3 sentences, focusing on:
  - Key decisions made
  - Problems identified and solved
  - Important outcomes

  Conversation:
  {messages}
  ```

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Returns summary string or null on error
  - [ ] Logs errors without throwing

  **Parallelizable:** NO (depends on 1.2)
  **Commit:** NO (groups with 1.4)

---

- [x] 1.4 Modify onEpisodeComplete to use summarization

  **What to do:**
  - Replace truncated message logic (lines 1011-1023) with summarization call
  - Call `summarizeMessages()` if provider available and enabled
  - Fallback to existing truncated messages if summarization fails
  - Include summary in experience content

  **References:**
  - `src/services/capture/index.ts:1011-1023` - Current truncation logic

  **Current code:**

  ```typescript
  if (episode.messages && episode.messages.length > 0) {
    contentParts.push('');
    contentParts.push(`Conversation context (${episode.messages.length} messages):`);
    for (const msg of episode.messages.slice(-5)) {
      const truncatedContent =
        msg.content.length > 200 ? msg.content.slice(0, 197) + '...' : msg.content;
      contentParts.push(`[${msg.role}]: ${truncatedContent}`);
    }
  }
  ```

  **New code pattern:**

  ```typescript
  if (episode.messages && episode.messages.length > 0) {
    const summary = await this.summarizeMessages(episode.messages);
    if (summary) {
      contentParts.push('');
      contentParts.push(`Conversation summary: ${summary}`);
    } else {
      // Fallback to truncated (existing logic)
    }
  }
  ```

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] `npm test -- --run capture` passes
  - [ ] Summarization is used when provider available
  - [ ] Fallback works when provider unavailable or fails

  **Parallelizable:** NO (depends on 1.3)
  **Commit:** YES
  - Message: `feat(capture): add LLM conversation summarization on episode completion`
  - Files: `src/services/capture/index.ts`, `src/services/capture/types.ts`

---

### Phase 4: Message Relevance Scoring

- [ ] 4.1 Add relevance columns to conversation messages schema

  **What to do:**
  - Add `relevanceScore` (real, nullable) to `conversationMessages`
  - Add `relevanceCategory` (text, nullable) to `conversationMessages`
  - Add `relevanceScoredAt` (text, nullable) to `conversationMessages`

  **References:**
  - `src/db/schema/conversations.ts` - SQLite schema
  - `src/db/schema/postgresql/conversations.ts` - PostgreSQL schema

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Both SQLite and PostgreSQL schemas updated

  **Parallelizable:** YES (independent)
  **Commit:** NO (groups with 4.2)

---

- [ ] 4.2 Create migration for relevance columns

  **What to do:**
  - Create `src/db/migrations/0035_add_message_relevance.sql`
  - Add ALTER TABLE statements for new columns

  **Migration content:**

  ```sql
  ALTER TABLE `conversation_messages` ADD COLUMN `relevance_score` real;
  --> statement-breakpoint
  ALTER TABLE `conversation_messages` ADD COLUMN `relevance_category` text;
  --> statement-breakpoint
  ALTER TABLE `conversation_messages` ADD COLUMN `relevance_scored_at` text;
  --> statement-breakpoint
  CREATE INDEX `idx_messages_relevance` ON `conversation_messages` (`relevance_category`);
  ```

  **Acceptance Criteria:**
  - [ ] Migration applies cleanly
  - [ ] `npm test -- --run episode-message` passes

  **Parallelizable:** NO (depends on 4.1)
  **Commit:** YES
  - Message: `feat(schema): add relevance scoring columns to conversation messages`

---

- [ ] 4.3 Create message relevance scoring task

  **What to do:**
  - Create `src/services/librarian/maintenance/message-relevance-scoring.ts`
  - Implement `runMessageRelevanceScoring()` function
  - Find messages with episodeId but no relevanceScore
  - Batch by episode, call LLM to score
  - Update messages with scores

  **References:**
  - `src/services/librarian/maintenance/tool-tag-assignment.ts` - Similar LLM task pattern
  - `src/services/extraction/providers/types.ts` - IExtractionProvider

  **Algorithm:**
  1. Find unscored messages with episodeId (batch by episode)
  2. For each episode batch:
     a. Fetch episode name/outcome for context
     b. Format messages for LLM
     c. Call LLM with scoring prompt
     d. Parse scores, update messages
  3. Track progress, return results

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Function signature matches other maintenance tasks
  - [ ] Messages get relevance scores updated

  **Parallelizable:** NO (depends on 4.2)
  **Commit:** NO (groups with 4.4)

---

- [ ] 4.4 Register task in MaintenanceOrchestrator

  **What to do:**
  - Import `runMessageRelevanceScoring` in orchestrator
  - Add task execution in `runMaintenance()` method
  - Follow pattern of other tasks

  **References:**
  - `src/services/librarian/maintenance/orchestrator.ts` - Task registration pattern

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Task runs when enabled in config

  **Parallelizable:** NO (depends on 4.3)
  **Commit:** YES
  - Message: `feat(librarian): add message relevance scoring maintenance task`

---

- [ ] 4.5 Update whatHappened to support relevance filtering

  **What to do:**
  - Add `minRelevance?: 'high' | 'medium' | 'low' | 'all'` option to `whatHappened`
  - Filter messages by relevanceCategory when option provided
  - Default to 'all' (no filtering)

  **References:**
  - `src/services/episode/index.ts:373-430` - whatHappened method

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Filtering works correctly
  - [ ] Default behavior unchanged

  **Parallelizable:** NO (depends on 4.4)
  **Commit:** YES
  - Message: `feat(episode): add relevance filtering to whatHappened query`

---

### Phase 5: Experience Title Improvement

- [ ] 5.1 Create experience title improvement task

  **What to do:**
  - Create `src/services/librarian/maintenance/experience-title-improvement.ts`
  - Implement `runExperienceTitleImprovement()` function
  - Find experiences with generic titles (matching pattern)
  - Fetch linked episode/messages for context
  - Call LLM to generate better title
  - Update experience, preserve original in metadata

  **References:**
  - `src/services/librarian/maintenance/tool-tag-assignment.ts` - Similar pattern

  **Generic title pattern:** `/^Episode:\s/`

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Generic titles detected correctly
  - [ ] Original title preserved in metadata

  **Parallelizable:** YES (with Phase 4)
  **Commit:** NO (groups with 5.2)

---

- [ ] 5.2 Register task in MaintenanceOrchestrator

  **What to do:**
  - Import and register `runExperienceTitleImprovement`
  - Follow existing task pattern

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Task runs when enabled

  **Parallelizable:** NO (depends on 5.1)
  **Commit:** YES
  - Message: `feat(librarian): add experience title improvement maintenance task`

---

### Phase 3: Message Insight Extraction

- [ ] 3.1 Create message insight extraction task

  **What to do:**
  - Create `src/services/librarian/maintenance/message-insight-extraction.ts`
  - Implement `runMessageInsightExtraction()` function
  - Find experiences with linked messages (via episodeId)
  - Call LLM to extract decisions, problems, solutions
  - Create knowledge entries for insights
  - Create relations linking insights to source experience

  **References:**
  - `src/services/librarian/maintenance/tool-tag-assignment.ts` - LLM task pattern
  - `src/db/repositories/knowledge.ts` - Knowledge creation
  - `src/db/repositories/tags.ts` - Relation creation

  **LLM Prompt:**

  ```
  Analyze this conversation and extract:
  1. DECISIONS: Choices made (format: "Decided to X because Y")
  2. PROBLEMS: Issues identified (format: "Problem: X caused by Y")
  3. SOLUTIONS: How problems were solved (format: "Fixed X by doing Y")
  4. KEY_LEARNINGS: Important discoveries

  Return JSON with arrays for each type, including confidence (0-1).
  ```

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Knowledge entries created with proper category
  - [ ] Relations created linking to source experience

  **Parallelizable:** YES (with Phase 5)
  **Commit:** NO (groups with 3.2)

---

- [ ] 3.2 Register task in MaintenanceOrchestrator

  **What to do:**
  - Import and register `runMessageInsightExtraction`
  - Follow existing task pattern

  **Acceptance Criteria:**
  - [ ] `bun run typecheck` passes
  - [ ] Task runs when enabled

  **Parallelizable:** NO (depends on 3.1)
  **Commit:** YES
  - Message: `feat(librarian): add message insight extraction maintenance task`

---

## Testing

- [ ] Unit tests for message summarization helper
- [ ] Unit tests for each maintenance task
- [ ] Integration test for end-to-end episode enrichment
- [ ] Verify all tasks can be disabled via config

**Acceptance Criteria:**

- [ ] `npm test -- --run` passes (all tests)
- [ ] New tests added for new functionality
- [ ] 80%+ coverage for new code

**Commit:** YES

- Message: `test: add tests for episode message LLM enrichment`

---

## Configuration Summary

```typescript
// Added to MaintenanceConfig
messageInsightExtraction: {
  enabled: false,  // Disabled by default (LLM cost)
  minMessages: 3,
  confidenceThreshold: 0.7,
  maxEntriesPerRun: 50,
  focusAreas: ['decisions', 'facts', 'rules'],
},
messageRelevanceScoring: {
  enabled: false,  // Disabled by default (LLM cost)
  maxMessagesPerRun: 200,
  thresholds: { high: 0.8, medium: 0.5, low: 0 },
},
experienceTitleImprovement: {
  enabled: false,  // Disabled by default (LLM cost)
  maxEntriesPerRun: 100,
  onlyGenericTitles: true,
  genericTitlePattern: '^Episode:\\s',
},

// Added to CaptureConfig (capture/types.ts)
messageEnrichment: {
  summarization: {
    enabled: true,  // Enabled by default (real-time value)
    maxMessages: 50,
    maxContentChars: 2000,
    fallbackToTruncated: true,
  },
},
```

---

## Success Criteria

- [ ] Experiences include conversation summaries instead of truncated messages
- [ ] Librarian extracts actionable insights from message threads
- [ ] Message relevance scoring reduces noise in queries
- [ ] Experience titles are descriptive and searchable
- [ ] All LLM features are configurable and can be disabled
- [ ] No increase in episode completion latency (async where needed)
- [ ] Build and type check pass
- [ ] Tests pass

---

**Status**: READY FOR IMPLEMENTATION
**Created**: 2026-01-25
**Author**: Claude (Prometheus Planner)
