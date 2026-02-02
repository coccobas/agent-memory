# Learnings - Topic Hierarchy Implementation

_This file tracks conventions, patterns, and wisdom accumulated during implementation._

---

## [2026-02-02T12:04:14.660Z] Session Start

### Plan Overview

- **Objective**: Introduce Topic as first-class entity separating temporal context (sessions) from work context (topics)
- **Total Tasks**: 14 tasks across 5 waves
- **Architecture**: Session (temporal) → Topic (work context) → Episode (task)
- **Key Features**: LLM extraction, embedding-based auto-resume, backward compatibility

### Initial Context

- Current coupling at `memory_quickstart.ts:504` - episode inherits session name
- 79 files reference `sessionId` in episode context
- Existing infrastructure: boundary-detector.ts, extraction.service.ts, embedding service
- Episode schema has `parentEpisodeId`, `depth` - patterns to follow

### Critical Constraints

- Topics don't complete (ongoing work contexts)
- No topic hierarchies (topics within topics)
- Keep sessionId for backward compatibility
- Don't break existing 14 episode test files
- topicId is nullable (not required)

---

## [2026-02-02T14:30:00.000Z] Task 1 Complete: Test File Created

### Test Coverage Summary

Created `tests/unit/topics.repo.test.ts` with 35 comprehensive test cases:

**Create Tests (5 tests)**

- Minimal fields (scopeType, name)
- All fields (with projectId, description, status, metadata, createdBy)
- Default status to 'active'
- Default isActive to true
- Project scope creation

**GetById Tests (3 tests)**

- Get by ID (found)
- Non-existent ID (returns undefined)
- Deactivated topic retrieval

**List Tests (7 tests)**

- List all active topics
- Filter by projectId
- Filter by status
- Exclude inactive by default
- Include inactive with flag
- Pagination support

**Update Tests (7 tests)**

- Update name
- Update description
- Update status
- Update metadata
- Update multiple fields
- Non-existent topic (returns undefined)
- updatedAt timestamp changes

**Deactivate Tests (4 tests)**

- Soft delete (isActive = false)
- Exclude from list after deactivate
- Non-existent topic (returns false)
- Idempotent deactivate

**FindSimilar Tests (5 tests)**

- Return topics above threshold
- Empty array for no matches
- Exclude inactive topics
- Handle empty query
- Respect threshold parameter

**Edge Cases (4 tests)**

- Empty description
- Null description
- Complex metadata (nested objects, arrays)
- Special characters in name
- Very long name (500 chars)

### Test Status: RED Phase ✅

All 35 tests FAIL as expected:

```
35 failed | 0 passed
Error: Cannot read properties of undefined (reading 'create')
```

Reason: ITopicRepository interface and implementation don't exist yet (Task 4).

### Test Patterns Followed

- Matches episodes.repo.test.ts structure exactly
- Uses test helpers: setupTestDb, cleanupTestDb, createTestRepositories, createTestProject
- Follows AAA pattern (Arrange-Act-Assert)
- Comprehensive edge case coverage
- Placeholder tests for embedding-based findSimilar (not implemented yet)

### Next Steps

Task 4 will:

1. Create ITopicRepository interface in repositories.ts
2. Implement TopicRepository class
3. All 35 tests should pass (GREEN phase)

## [2026-02-02T13:10:00.000Z] Topics Schema Implementation (Wave 1, Task 1)

### Schema Design

**SQLite & PostgreSQL Variants Created**

- `src/db/schema/topics.ts` - SQLite implementation
- `src/db/schema/postgresql/topics.ts` - PostgreSQL variant
- Both follow episodes.ts pattern exactly

**Field Structure**

- `id` (text, PK)
- `projectId` (FK to projects, cascade delete)
- `name` (required text)
- `description` (optional text)
- `status` (enum: 'active' | 'inactive', default: 'active')
- `embedding` (JSON array for semantic similarity)
- `metadata` (JSON for extensibility)
- `createdAt`, `updatedAt` (timestamps with defaults)
- `createdBy` (audit trail)
- `isActive` (boolean flag, default: true)

**Indexes**

- `idx_topics_project` - for project-scoped queries
- `idx_topics_name` - for name-based lookups
- `idx_topics_status` - for filtering active/inactive

**Type Exports**

- `Topic` - inferred from table select
- `NewTopic` - inferred from table insert

### Key Decisions

1. **Status Enum**: Only 'active' | 'inactive' (no 'completed')
   - Topics are ongoing work contexts, not tasks
   - Episodes complete, topics persist

2. **No Hierarchy**: No parentTopicId field
   - Topics don't nest within topics
   - Simplifies schema and queries

3. **Embedding Support**: JSON field for vector storage
   - Enables semantic similarity search
   - Supports auto-resume via embedding comparison
   - Can be null initially, populated by LLM extraction

4. **Metadata Field**: JSON for future extensibility
   - Stores topic-specific attributes
   - Avoids schema migrations for new fields

5. **Backward Compatibility**: No breaking changes
   - Episodes still have sessionId
   - Topics are optional in episodes (topicId nullable)
   - Existing workflows unaffected

### Implementation Notes

- Followed episodes.ts pattern for consistency
- PostgreSQL variant uses `timestamp(..., { withTimezone: true })` and `jsonb`
- SQLite variant uses `text()` for JSON and timestamps
- Both variants export identical types for cross-database compatibility
- Test file validates type exports and column presence

### Files Created/Modified

✅ Created:

- `src/db/schema/topics.ts`
- `src/db/schema/postgresql/topics.ts`
- `src/db/schema/__tests__/topics.test.ts`

✅ Modified:

- `src/db/schema/index.ts` - added topics export
- `src/db/schema/postgresql/index.ts` - added topics export

### Verification

✅ Build passes: `bun run build`
✅ No TypeScript errors
✅ Schema types compile correctly
✅ Indexes properly defined
✅ Both SQLite and PostgreSQL variants match

### Blockers Resolved

None - clean implementation following established patterns.

---

## [2026-02-02T13:11:33.000Z] Task 2 Complete: Add topicId FK to Episodes Schema

### Implementation Summary

Successfully added `topicId` nullable foreign key to episodes table (both SQLite and PostgreSQL).

**Files Modified:**

- `src/db/schema/episodes.ts` - Added topicId field and index
- `src/db/schema/postgresql/episodes.ts` - Added topicId field and index
- `src/db/migrations/0042_add_topics.sql` - Created topics table migration
- `src/db/migrations/0043_add_topic_id_to_episodes.sql` - Added topicId FK migration

### Key Decisions

1. **Nullable topicId**: Made topicId nullable to maintain backward compatibility with existing episodes
2. **onDelete: 'set null'**: Used set null on delete to preserve episode history when topics are deleted
3. **Index placement**: Added `idx_episodes_topic` after `idx_episodes_session` for consistency
4. **Migration strategy**: Created separate migrations for topics table (0042) and topicId FK (0043) to maintain proper ordering

### Technical Notes

- Drizzle-kit generated full schema migration initially; had to create incremental migration instead
- Topics table required migration 0042 before episodes migration 0043 could reference it
- All 18 existing episode tests pass with new schema - backward compatibility verified
- Build passes successfully with new schema changes

### Backward Compatibility

✅ Verified: All existing episode tests pass without modification
✅ Verified: sessionId remains for backward compatibility
✅ Verified: topicId is nullable - existing workflows unaffected
