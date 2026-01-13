# Agent-Memory Deep Bug Analysis Report

**Date:** 2026-01-13
**Total Issues Found:** 356
**Analysis Coverage:** 18 iterations across all codebase areas

---

## Executive Summary

Comprehensive security and stability analysis identified **356 potential bugs** ranging from critical security vulnerabilities to minor edge cases. Issues are categorized by severity and domain.

| Severity | Count | Action Required |
|----------|-------|-----------------|
| **CRITICAL** | 32 | Immediate fix required |
| **HIGH** | 91 | Fix before next release |
| **MEDIUM** | 180 | Schedule for sprint |
| **LOW** | 53 | Backlog |

### Analysis Categories

| Iteration | Focus Area | Issues Found |
|-----------|------------|--------------|
| 1-6 | Core (query, security, permissions, infrastructure) | 94 |
| 7 | Query pipeline stages | 12 |
| 8 | Utilities (crypto, validation, paths) | 13 |
| 9 | External integrations (Redis, OpenAI, etc) | 10 |
| 10 | Lifecycle (startup, shutdown, cleanup) | 17 |
| 11 | Test infrastructure | 18 |
| 12 | Schema/type definitions | 15 |
| 13a | API contracts and MCP handlers | 8 |
| 13b | Logging and observability | 14 |
| 13c | Algorithm complexity and performance | 10 |
| 14a | Concurrency and state management | 12 |
| 14b | Input validation edge cases | 20 |
| 14c | Error propagation and recovery | 10 |
| 15a | Type coercion and data flow | 10 |
| 15b | SQL construction and database safety | 6 |
| 15c | Configuration and environment handling | 13 |
| 16a | Resource management and cleanup | 16 |
| 16b | Async/await and promise patterns | 14 |
| 17a | External API integrations | 17 |
| 17b | Serialization and deserialization | 8 |
| 18a | Authorization and access control | 9 |
| 18b | CLI, cron, and remaining edge cases | 10 |

---

## CRITICAL Issues (P0)

### 1. Project Type Permission Bypass ✅ FIXED
- **File:** `src/services/permission.service.ts:413-415`
- **Issue:** Hardcoded `return true` for all project entry types
- **Impact:** Any agent can read/write ANY project without permission
- **Fix:** Remove hardcoded bypass, implement proper permission check
- **Status:** Fixed - removed hardcoded project bypass in check() method

### 2. LRU Cache totalBytes Corruption ✅ FIXED
- **File:** `src/utils/lru-cache.ts:44-103`
- **Issue:** Non-atomic counter updates during concurrent eviction
- **Impact:** Memory tracking corruption → OOM crash
- **Fix:** Use atomic operations or mutex for totalBytes
- **Status:** Fixed - added re-entrancy guard and negative bounds check

### 3. Embedding Cache Mutation ✅ FIXED
- **File:** `src/services/embedding.service.ts:329-442`
- **Issue:** Inconsistent copy-on-return pattern allows mutation of cached embeddings
- **Impact:** Silent data corruption in search results
- **Fix:** Always copy arrays when returning from cache
- **Status:** Fixed - now returns defensive copies

### 4. Prompt Injection in Query Decomposition ✅ FIXED
- **File:** `src/services/query-rewrite/decomposer.ts:103-131`
- **Issue:** User query interpolated directly into LLM prompt
- **Impact:** Arbitrary prompt injection, logic bypass
- **Fix:** Use structured prompting (JSON mode), escape user input
- **Status:** Fixed - user input now escaped

### 5. Prompt Injection in HyDE ✅ FIXED
- **File:** `src/services/query-rewrite/hyde.ts:29-59`
- **Issue:** Same as #4, user query not escaped
- **Impact:** Information disclosure, retrieval bypass
- **Fix:** Escape all user inputs in prompts
- **Status:** Fixed - user input now escaped

### 6. Migration 0005 Data Loss Risk ✅ FIXED
- **File:** `src/db/migrations/0005_add_task_decomposition.sql`
- **Issue:** DROP TABLE without backup, no atomic recreation
- **Impact:** Data loss if migration fails mid-execution
- **Fix:** Add backup/restore pattern, use ALTER TABLE
- **Status:** Fixed - explicit column mapping in INSERT ensures schema match

