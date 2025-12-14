# Agent Memory - Code Review

**Reviewed:** December 14, 2025
**Version:** 0.8.3
**Reviewer:** Claude Code

---

## Fix History

| Date | Issue | Fix Applied |
|------|-------|-------------|
| 2025-12-14 | Variable shadowing (`useFts5`) | Removed redundant inner declaration in `query.service.ts` |
| 2025-12-14 | Duplicate comment block | Removed duplicate section header at lines 95-97 |
| 2025-12-14 | N+1 query in FTS5 path | Added batch rowid lookup with `rowidMap` before loop |
| 2025-12-14 | Full cache clear on memory pressure | Implemented partial LRU eviction in `memory-coordinator.ts` |
| 2025-12-14 | No rate limiting on MCP handlers | Added sliding window rate limiter (`rate-limiter.ts`) with per-agent and global limits |
| 2025-12-14 | Limited API key pattern detection | Expanded patterns to cover AWS, GitHub, Stripe, Google, Slack, Discord, and 15+ services |
| 2025-12-14 | Hardcoded distance metric | Made configurable via `AGENT_MEMORY_DISTANCE_METRIC` env var in `vector.service.ts` |
| 2025-12-14 | Size estimation fallback | Improved from 100 bytes to 2KB with type-specific handling in `lru-cache.ts` |
| 2025-12-14 | Recursive reconnection | Converted to iterative approach with for-loop in `connection.ts` |
| 2025-12-14 | Magic number thresholds | Extracted to `src/utils/constants.ts` with named constants |
| 2025-12-14 | No cascade delete policies | Added explicit `onDelete: 'cascade'` and `onDelete: 'set null'` to foreign keys in `schema.ts` |

---

## Executive Summary

Agent Memory is a well-architected MCP (Model Context Protocol) server providing persistent, structured memory capabilities for AI agents. The codebase demonstrates strong software engineering practices with a clean layered architecture, comprehensive type safety, and thoughtful attention to performance optimization. This review identifies both strengths and areas for improvement.

**Overall Assessment:** The code quality is **high**, with clear separation of concerns, good TypeScript practices, and solid test coverage goals. The architecture is production-ready with appropriate safeguards for multi-agent environments.

---

## 1. Architecture & Design

### Strengths

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Layered Architecture** | Excellent | Clear separation: MCP Server → Handlers → Services → Repositories → Database |
| **Type Safety** | Excellent | Comprehensive TypeScript with Drizzle ORM type inference |
| **Singleton Management** | Good | Appropriate use of singletons for DB connection, vector service, memory coordinator |
| **Scope Inheritance** | Excellent | Well-designed 4-level hierarchy (global → org → project → session) |

### Design Patterns Used

1. **Repository Pattern** - Clean data access abstraction (`src/db/repositories/`)
2. **Singleton Pattern** - Database connection, services
3. **Factory Pattern** - Component logger creation
4. **Observer Pattern** - Embedding hooks for async embedding generation
5. **Strategy Pattern** - Multiple embedding providers, distance metrics

### Areas for Improvement

1. **Circular Dependencies Risk** - `query.service.ts` imports from `embedding.service.ts` and `vector.service.ts`, which may create implicit coupling
2. **Service Layer Coupling** - Some services directly access repositories instead of going through a unified interface

---

## 2. Code Quality Analysis

### 2.1 Query Service (`src/services/query.service.ts`)

**Strengths:**
- Sophisticated LRU caching with selective invalidation
- Hybrid scoring (semantic + traditional)
- FTS5 full-text search with LIKE fallback
- Comprehensive scope chain resolution

**Issues Identified:**

```typescript
// Line 1259: Variable shadowing
const useFts5 = params.useFts5 === true && search;
// This variable is already declared at line 1096
```

```typescript
// Lines 95-97: Duplicated comment block
// =============================================================================
// QUERY RESULT CACHE
// =============================================================================
// The comment appears twice consecutively
```

