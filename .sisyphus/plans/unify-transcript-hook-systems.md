# Unify Transcript and Hook Systems

## Context

### Original Request

Consolidate the dual-storage architecture for conversation messages into a single, unified system. Currently we have:

1. **Hook System** - File-based ingestion storing in `conversation_messages`
2. **Transcript System** - IDE reader-based storage in `ide_transcript_messages`

### Interview Summary

**Key Discussions**:

- Hook system is best for enforcement (pre-tool-use) and heavy async processing (LLM extraction)
- Transcript system is best for real-time access, episode context, and archival
- Need to eliminate duplicate message storage
- Must maintain backward compatibility for IDEs without transcript readers

**Research Findings**:

- `session-end-command.ts` runs full processing pipeline: ingest → link → observe → behavior → librarian
- `transcript-service.ts` imports on quickstart, seals on session end
- Episode-message linking currently uses `conversation_messages`
- Processing pipeline (observe, librarian) reads from `conversation_messages`

---

## Work Objectives

### Core Objective

Make `ide_transcript_messages` the primary source for conversation data, with `conversation_messages` as fallback for IDEs without readers.

### Concrete Deliverables

- `UnifiedMessageSource` service that abstracts storage location
- Schema additions to `ide_transcript_messages` for episode linking and relevance scoring
- Updated episode handlers using unified source
- Processing pipeline triggered on transcript seal
- Documentation for migration and deprecation

### Definition of Done

- [x] `ide_transcript_messages` is primary source for all new sessions
- [x] Episode `get_messages` returns messages from transcript when available
- [x] Session end processing receives messages from transcript
- [x] No duplicate message storage for sessions with transcript
- [x] All existing tests pass (9,487 tests passed via vitest)

### Must Have

- Backward compatibility for IDEs without transcript readers
- Single source of truth for message storage
- Episode-message linking works with transcripts
- Processing pipeline connected to transcript system

### Must NOT Have (Guardrails)

- Do NOT delete `conversation_messages` table or existing data
- Do NOT remove file-based `ingestTranscript` (keep as fallback)
- Do NOT modify pre-tool-use hook enforcement logic
- Do NOT block conversation with heavy processing (keep async)

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **User wants tests**: TDD for new service, tests-after for refactors
- **Framework**: bun test

### Test Coverage Required

- Unit tests for `UnifiedMessageSource` service
- Unit tests for new repository methods
- Integration tests for session end flow
- E2E test for full session lifecycle

---

## Task Flow

```
Phase 1 (Schema) ─────┐
                      ├──► Phase 2 (Repository) ──► Phase 3 (Unified Service)
                      │                                        │
                      │                                        ▼
                      │                            ┌──── Phase 4 (Episode)
                      │                            │
                      │                            ▼
                      └──────────────────────► Phase 5 (Hooks)
                                                   │
                                                   ▼
                                             Phase 6 (Processing Trigger)
                                                   │
                                                   ▼
                                             Phase 7 (Deprecation)
```

## Parallelization

| Group | Tasks | Reason                                                  |
| ----- | ----- | ------------------------------------------------------- |
| A     | 1, 2  | Schema changes independent                              |
| B     | 4, 5  | Can work on episode and hooks in parallel after Phase 3 |

| Task | Depends On | Reason                              |
| ---- | ---------- | ----------------------------------- |
| 3    | 1, 2       | Needs schema and repository methods |
| 4, 5 | 3          | Need unified service                |
| 6    | 4, 5       | Needs both episode and hook updates |
| 7    | 6          | Documentation after implementation  |

---

## TODOs

### Phase 1: Schema Enhancement ✅

- [x] 1. Add episode linking fields to `ide_transcript_messages`

  **What to do**:
  - Add `episode_id` column (optional FK to episodes table)
  - Add index on `episode_id` for efficient queries

  **Must NOT do**:
  - Don't make `episode_id` required (messages can exist without episodes)
  - Don't modify existing columns

  **Parallelizable**: YES (with task 2)

  **References**:
  - `src/db/schema/ide-transcripts.ts` - Current schema definition
  - `src/db/schema/conversations.ts:38-40` - Pattern for episode_id column in conversation_messages
  - `src/db/migrations/0034_add_episode_id_to_messages.sql` - Example migration for episode_id

  **Acceptance Criteria**:
  - [ ] `episode_id` column added to schema
  - [ ] Migration file created: `0037_add_episode_id_to_transcript_messages.sql`
  - [ ] `bun test src/db` → PASS

  **Commit**: YES
  - Message: `feat(schema): add episode_id to ide_transcript_messages`
  - Files: `src/db/schema/ide-transcripts.ts`, `src/db/migrations/0037_*.sql`