### 7. Message Index Race Condition ✅ FIXED
- **File:** `src/db/repositories/conversations.ts:219-259`
- **Issue:** Non-atomic MAX → INSERT for message ordering
- **Impact:** Duplicate indices, corrupted conversation history
- **Fix:** Use transaction or database sequence
- **Status:** Fixed - added unique index + retry logic on constraint violation

### 8. Experience Score Race Condition ✅ FIXED
- **File:** `src/db/repositories/experiences.ts:617-679`
- **Issue:** Non-atomic read-modify-write for confidence scores
- **Impact:** Lost updates, incorrect feedback metrics
- **Fix:** Use atomic increments or row-level locking
- **Status:** Fixed - now uses SQL atomic increment expressions

---

## HIGH Issues (P1)

### Security

| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 9 | Rate limit bypass when disabled | `rate-limiter-core.ts:104-110` | DoS vulnerability | ✅ FIXED |
| 10 | Permission cache race condition | `permission.service.ts:616-673` | Stale permissions for 30s | ✅ FIXED |
| 11 | File lock expire-and-insert race | `file_locks.ts:79-118` | Permanent lock on NULL expiry | ✅ FIXED |
| 12 | API key exposure in logs | `hierarchical-summarization.service.ts:97-100` | Credential leak | ✅ VERIFIED SAFE |
| 13 | Unfiltered error logging | `error-mapper.ts:68-73` | SQL/path disclosure | ✅ FIXED |

### Data Integrity

| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 14 | Audit logging silent failures | `audit.service.ts:49-96` | Compliance gaps | ✅ FIXED |
| 15 | FTS score MAX vs ADD | `fts.ts:124` | Multi-query broken | ✅ FIXED |
| 16 | Entity lookup case mismatch | `entity-index.ts:168-217` | Inconsistent retrieval | ✅ FIXED |
| 17 | Scope chain null lookup | `scope-chain.ts:169` | Wrong inheritance | ✅ FIXED |
| 18 | Double TTL check race | `feedback-cache.ts:83-204` | Stale scores | ✅ FIXED |
| 19 | Project deletion no cascade | `scopes.ts:310-317` | Orphaned entries | ✅ FIXED |
| 20 | Organization deletion no cascade | `scopes.ts:164-170` | Orphaned projects | ✅ FIXED |
| 21 | Circular blocker cycle undetected | `tasks.ts:471-513` | Deadlock state | ✅ FIXED |
| 22 | Version number race condition | `experiences.ts:644-676` | Duplicate versions | ✅ FIXED |

### Performance

| # | Issue | File | Impact |
|---|-------|------|--------|
| 23 | HyDE embedding cache stampede | `semantic.ts:79-106` | Duplicate API calls | ✅ FIXED |
| 24 | Extraction service infinite loop | `extraction.service.ts:150-170` | Hung requests | ✅ FIXED |
| 25 | LLM summarizer infinite loop | `llm-summarizer.ts:61-79` | Resource exhaustion | ✅ FIXED |
| 26 | Hardcoded memory multiplier | `semantic.ts:126-127` | OOM on large limits | ✅ FIXED |
| 27 | Vector store init race | `lancedb.ts:151-206` | Both processes fail | ✅ FIXED |
| 28 | Redis sync/async API confusion | `redis-cache.adapter.ts:200-223` | Always returns undefined | ✅ FIXED |

### Correctness

| # | Issue | File | Impact |
|---|-------|------|--------|
| 29 | Status override in removeBlocker | `tasks.ts:524-543` | Forced status change | ✅ FIXED |
| 30 | bulk_add TOCTOU race | `factory.ts:725-751` | Duplicate entries | ✅ FIXED |
| 31 | Prepared statement cache stale | `connection.ts:136-148` | Schema mismatch | ✅ FIXED |
| 32 | JSON parsing no validation | `decomposer.ts:395-410` | Invalid indices | ✅ FIXED |
| 33 | Scope chain index race | `fetch.ts:194-200` | Wrong sort order | ✅ FIXED |

---

## MEDIUM Issues (P2)

### Caching & Memory
- LRU get() TTL refresh race (`lru-cache.ts:66-81`)
- Memory pressure check window (`lru-cache.ts:293-309`)
- Session activity unbounded growth (`session-timeout.service.ts:78-123`) ✅ FIXED - Bug #283/#217
- Cache eviction race in batch (`embedding.service.ts:436-442`)
- Embedding dimension mismatch (`rerank.ts:312-326`)