**Potential Performance Issue:**
```typescript
// Lines 1317-1321: N+1 query pattern inside loop
const rowidQuery = getPreparedStatement(
  `SELECT rowid FROM ${type === 'tools' ? 'tools' : ...} WHERE id = ?`
);
// This executes per entry when FTS5 is used - could batch this
```

### 2.2 Vector Service (`src/services/vector.service.ts`)

**Strengths:**
- Good input validation with `validateIdentifier()` preventing SQL injection
- Proper dimension validation for embeddings
- Graceful error handling with expected vs unexpected error classification

**Issues Identified:**

```typescript
// Line 227: Unnecessary dummy vector creation
const dummyVector = Array(embedding.length).fill(0);
// Created just for filter-only queries - consider if LanceDB has a filter-only API
```

**Recommendation:** The `distanceToSimilarity` method correctly handles different distance metrics, but the metric is hardcoded to 'cosine'. Consider making this configurable.

### 2.3 LRU Cache (`src/utils/lru-cache.ts`)

**Strengths:**
- Clean implementation with TTL support
- Memory pressure detection using `process.memoryUsage()`
- Batch eviction capability

**Minor Issue:**
```typescript
// Line 132-136: JSON.stringify for size estimation
private estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 100; // Fallback estimate
  }
}
// This can be expensive for large objects and may throw for circular references
// The fallback of 100 bytes may significantly underestimate actual size
```

### 2.4 Memory Coordinator (`src/utils/memory-coordinator.ts`)

**Strengths:**
- Centralized memory management across all caches
- Priority-based eviction (lowest priority first)
- Automatic periodic monitoring with `unref()` to not block process exit

**Potential Issue:**
```typescript
// Line 159: Complete cache clear on pressure
cache.clear();
// This clears entire caches rather than partial eviction
// Could be more granular to preserve some cached data
```

### 2.5 Sanitization Utility (`src/utils/sanitize.ts`)

**Strengths:**
- Comprehensive API key pattern matching (OpenAI, JWT, Bearer tokens)
- Recursive object sanitization
- Keeps first 3 characters for debugging context

**Security Consideration:**
```typescript
// The patterns may not catch all sensitive data formats
// Consider adding patterns for:
// - AWS access keys (AKIA...)
// - GitHub tokens (ghp_...)
// - Stripe keys (sk_live_...)
```

### 2.6 Retry Utility (`src/utils/retry.ts`)

**Strengths:**
- Clean async retry with exponential backoff
- Configurable retry conditions
- Good documentation noting removal of sync version

**Good Practice Noted:**
```typescript
// Lines 51-64: Clear documentation explaining why sync retry was removed
// (Atomics.wait blocks the event loop)
```

---

## 3. Database Schema (`src/db/schema.ts`)

### Strengths

- Proper use of indexes for query performance
- Unique constraints preventing duplicates
- Append-only versioning for audit trails
- Comprehensive type exports

### Schema Design Quality

| Table | Indexing | Constraints | Overall |
|-------|----------|-------------|---------|
| tools | Excellent | Good | Excellent |
| guidelines | Excellent | Good | Excellent |
| knowledge | Excellent | Good | Excellent |
| entryTags | Good | Good | Good |
| fileLocks | Excellent | Good | Excellent |
| auditLog | Excellent | N/A | Excellent |

### Potential Issues

1. **Cascade Deletes Not Defined**
   ```typescript
   // Foreign key references use default behavior (RESTRICT)
   // Consider explicit ON DELETE CASCADE for some relationships
   projectId: text('project_id').references(() => projects.id)
   ```

2. **No Soft Delete for Some Tables**
   - `organizations`, `projects`, `sessions` don't have `isActive` flags
   - Could lead to orphaned data on hard deletes

---

## 4. Repository Pattern Implementation

### Tools Repository (`src/db/repositories/tools.ts`)

**Strengths:**
- Transaction wrapping for atomic operations
- Conflict detection within time window
- Fire-and-forget embedding generation
- Clean version management