- [x] 2. Add relevance scoring fields to `ide_transcript_messages`

  **What to do**:
  - Add `relevance_score` (real, nullable)
  - Add `relevance_category` (text, nullable)
  - Add `relevance_scored_at` (text/timestamp, nullable)

  **Must NOT do**:
  - Don't add constraints that would fail for existing rows

  **Parallelizable**: YES (with task 1)

  **References**:
  - `src/db/schema/conversations.ts:41-43` - Pattern for relevance columns
  - `src/db/migrations/0035_add_message_relevance.sql` - Example migration

  **Acceptance Criteria**:
  - [ ] Relevance columns added to schema
  - [ ] Migration file created (can combine with task 1 migration)
  - [ ] `bun test src/db` → PASS

  **Commit**: YES (can combine with task 1)
  - Message: `feat(schema): add relevance scoring to ide_transcript_messages`

---

### Phase 2: Repository Enhancement ✅

- [x] 3. Add `linkMessagesToEpisode` to IDE transcript repository

  **What to do**:
  - Implement method matching `conversation.ts` signature
  - Update messages in time range to set `episode_id`
  - Return count of linked messages

  **Must NOT do**:
  - Don't overwrite existing episode links without checking

  **Parallelizable**: NO (depends on Phase 1)

  **References**:
  - `src/db/repositories/ide-transcripts.ts` - Target file
  - `src/db/repositories/conversations.ts:197-220` - Pattern implementation
  - `src/core/interfaces/repositories/ide-transcripts.ts` - Interface to extend

  **Acceptance Criteria**:
  - [ ] Method added to repository
  - [ ] Interface updated in `src/core/interfaces/repositories/ide-transcripts.ts`
  - [ ] Unit test: link messages by time range → correct count
  - [ ] `bun test src/db/repositories` → PASS

  **Commit**: YES
  - Message: `feat(repo): add linkMessagesToEpisode to IDE transcript repository`

- [x] 4. Add `getMessagesByEpisode` to IDE transcript repository

  **What to do**:
  - Query messages where `episode_id` matches
  - Return ordered by timestamp
  - Support pagination (limit, offset)

  **Parallelizable**: YES (with task 3 after schema done)

  **References**:
  - `src/db/repositories/ide-transcripts.ts:165-180` - Existing `getMessages` pattern
  - `src/db/repositories/conversations.ts:180-195` - Similar query pattern

  **Acceptance Criteria**:
  - [ ] Method added to repository
  - [ ] Interface updated
  - [ ] Unit test: retrieve messages by episode ID
  - [ ] `bun test src/db/repositories` → PASS

  **Commit**: YES
  - Message: `feat(repo): add getMessagesByEpisode to IDE transcript repository`

---

### Phase 3: Unified Message Source Service ✅

- [x] 5. Create `UnifiedMessageSource` service interface

  **What to do**:
  - Create new file `src/services/unified-message-source.ts`
  - Define interface:
    ```typescript
    interface UnifiedMessageSource {
      getMessagesForSession(sessionId: string, options?: {...}): Promise<Message[]>;
      getMessagesForEpisode(episodeId: string): Promise<Message[]>;
      getMessagesInTimeRange(sessionId: string, start: string, end: string): Promise<Message[]>;
      linkMessagesToEpisode(params: {...}): Promise<number>;
    }
    ```

  **Must NOT do**:
  - Don't implement yet, just interface and types

  **Parallelizable**: NO (depends on Phase 2)

  **References**:
  - `src/services/episode/index.ts` - Service pattern
  - `src/core/interfaces/repositories/conversations.ts` - Message types

  **Acceptance Criteria**:
  - [ ] Interface file created
  - [ ] Types exported
  - [ ] TypeScript compiles: `npx tsc --noEmit`

  **Commit**: YES
  - Message: `feat(service): add UnifiedMessageSource interface`

- [x] 6. Implement transcript-first strategy

  **What to do**:
  - Create factory function `createUnifiedMessageSource(deps)`
  - Implement each method with transcript-first, conversation-fallback logic:
    1. Check for transcript by session ID
    2. If found, query `ide_transcript_messages`
    3. If not found, fall back to `conversation_messages`
  - Wire into context factory

  **Must NOT do**:
  - Don't modify existing repositories
  - Don't delete any data

  **Parallelizable**: NO (depends on task 5)

  **References**:
  - `src/core/factory/context-wiring.ts:266-278` - Service wiring pattern
  - `src/db/repositories/ide-transcripts.ts` - Transcript repo methods
  - `src/db/repositories/conversations.ts` - Conversation repo methods

  **Acceptance Criteria**:
  - [ ] Implementation complete
  - [ ] Unit tests: transcript found → uses transcript
  - [ ] Unit tests: transcript not found → falls back to conversation
  - [ ] Service wired into context
  - [ ] `bun test src/services/unified-message-source` → PASS

  **Commit**: YES
  - Message: `feat(service): implement UnifiedMessageSource with transcript-first strategy`