### Query Pipeline
- Semantic score unbounded (`score.ts:116-128`)
- Graph traversal CTE/BFS inconsistency (`graph-traversal.ts:410-445`)
- FTS rowid map incomplete (`filter.ts:136-144`)
- Wasted fetch capacity per-type (`fetch.ts:471-485`)
- Temporal boundary condition (`fetch.ts:304-307`)

### Security/Validation
- Evidence file path traversal (`evidence.ts:279-285`)
- Auto-context path traversal (`context-detection.service.ts:134`)
- Search query leakage in logs (`semantic.ts:170-208`)
- User input in error messages (`fetch.ts:231-240`)
- Evidence metadata unbounded (`evidence.ts:141-201`)

### Database
- Transaction retry stale cache (`connection.ts:236-293`)
- Version history atomicity (`guidelines.ts:307-310`)
- Cascade delete orphans (`tags.ts:128-138`)
- Missing CHECK constraints (`migrations/0023`)
- Conversation context orphaning (`schema/conversations.ts:71-101`)

### Operations
- Missing health check endpoint (various)
- Incomplete cache metrics (`feedback-cache.ts:209-214`)
- Config invalid values not rejected (`config/index.ts`)
- Environment variable drift (multiple files)
- Pagination cursor secret fallback (`pagination.ts:49-77`)

### Batch Operations
- Unhelpful batch error messages (`factory.ts:783-784`)
- Synthetic ID mismatch on retry (`factory.ts:753-755`)
- Query permission recheck missing (`query.handler.ts:141-168`)
- Orphaned embedding tasks (`tools.ts:124-134`)

---

## LOW Issues (P3)

- Regex lastIndex mutation (`entity-extractor.ts:507`)
- Singleton race conditions (multiple files)
- Rate limiter cleanup never stopped (`rate-limiter-core.ts:221-243`)
- Permission list no pagination (`permission.service.ts:701-747`)
- Audit metadata size double-serialize (`audit.service.ts:61-74`)
- Single-instant date range (`fetch.ts:300-303`)
- Name dedup without normalization (`factory.ts:725-751`)
- Tag race condition get-or-create (`tags.ts:84-103`)
- Silent JSON parse failure (`tasks.ts:141-149`)
- NULL handling in message index (`conversations.ts:230-233`)
- Inefficient listBlocked query (`tasks.ts:412-455`)
- Vector store double-init (`lancedb.ts`, `pgvector.ts`)
- Documentation inaccuracy (`README.md`)
- Package.json script assumptions (`package.json`)
- Test pollution from singletons (test setup)
- MCP protocol framing (`mcp/server.ts`)

---

## Iteration 13: API, Observability, and Performance Analysis

### 13a. API Contracts and MCP Handlers (8 issues)

#### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| 180 | Type assertion without validation | `memory_context.ts:28` | Wrong action executes silently | ✅ FIXED |
| 181 | Audit logging silent failures (fire-and-forget) | `audit.service.ts:50-95` | Critical audit gaps | ✅ FIXED |
| 182 | Query handler lost correlation | `query.handler.ts:177-182` | Untraceable async errors | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 183 | Pattern of unsafe type coercion | `tool-runner.ts:273` | Type safety bypass |
| 184 | Schema-handler action enum mismatch | `memory_consolidate.ts:45-48` | Contract violation |
| 185 | SimpleToolDescriptor action dispatch inconsistency | `types.ts:315-326` | API contract mismatch |
| 186 | Response format mismatch MCP vs REST | `tool-runner.ts:160` + `mcp-rest-adapter.ts:114` | Protocol inconsistency |
| 187 | Error response type mismatch | `consolidation.handler.ts:127` | Inconsistent error serialization |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 188 | Redundant action validation | `tool-validator.ts:35` + `tools.controller.ts:147` | Code redundancy |