**Minor Issue:**
```typescript
// Line 421-431: Empty catch block
void (async () => {
  try {
    const vectorService = getVectorService();
    await vectorService.removeEmbedding(id);
  } catch (error) {
    // Error already logged in vector service
  }
})();
// While documented, swallowing errors silently can hide issues
```

---

## 5. Security Analysis

### Positive Security Practices

| Practice | Implementation | Location |
|----------|----------------|----------|
| SQL Injection Prevention | Parameterized queries via Drizzle ORM | All repositories |
| Input Validation | Whitelist-based identifier validation | `vector.service.ts:31-43` |
| Sensitive Data Redaction | API key masking in logs | `sanitize.ts` |
| Permission Checks | Fine-grained access control | `permission.service.ts` |

### Security Recommendations

1. **Rate Limiting** - No rate limiting on MCP tool calls; consider adding for DoS protection

2. **Input Sanitization Enhancement**
   ```typescript
   // vector.service.ts:31 - Pattern is restrictive but good
   if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
   // Consider also validating maximum lengths consistently
   ```

3. **File Path Validation** - File locks accept arbitrary paths; consider path traversal protection

4. **Audit Log Completeness** - Ensure all security-relevant operations are logged

---

## 6. Performance Observations

### Optimizations Present

1. **LRU Cache** - Query results cached with 5-minute TTL
2. **Prepared Statement Cache** - Up to 100 statements cached
3. **Scope Chain Cache** - 10-minute TTL for scope resolution
4. **Batch Version Loading** - Efficient N+1 fix in query service
5. **WAL Mode** - SQLite configured for better concurrency

### Performance Concerns

1. **Scope Chain Resolution** - Database queries on every cache miss for session/project scopes
   ```typescript
   // query.service.ts:385-408 - Multiple DB calls to resolve hierarchy
   const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
   const project = db.select().from(projects).where(eq(projects.id, session.projectId)).get();
   ```

2. **Tag Filtering In-Memory** - Large datasets may suffer from memory pressure
   ```typescript
   // query.service.ts:462-497 - All tags loaded into memory for filtering
   ```

3. **JSON Serialization for Cache Keys** - `JSON.stringify` called on every query for cache key generation

### Recommendations

- Consider denormalizing scope hierarchy for faster resolution
- Implement database-level tag filtering for large datasets
- Use faster hashing for cache keys (e.g., object-hash library)

---

## 7. Error Handling

### Strengths

- Comprehensive error logging with context
- Graceful degradation (FTS5 → LIKE fallback)
- Automatic reconnection with exponential backoff

### Areas for Improvement

```typescript
// connection.ts:204-208 - Recursive reconnection could stack overflow
if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
  return attemptReconnect(options);
}
// While unlikely with MAX_ATTEMPTS=3, consider using iteration instead
```

```typescript
// query.service.ts:909 - Silent catch in recency score calculation
} catch {
  // ignore parse errors
}
// Should at least log at debug level
```

---

## 8. Code Style & Maintainability

### Positive Practices

- Consistent JSDoc comments on public functions
- Clear function naming (e.g., `invalidateCacheScope`, `resolveScopeChain`)
- Logical file organization
- Type exports co-located with schema definitions

### Style Inconsistencies

1. **Mixed Comment Styles**
   ```typescript
   // Some files use // for section headers
   /* Others use block comments */
   ```

2. **Unused Variables** (from ESLint disables observed)
   ```typescript
   // Lines like: eslint-disable-next-line @typescript-eslint/no-unused-vars
   // Consider removing unused parameters or using _ prefix convention
   ```

3. **Magic Numbers**
   ```typescript
   // query.service.ts:802
   return similarity >= 0.7; // Threshold: 0.7 similarity
   // Consider making this configurable
   ```

---

## 9. Testing Considerations

### Test Infrastructure

- Vitest configuration with 80% coverage threshold
- Comprehensive fixture setup
- Integration tests for repositories

### Recommended Additional Tests