---

### Phase 4: Episode Handler Updates ✅

- [x] 7. Update episode service to use unified message source

  **What to do**:
  - Inject `UnifiedMessageSource` into episode service
  - Update `getMessagesByEpisode` to use unified source
  - Update `whatHappened` to use unified source

  **Must NOT do**:
  - Don't remove direct repo access (may still be needed)
  - Don't change episode creation/completion logic

  **Parallelizable**: YES (with task 8 after Phase 3)

  **References**:
  - `src/services/episode/index.ts:481-483` - Current message retrieval
  - `src/services/episode/index.ts:520-550` - whatHappened implementation

  **Acceptance Criteria**:
  - [ ] Episode service uses unified source
  - [ ] Existing episode tests pass
  - [ ] New test: messages retrieved from transcript when available
  - [ ] `bun test src/services/episode` → PASS

  **Commit**: YES
  - Message: `refactor(episode): use UnifiedMessageSource for message retrieval`

- [x] 8. Update episode MCP handlers

  **What to do**:
  - Update `get_messages` action to use unified source
  - Ensure `source` field in response indicates actual source used

  **Parallelizable**: YES (with task 7)

  **References**:
  - `src/mcp/handlers/episodes.handler.ts:417` - get_messages handler
  - `src/mcp/handlers/episodes.handler.ts:484` - Message retrieval

  **Acceptance Criteria**:
  - [ ] Handler uses unified source
  - [ ] Response includes `source: 'transcript' | 'conversation'`
  - [ ] MCP integration tests pass

  **Commit**: YES
  - Message: `refactor(mcp): use UnifiedMessageSource in episode handlers`

---

### Phase 5: Hook System Integration ✅

- [x] 9. Refactor session-end-command to check for transcript

  **What to do**:
  - At start of `runSessionEndCommand`, check if transcript exists for session
  - If transcript has messages, skip `ingestTranscript`
  - Get messages from transcript for processing

  **Must NOT do**:
  - Don't remove `ingestTranscript` function
  - Don't fail if transcript check fails (fall back to file)

  **Parallelizable**: NO (depends on Phase 3)

  **References**:
  - `src/commands/hook/session-end-command.ts:55-88` - Current ingestion
  - `src/db/repositories/ide-transcripts.ts:48-55` - getByIDESession method

  **Acceptance Criteria**:
  - [ ] Transcript check added before file ingestion
  - [ ] File ingestion skipped when transcript has messages
  - [ ] Fallback to file when no transcript
  - [ ] Integration test: session end with transcript → no file read

  **Commit**: YES
  - Message: `refactor(hooks): use transcript system when available in session-end`

- [x] 10. Update episode-message backfill in hooks

  **What to do**:
  - Use unified message source for backfill
  - Link episodes to transcript messages when available

  **Parallelizable**: NO (depends on task 9)

  **References**:
  - `src/commands/hook/session-end-command.ts:90-143` - Current backfill logic

  **Acceptance Criteria**:
  - [ ] Backfill uses unified source
  - [ ] Episodes linked to transcript messages
  - [ ] Existing behavior preserved for conversation fallback

  **Commit**: YES
  - Message: `refactor(hooks): use UnifiedMessageSource for episode backfill`

- [x] 11. Update librarian session end to use transcript

  **What to do**:
  - In `session-end-command.ts`, pass messages from unified source to librarian
  - Update `librarianService.onSessionEnd` call

  **Parallelizable**: NO (depends on task 9)

  **References**:
  - `src/commands/hook/session-end-command.ts:290-375` - Librarian call
  - `src/services/librarian/session-lifecycle.ts` - Session end processing

  **Acceptance Criteria**:
  - [ ] Librarian receives messages from unified source
  - [ ] Processing works with transcript messages
  - [ ] `bun test src/services/librarian` → PASS

  **Commit**: YES
  - Message: `refactor(hooks): pass unified messages to librarian on session end`

---

### Phase 6: Processing Trigger on Transcript Seal ✅