### 13b. Logging and Observability (14 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 189 | Audit logging fire-and-forget silent failures | `audit.service.ts:50-95` | Audit trail gaps | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 190 | Stack trace exposure in production logs | `rewrite.ts:152` | Information disclosure | ✅ FIXED |
| 191 | FTS query logging exposes search terms (PII) | `fts-search.ts:206` | Privacy risk | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 192 | Session maintenance no correlation | `scopes.handler.ts:454-530` | Maintenance failures undetected | ✅ FIXED |
| 193 | Cache set silent errors | `latent-memory.service.ts:448-450` | Silent cache degradation |
| 194 | Graph truncation no metrics | `graph-traversal.ts:261-270` | Silent data loss | ✅ FIXED |
| 195 | Audit truncation silent | `audit.service.ts:69-72` | Audit quality degradation |
| 196 | Missing correlation IDs in fire-and-forget | `fetch.ts:555+`, `stats.service.ts:139` | Broken distributed tracing | ✅ FIXED |
| 197 | Incomplete error context in semantic stage | `semantic.ts:170-208` | Poor error diagnosis |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 198 | Debug log startup silent failures | `logger.ts:32-46` | Debug logs never collected |
| 199 | Error type loss in generic handler | `rewrite.ts:148-154` | Error classification lost |
| 200 | Missing metric labels | `metrics.ts:420-435` | Incomplete observability |
| 201 | Pagination cursor logging insufficient | `resolve.ts:55` | Hard to debug cursor issues |

### 13c. Algorithm Complexity and Performance (10 issues)

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 202 | O(n²) pairwise similarity in Leiden | `similarity.ts:165-222` | Slow summarization (500K ops for 1K nodes) | ⚠️ DOCUMENTED - inherent complexity |
| 203 | Repeated modularity recalculation O(iterations×E) | `leiden.ts:309-346` | Slow community detection | ✅ FIXED - cached degree sums |
| 204 | Modularity gain O(n) assignment scan | `leiden.ts:141-192` | 100M operations for large graphs | ✅ FIXED - O(neighbors) now |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 205 | Degree recalculation every modularity call | `leiden.ts:78-84` | 500K wasted calculations | ✅ FIXED - pre-computed |
| 206 | Tags helper post-query filtering vs SQL WHERE | `tags-helper.ts:60-110` | Memory + bandwidth waste |
| 207 | Graph traversal silent truncation no signal | `graph-traversal.ts:260-271` | Incomplete query results | ✅ FIXED - see Bug #194 |
| 208 | Degree recalculation in moveNodesLocally | `leiden.ts:206-213` | Redundant computation |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 209 | O(n²) cohesion per community | `similarity.ts:252-266` | Slow cohesion computation |
| 210 | Duplicate cohesion+detailedCohesion calculation | `leiden.ts:365-367` | Wasteful recalculation |
| 211 | Entity index unbounded allRows array | `entity-index.ts:94-108` | Memory spike on bulk ops | ✅ FIXED |

---

## Iteration 14: Concurrency, Validation, and Error Handling Analysis

### 14a. Concurrency and State Management (12 issues)

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 212 | ConnectionGuard double-checked locking race | `connection-guard.ts:15-36` | Duplicate Redis connections | ✅ FIXED |
| 213 | Module-level singleton state race | `container.ts:544` | Health monitor use-after-free | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 214 | Event handler memory leak (Redis) | `redis-event.adapter.ts:245-249` | Unbounded handler growth | ✅ FIXED |
| 215 | Event handler memory leak (local bus) | `events.ts:54-58` | Steady memory accumulation | ✅ FIXED |
| 216 | Query cache event listener cleanup race | `query-pipeline.ts:129-137` | Orphaned subscriptions | ✅ FIXED |
| 217 | Session activity map unbounded growth | `session-timeout.service.ts:57-74` | Slow memory leak | ✅ FIXED |
| 218 | Health monitor reconnect no mutex | `health.service.ts:196-199` | Connection pool exhaustion | ✅ FIXED |
| 219 | setInterval without guaranteed cleanup | `session-timeout.service.ts:136` | Dangling timers | ✅ FIXED |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 220 | Fire-and-forget in Redis publish | `redis-event.adapter.ts:262-264` | Cache inconsistency |
| 221 | Fire-and-forget in feedback queue | `queue.ts:345` | Orphaned timers on stop |
| 222 | Promise race timeout initialization | `extraction.service.ts:774-778` | Edge case timeout leak |
| 223 | Redis cache unbounded async fetches | `redis-cache.adapter.ts:217-219` | Promise queue growth |