1. **Edge Cases for Scope Inheritance**
   - Deep nesting (session → project → org → global)
   - Orphaned scopes (project without org)

2. **Concurrent Access Tests**
   - Multiple agents writing to same entry
   - File lock expiration race conditions

3. **Memory Pressure Tests**
   - Cache eviction under load
   - Memory coordinator priority-based eviction

---

## 10. Summary of Findings

### Critical Issues (0)
None identified - the code is production-ready.

### High Priority Improvements (3) - ALL FIXED

| Issue | Location | Recommendation | Status |
|-------|----------|----------------|--------|
| Variable shadowing | `query.service.ts:1259` | Rename inner `useFts5` variable | **FIXED** |
| N+1 query in FTS5 path | `query.service.ts:1317-1321` | Batch rowid lookups | **FIXED** |
| Complete cache clear on pressure | `memory-coordinator.ts:159` | Implement partial eviction | **FIXED** |

### Medium Priority Improvements (5) - ALL FIXED

| Issue | Location | Recommendation | Status |
|-------|----------|----------------|--------|
| Duplicate comments | `query.service.ts:95-97` | Remove duplicate | **FIXED** |
| Hardcoded distance metric | `vector.service.ts:77` | Make configurable | **FIXED** |
| Size estimation fallback | `lru-cache.ts:136` | Use more accurate default | **FIXED** |
| No rate limiting | MCP handlers | Add request throttling | **FIXED** |
| Cascade delete policy | `schema.ts` | Define explicit cascade behavior | **FIXED** |

### Low Priority Improvements (4) - ALL FIXED

| Issue | Recommendation | Status |
|-------|----------------|--------|
| Additional API key patterns | Add AWS, GitHub, Stripe patterns to sanitize.ts | **FIXED** |
| Recursive reconnection | Convert to iterative approach | **FIXED** |
| Magic number thresholds | Extract to constants/config | **FIXED** |
| Comment style consistency | Standardize section headers | Open |

---

## 11. Recommendations

### Immediate Actions - ALL COMPLETED
1. ~~Fix variable shadowing in `query.service.ts`~~ **DONE** - Removed redundant inner declaration
2. ~~Remove duplicate comment block~~ **DONE** - Removed duplicate at lines 95-97
3. ~~Add batch rowid lookup for FTS5 queries~~ **DONE** - Added batch query before loop with `rowidMap`

### Short-term Improvements - ALL COMPLETED
1. ~~Implement partial cache eviction instead of full clear~~ **DONE** - Added `evictUntilMemory()` to LRU cache, memory coordinator now uses partial eviction
2. ~~Add rate limiting to MCP handlers~~ **DONE** - Created `rate-limiter.ts` with sliding window algorithm, integrated into MCP server
3. ~~Expand API key pattern detection~~ **DONE** - Added 20+ patterns covering AWS, GitHub, Stripe, Google, Slack, Discord, Twilio, SendGrid, etc.

### Long-term Architectural Suggestions
1. Consider event sourcing for better audit trail
2. Evaluate using Redis for distributed caching in multi-node deployments
3. Add OpenTelemetry instrumentation for observability

---

## Appendix: Files Reviewed

| File | Lines | Assessment |
|------|-------|------------|
| `src/db/connection.ts` | 295 | Good |
| `src/db/schema.ts` | 704 | Excellent |
| `src/db/repositories/tools.ts` | 436 | Good |
| `src/services/query.service.ts` | 1727 | Good (minor issues) |
| `src/services/vector.service.ts` | 494 | Good |
| `src/services/validation.service.ts` | 407 | Good |
| `src/utils/lru-cache.ts` | 181 | Good |
| `src/utils/memory-coordinator.ts` | 304 | Good |
| `src/utils/sanitize.ts` | 155 | Good |
| `src/utils/retry.ts` | 90 | Excellent |

---

*This review was generated by Claude Code based on static code analysis. Runtime behavior and performance characteristics may differ in production environments.*