- [x] 12. Add processing flag to session metadata

  **What to do**:
  - Add `processingTriggeredAt` field to session metadata
  - Use to prevent double processing (hook + MCP)

  **Must NOT do**:
  - Don't modify session schema (use metadata JSON)

  **Parallelizable**: NO (depends on Phase 5)

  **References**:
  - `src/db/schema/sessions.ts` - Session schema with metadata
  - `src/db/repositories/sessions.ts` - Session update methods

  **Acceptance Criteria**:
  - [ ] Metadata update working
  - [ ] Check for existing flag before processing

  **Commit**: YES
  - Message: `feat(session): add processing flag to prevent double processing`

- [x] 13. Trigger processing on transcript seal in MCP

  **What to do**:
  - In `scopes.handler.ts` after transcript seal, trigger processing
  - Check processing flag first
  - Call librarian `onSessionEnd` with transcript messages

  **Must NOT do**:
  - Don't block the session end response (fire async)
  - Don't process if already processed by hook

  **Parallelizable**: NO (depends on task 12)

  **References**:
  - `src/mcp/handlers/scopes.handler.ts:399-429` - Transcript seal code
  - `src/services/librarian/session-lifecycle.ts` - onSessionEnd method

  **Acceptance Criteria**:
  - [ ] Processing triggered on seal
  - [ ] Double processing prevented
  - [ ] Async execution (doesn't block response)

  **Commit**: YES
  - Message: `feat(mcp): trigger processing pipeline on transcript seal`

- [x] 14. Update hook to check processing flag

  **What to do**:
  - In `session-end-command.ts`, check if MCP already triggered processing
  - Skip if already processed

  **Parallelizable**: NO (depends on task 13)

  **References**:
  - `src/commands/hook/session-end-command.ts:145-375` - Processing pipeline

  **Acceptance Criteria**:
  - [ ] Hook checks processing flag
  - [ ] Skips processing if already done
  - [ ] Falls back to full processing if flag missing

  **Commit**: YES
  - Message: `refactor(hooks): skip processing if MCP already triggered`

---

### Phase 7: Deprecation and Documentation ✅

- [x] 15. Mark conversation_messages approach as legacy

  **What to do**:
  - Add JSDoc `@deprecated` notices to conversation repository methods
  - Add comment explaining migration path

  **Parallelizable**: YES (with task 16)

  **References**:
  - `src/db/repositories/conversations.ts` - Target file

  **Acceptance Criteria**:
  - [ ] Deprecation notices added
  - [ ] IDE shows deprecation warnings

  **Commit**: YES
  - Message: `docs: mark conversation_messages as legacy`

- [x] 16. Update documentation

  **What to do**:
  - Document new architecture in `docs/guides/hooks.md` or similar
  - Add migration guide for existing deployments

  **Parallelizable**: YES (with task 15)

  **References**:
  - `docs/guides/hooks.md` - Hooks documentation

  **Acceptance Criteria**:
  - [ ] Architecture documented
  - [ ] Migration path explained

  **Commit**: YES
  - Message: `docs: document transcript/hook unification`

---

## Commit Strategy

| After Task | Message                                                             | Files                     | Verification                    |
| ---------- | ------------------------------------------------------------------- | ------------------------- | ------------------------------- |
| 1-2        | `feat(schema): add episode_id and relevance to transcript messages` | schema, migration         | `bun test src/db`               |
| 3-4        | `feat(repo): add episode linking methods to transcript repo`        | repository, interface     | `bun test src/db/repositories`  |
| 5-6        | `feat(service): implement UnifiedMessageSource`                     | new service, context      | `bun test src/services`         |
| 7-8        | `refactor(episode): use UnifiedMessageSource`                       | episode service, handlers | `bun test src/services/episode` |
| 9-11       | `refactor(hooks): integrate transcript system`                      | session-end-command       | integration tests               |
| 12-14      | `feat: coordinate processing between hook and MCP`                  | handlers, hooks           | e2e tests                       |
| 15-16      | `docs: deprecation and migration guide`                             | docs, jsdoc               | manual review                   |

---

## Success Criteria

### Verification Commands

```bash
bun test                    # All tests pass
bun run build               # Build succeeds
bun run typecheck           # No type errors
```

### Final Checklist

- [x] `ide_transcript_messages` is primary source for new sessions
- [x] Episode `get_messages` returns transcript data when available
- [x] Processing pipeline uses transcript messages
- [x] No duplicate storage for sessions with transcripts
- [x] File-based fallback works for IDEs without readers
- [x] Double processing prevented
- [x] All existing tests pass (9,487 tests passed via vitest)
- [x] Documentation updated