### 14b. Input Validation Edge Cases (20 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 224 | Score normalization range mismatch | `cross-encoder-rerank.ts:285` | Silent score corruption | ✅ FIXED |
| 225 | Rate limiter division by zero | `rate-limiter-core.ts:112` | No rate limiting | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 226 | Pagination cursor DoS (no size limit) | `pagination.ts:172` | Memory exhaustion | ✅ FIXED |
| 227 | Heap pressure division by zero | `lru-cache.ts:306` | Forced aggressive eviction | ✅ FIXED |
| 228 | Filter rowidMap null state | `filter.ts:131-188` | TypeError on null access | ✅ Already safe |
| 229 | Semantic HyDE weak embedding | `semantic.ts:93` | Poor search quality | |
| 230 | Timestamp parsing silent failure | `timestamp-formatter.ts:32` | Silent data loss | ✅ Already handled |
| 231 | Rate limiter negative overflow | `rate-limiter-core.ts:82` | Integer overflow | ✅ FIXED |
| 232 | Transcript UTF-8 truncation | `transcript-cursor.ts:70` | Corrupted JSON parsing | ✅ FIXED |
| 233 | Levenshtein array bounds hidden | `text-matching.ts:200` | Hidden null access |
| 234 | LCS array bounds non-null assertions | `math.ts:102-113` | Potential bounds issues |
| 235 | Empty array division guard unclear | `math.ts:43` | NaN propagation risk |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 236 | Mean calculation edge case | `math.ts:300-302` | Defensive only |
| 237 | Normalize precision loss | `math.ts:343-344` | Subnormal float issues |
| 238 | Cosine NaN/Infinity in vectors | `math.ts:191-193` | Wrong similarity result |
| 239 | Query index boundary empty | `decomposer.ts:311-420` | Edge case on no entities |
| 240 | Extract response off-by-one | `extraction.service.ts:154-161` | 1 byte past limit |
| 241 | Slice with negative bounds | `text-matching.ts:349` | Wrong truncation |
| 242 | Stream chunk delimiter | `extraction.service.ts:162` | UTF-8 handled by decoder |
| 243 | Zero vector edge case | `math.ts:212-218` | Guard exists but precision |

### 14c. Error Propagation and Recovery (10 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 244 | SQLite transaction rollback assumption | `sqlite.adapter.ts:125-230` | Data inconsistency | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| 245 | Extraction partial retry masks error | `extraction.service.ts:920-939` | Data loss - empty result | ✅ FIXED |
| 246 | Batch promises error collection delay | `extraction.service.ts:1001-1023` | Unreported batch failures | ✅ FIXED |
| 247 | Subquery timeout not propagated | `executor.ts:180+` | Silent query degradation | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 248 | JSON parse loses stack trace | `extraction.service.ts:1333-1347` | Harder debugging |
| 249 | Graph truncation no fallback signal | `graph-traversal.ts:260-270` | Incomplete results silently |
| 250 | Feedback queue finally block risk | `queue.ts:365-367` | Worker count inconsistency |
| 251 | Audit fire-and-forget silent | `audit.service.ts:89-94` | Lost audit data |
| 252 | Backup checkpoint errors ignored | `backup.service.ts:127-129` | Inconsistent backup state |
| 253 | Error conversion loses type info | `extraction.service.ts:885-886` | Type/stack trace loss |

---

## Iteration 15: Type Coercion, SQL Safety, and Configuration Analysis

### 15a. Type Coercion and Data Flow (10 issues)

#### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| 254 | Unsafe JSON.parse type assertion (lock) | `redis-lock.adapter.ts:317` | Distributed lock failure | ✅ FIXED |
| 255 | Unsafe JSON.parse (cache invalidation) | `redis-cache.adapter.ts:154` | Silent cache consistency violation | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 256 | Voting service type coercion | `voting.service.ts:111, 152, 169` | Consensus calculation failure |
| 257 | Redis rate limiter array bounds | `redis-rate-limiter.adapter.ts:374-376` | NaN in rate limiting stats |
| 258 | Cross-encoder LLM type assertion | `cross-encoder-rerank.ts:280` | NaN scores from LLM |
| 259 | Double type casting (as unknown as) | `compact-formatter.ts:223, 228, 233` | Output formatting crashes |
| 260 | Object.assign prototype pollution | `config/index.ts:467` | Potential prototype pollution |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 261 | NaN not caught by typeof | `resolve.ts:51` | Pagination offset NaN |
| 262 | Array bounds stats issue | `redis-rate-limiter.adapter.ts:415-417` | NaN in stats reporting |
| 263 | Optional chaining masks validation | `cross-encoder-rerank.ts:347-351` | Silent score fallback |

### 15b. SQL Construction and Database Safety (6 issues)

#### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| 264 | N+1 query pattern in graph nodes | `node.repository.ts:270-290` | O(N) queries per page | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 265 | SQL template literal concatenation | `pgvector.ts:259-270` | Risky SQL construction pattern | |
| 266 | Unvalidated OFFSET lower bound | `entry-utils.ts:47-61` | Accepts negative pagination | ✅ FIXED |
| 267 | LIKE wildcards not escaped | `conversations.ts:381, 389` | Incorrect search results | ✅ FIXED |
| 268 | Unsafe array type casting | `pgvector.ts:265-267` | Type safety bypassed | |

#### LOW
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 269 | Offset validation missing | `entry-utils.ts:61` | Accepts invalid pagination | ✅ FIXED |

### 15c. Configuration and Environment Handling (13 issues)

#### MEDIUM-HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 270 | Whitespace-only HMAC secret accepted | `pagination.ts:56-62` | Cryptographic weakness | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 271 | Type coercion - rate limiter fail mode | `redis-rate-limiter.adapter.ts:206` | Invalid fail mode accepted |
| 272 | Type coercion - circuit breaker mode | `redis-circuit-breaker.adapter.ts:255` | Invalid fail mode accepted |
| 273 | Unvalidated Number() parsing | `extraction.service.ts:1167-1171` | Extreme timeout values |
| 274 | Unvalidated parseInt() parsing | `pretooluse-command.ts:37` | Silent decimal truncation |
| 275 | Type coercion - injection format | `pretooluse-command.ts:31` | Invalid format accepted |
| 276 | Unvalidated env var pass-through | `factory/services.ts:101-103` | Silent configuration errors |
| 277 | No hot reload on env change | `permissions.ts:14-15` | Config changes not reflected |
| 278 | Case-sensitive boolean parsing | `server.ts:114` | Trust proxy fails silently |
| 279 | Silent invalid CORS origin drop | `server.ts:73-87` | Security misconfiguration |
| 280 | Custom parser bypasses registry | `database.ts:47-53` | Config coherence gap |
| 281 | Custom parser bypasses registry | `backup.ts:35-41` | Config coherence gap |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 282 | Case-sensitive boolean parsing | `vector.service.ts:217` | Debug flag not honored |

---

## Iteration 16: Resource Management and Async Patterns Analysis

### 16a. Resource Management and Cleanup (16 issues)

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 283 | Unbounded session activity map | `session-timeout.service.ts:57` | Memory leak, eventual OOM | ✅ FIXED |
| 284 | Redis event handlers no cleanup on disconnect | `redis-event.adapter.ts:245-249` | Handler accumulation on reconnect | ✅ FIXED |
| 285 | Redis cache async fetch no backpressure | `redis-cache.adapter.ts:216-219` | Connection pool exhaustion | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 286 | Session timeout interval cleanup missing | `session-timeout.service.ts:136-149` | Orphaned timer |
| 287 | Health monitor reconnect no mutex | `health.service.ts:196-199` | Concurrent reconnection attempts |
| 288 | LanceDB index creation orphaned promises | `lancedb.ts:221` | CPU wasted on retries |
| 289 | Extraction timeout ID leak edge case | `extraction.service.ts:771-785` | Edge case timer leak |
| 290 | Memory coordinator interval cleanup | `memory-coordinator.ts:139-158` | Orphaned background task |
| 291 | Feedback queue worker timeout | `queue.ts:344` | Orphaned promise callbacks |
| 292 | Redis event subscriber duplicate handlers | `redis-event.adapter.ts:176-205` | Duplicate message processing |
| 293 | LanceDB connection timeout not cleared | `lancedb.ts:106-120` | Dangling setTimeout |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 294 | PostgreSQL pool no error handler | `postgresql.adapter.ts:145-147` | No stale connection visibility |
| 295 | Fire-and-forget publish no retry | `redis-event.adapter.ts:262-264` | Silent event loss |
| 296 | Query cache unsubscribe race window | `runtime.ts:197-199` | Millisecond stale cache window |
| 297 | PostgreSQL transaction safe but subtle | `postgresql.adapter.ts:236-294` | Complexity risk |
| 298 | Backup DB verification (safe) | `backup.service.ts:84-99` | Actually safe |

### 16b. Async/Await and Promise Patterns (14 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 299 | ConnectionGuard double-checked locking | `connection-guard.ts:15-36` | Duplicate connections | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 300 | Redis cache async fire-and-forget | `redis-cache.adapter.ts:217, 274, 336` | Silent data loss on crash | ❌ NOT A BUG - intentional design |
| 301 | Redis event publish fire-and-forget | `redis-event.adapter.ts:262` | Multi-instance inconsistency | ❌ NOT A BUG - intentional design |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 302 | LanceDB Promise.race timeout cleanup | `lancedb.ts:109-117` | Timer leak per connection |
| 303 | Query executor Promise.race timeout | `executor.ts:256-257` | Event loop timer leak |
| 304 | Promise.all no fail-fast (factory) | `factory.ts:788-813` | Wasted validation work |
| 305 | Latent memory trackAccess fire-and-forget | `latent-memory.service.ts:534` | Incomplete access history |
| 306 | Session timeout checker no backpressure | `session-timeout.service.ts:137` | Concurrent check pile-up |
| 307 | Health service check no backpressure | `health.service.ts:132` | Concurrent health explosions |
| 308 | Config reload fire-and-forget | `config-reload.ts:308` | Silent reload failures |
| 309 | Dead letter queue retry no backpressure | `dead-letter-queue.ts:362` | Concurrent retry pile-up |
| 310 | Process shutdown void promise race | `server.ts:232, 244, 261` | Race on process termination |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 311 | Promise.then batch error propagation | `factory.ts:1045, 1155` | Partial batch failure |
| 312 | SQLite adapter promise callback escape | `sqlite.adapter.ts:131-139` | Well-guarded, safe |

---

## Iteration 17: External APIs and Serialization Analysis

### 17a. External API Integrations (17 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 313 | Ollama timeout race condition | `extraction.service.ts:1173-1174` | Memory leak, uninitialized timeout | ✅ FIXED |
| 314 | Cross-encoder timeout not in finally | `cross-encoder-rerank.ts:318-340` | Memory leak on error paths | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 315 | Rate limit headers never parsed | `extraction.service.ts`, `embedding.service.ts` | Sudden 429 errors | ✅ FIXED - retry.ts uses headers |
| 316 | Ollama retry logic incomplete | `extraction.service.ts:1246-1252` | No retry on 500/502/503/504 | ✅ FIXED |
| 317 | JSON parse returns empty silently | `extraction.service.ts:1331-1347` | Silent data loss | ✅ FIXED |
| 318 | No streaming for large extractions | `extraction.service.ts:1051-1063` | Connection pool exhaustion | ⚠️ DOCUMENTED - warning added |
| 319 | Token/context length not validated | `extraction.service.ts:809-810` | Model context overflow | ✅ FIXED - token estimation added |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 320 | LM Studio dimension race condition | `embedding.service.ts:589-591` | Dimension inconsistency |
| 321 | Cross-encoder score range not validated | `cross-encoder-rerank.ts:280-286` | Silent score clamping |
| 322 | Empty choices array not detected | `extraction.service.ts:1065` | Unclear error message |
| 323 | Ollama response structure not validated | `extraction.service.ts:1206-1229` | Invalid extractions stored |
| 324 | OpenAI batch sparse response | `embedding.service.ts:524-529` | NaN in embeddings |
| 325 | LM Studio URL not validated | `embedding.service.ts:235` | Data exfiltration risk |

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 326 | HyDE fallback not warned | `hyde.ts:222-224` | Degraded quality unnoticed |
| 327 | Network error classification broad | `retry.ts:87-99` | Inconsistent retry behavior |
| 328 | No adaptive backoff for rate limits | `retry.ts:36-59` | Ignores Retry-After header | ✅ FIXED - same as #315 |
| 329 | Timeout promises not cleaned | Various | Memory accumulation |

### 17b. Serialization and Deserialization (8 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 330 | Base64 vs Base64url mismatch | `pagination.ts:75, 99-100, 149` | Cursor verification fails randomly | ✅ FIXED |
| 331 | JSONL parsing unguarded per-line | `rl.handler.ts:499-502, 602-605` | Single bad line crashes batch | ✅ FIXED |
| 332 | LRU cache circular reference | `lru-cache.ts:248` | Application crash on circular data | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact |
|---|-------|------|--------|
| 333 | Unicode hash collision (charCodeAt) | `extraction-hook.service.ts:600-607` | Duplicate detection broken | ✅ FIXED |
| 334 | Deep clone loses type info | `config/index.ts:478` | Config integrity in tests | ✅ NOT AN ISSUE |
| 335 | Unguarded JSON.parse in handler | `rl.handler.ts:439` | Handler crash on invalid input | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact |
|---|-------|------|--------|
| 336 | Base64 encoding inconsistency | `base.ts:97, 108` | Silent pagination failures |
| 337 | Hardcoded UTF-8 assumption | `transcript-cursor.ts:70` | Garbled transcript on non-UTF8 |

---

## Iteration 18: Authorization and Remaining Edge Cases Analysis

### 18a. Authorization and Access Control (9 issues)

#### CRITICAL
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 338 | TOCTOU: permission check after fetch | `factory.ts:482-504` | Unauthorized access after revocation | ✅ FIXED |
| 339 | Permissive mode in staging environments | `permission.service.ts:286-310` | Full auth bypass in non-prod | ✅ FIXED |
| 340 | entryId=null escalates to type-level | `factory.ts:163-183` | Privilege escalation | ✅ FIXED |

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 341 | Missing agentId validation in list | `factory.ts:528-576` | Information disclosure without auth | ✅ FIXED |
| 342 | Scope inheritance validation gap | `permission.service.ts:248-275` | Unintended global fallback | ✅ FIXED |
| 343 | Project entries bypass all checks | `permission.service.ts:413-415, 507-515` | Any agent can modify projects | ✅ FIXED |
| 344 | Admin key timing inconsistency | `scopes.handler.ts:154-156, 178-180` | Cross-tenant project modification | ✅ VERIFIED SAFE |
| 345 | Permission cache invalidation incomplete | `permission.service.ts:616-619, 670-672` | 30s stale permission window | ✅ DOCUMENTED |
| 346 | Cache key collision null vs undefined | `permission.service.ts:149-150` | Wrong permission applied | ✅ FIXED |

### 18b. CLI, Cron, and Remaining Edge Cases (10 issues)

#### HIGH
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 347 | CLI argv[++i] bounds not checked | `parse-hook-args.ts:19`, `verify-response.ts:78` | Silent invalid argument acceptance | ✅ FIXED |
| 348 | Stdin unbounded buffer accumulation | `stdin.ts:23` | Memory exhaustion DoS | ✅ FIXED |

#### MEDIUM
| # | Issue | File | Impact | Status |
|---|-------|------|--------|--------|
| 349 | split()[1] undefined not validated | `parse-hook-args.ts:21` | Undefined propagates downstream | ✅ FIXED |
| 350 | Cron schedule edge case validation | `backup-scheduler.service.ts:64` | Silent scheduling failure | |
| 351 | Health check reconnection race | `health.service.ts:389` | Connection pool exhaustion | ✅ FIXED |
| 352 | Health check division by zero | `health.service.ts:239` | False degraded status | ✅ Already guarded |
| 353 | Metrics registry unbounded growth | `metrics.ts:276-295` | Slow memory leak | ✅ FIXED

#### LOW
| # | Issue | File | Impact |
|---|-------|------|--------|
| 354 | Stdin timeout race condition | `stdin.ts:30` | Orphaned timeout callback |
| 355 | OpenAPI spec stale cache | `routes/v1.ts:8-24` | Stale API spec |
| 356 | Config reload partial failure hidden | `config-reload.ts:378-388` | Misleading success status |

---

## Recommendations

### Immediate (P0)
1. Fix permission bypass in `permission.service.ts`
2. Add transaction wrappers for all score/counter updates
3. Escape user input in all LLM prompts
4. Add cascade deletes for project/org hierarchy

### Short-term (P1)
1. Add proper rate limit enforcement
2. Fix cache race conditions with mutex/atomic ops
3. Add timeout to all streaming operations
4. Audit all logging for secret exposure

### Medium-term (P2)
1. Add comprehensive health check endpoint
2. Centralize configuration validation at startup
3. Add database-level constraints (CHECK, UNIQUE)
4. Improve batch operation error reporting

### Long-term (P3)
1. Add documentation for all environment variables
2. Improve test isolation for stateful services
3. Add metrics cardinality controls ✅ DONE - Bug #353
4. Review and update outdated documentation

---

## Analysis Methodology

1. **Static Analysis:** Reviewed all source files for patterns
2. **Race Condition Detection:** Identified non-atomic read-modify-write patterns
3. **Security Review:** Checked for injection, disclosure, bypass vulnerabilities
4. **Data Flow Analysis:** Traced user input through system
5. **Error Handling Review:** Identified silent failures and leaks
6. **Concurrency Analysis:** Found missing synchronization

---

*Generated by deep codebase analysis on 2026-01-13*
