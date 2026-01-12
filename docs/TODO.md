# Agent Memory - Development TODO

This is the canonical task list for ongoing development. Update this document as tasks are added, completed, or discovered.

---

## In Progress

_No tasks currently in progress._

---

## Retrieval & Extraction Audit (235 Tasks)

Comprehensive audit of all code affecting retrieval and extraction quality. Tasks organized by system area and priority.

### QUERY PIPELINE (Tasks 1-44)

#### Critical Security
- [x] 1. **SQL Injection Risk in FTS Stage** - `fts-search.ts:95` - VERIFIED SECURE: Table names derived from TypeScript enum via switch statement, no user input reaches SQL
- [x] 2. **Unsafe Table Name Interpolation in Rerank** - `rerank.ts:160-220` - VERIFIED SECURE: Table names are hardcoded constants, uses parameterized IN clauses
- [x] 3. **Missing Validation in Knowledge Temporal Fetch** - `fetch.ts:297-303` - FIXED: Added validation that start date must be <= end date
- [x] 4. **No Input Validation for Scope Chain Cache** - `scope-chain.ts:143-146` - FIXED: Added UUID format validation for scope IDs

#### Performance
- [x] 5. **Inefficient Light Scoring Phase** - `score.ts:547-586` - ANALYZED: 4 loops are O(n) total, each processes only its type. Code style issue, not performance.
- [x] 6. **Redundant Scope Chain Resolution** - `scope-chain.ts` - ANALYZED: Cache DOES store results even when entities don't exist. Not a real issue.
- [ ] 7. **No Pagination Cursor Support** - `pipeline.ts:408` always returns `nextCursor: undefined` - VALID: Missing feature
- [x] 8. **Fetch Headroom Too Conservative** - `fetch.ts:30-75` - ANALYZED: Adaptive headroom (1.2x-5.0x) is intentional based on filter selectivity
- [x] 9. **Semantic Entry Fetch Inefficiency** - `fetch.ts:394-424` - ANALYZED: Uses Map.keys() which is inherently deduplicated
- [x] 10. **No Prepared Statement Caching for Dynamic Queries** - `fetch.ts:356` - ALREADY IMPLEMENTED: Uses `getPreparedStatement()` for caching

#### Error Handling
- [x] 11. **Silent Failures in Entity Index Lookup** - `index.ts:309-321` - FIXED: Added debug logging with error details and entity info
- [x] 12. **No Recovery from Semantic Stage Failures** - `semantic.ts:170-208` - FIXED: Classified errors by type with appropriate log levels
- [x] 13. **Graph Traversal Max Results Silently Discarded** - `graph-traversal.ts` - FIXED: Added truncation logging for both CTE and BFS
- [x] 14. **FTS Search Fallback Not Logged** - `fts-search.ts` - FIXED: Added debug logging for stopword fallback
- [x] 15. **Query Rewrite Service Failures Hide Error Details** - `rewrite.ts:145-165` - FIXED: Now logs full error details with stack trace
- [x] 16. **No Handling for Empty Search String** - `resolve.ts:39-50` - FIXED: Added logging and clarifying comments

#### Missing Features
- [ ] 17. **No Query Result Invalidation on Cascade Deletes** - `index.ts:178-186` doesn't handle cascading
- [x] 18. **Missing Limit Enforcement in FTS Scored Results** - FIXED: Added limit slicing in fallback path
- [ ] 19. **No Support for Excluding Search Terms** - Missing `-term` syntax support
- [ ] 20. **Missing Query Analytics** - No structured success/failure rate capture
- [ ] 21. **No Result Diversification** - Results could all be from same scope/category
- [ ] 22. **No Late Binding for Dependencies** - `index.ts:51-53` can't update at runtime

#### Hidden Complexity
- [x] 23. **FTS Expanded Query Weight Handling Unclear** - VERIFIED: weight IS applied at line 122 (score * query.weight), matchWeights map is unused cleanup
- [x] 24. **Semantic Score Deduplication Issue** - VERIFIED: weight IS applied at line 130 (score * weight), max-score dedup is intentional
- [x] 25. **Phase 1 Light Score May Not Preserve Top Candidates** - ANALYZED: 1.5x buffer is intentional trade-off for performance, could increase if recall issues arise
- [ ] 26. **Feedback Multiplier Doesn't Account for Recency** - `feedback-cache.ts:267-285` old feedback distorts
- [ ] 27. **Cached Feedback Has No Invalidation Trigger** - `feedback-cache.ts:130-133` no auto-invalidation
- [ ] 28. **Post-Filter Tags Stage Has Resource Overhead** - `filter.ts:450-451` no batching optimization
- [x] 29. **Cross-Encoder Re-ranking Score Blending Not Configurable** - VERIFIED: alpha IS configurable via AGENT_MEMORY_CROSS_ENCODER_ALPHA
- [ ] 30. **Hierarchical Filtering May Drop Relevant Results** - `index.ts:571` doesn't re-score results

#### Configuration
- [ ] 31. **Hardcoded Timeout Missing** - No timeout on embedding/vector calls in semantic.ts
- [x] 32. **No Circuit Breaker for External Services** - VERIFIED: DLQ has useCircuitBreaker, rate limiter has burst protection, withRetry has backoff
- [ ] 33. **Scope Chain Cache TTL Not Configurable** - `scope-chain.ts:31` 10-minute TTL hardcoded
- [ ] 34. **Feedback Cache TTL Not Applied Consistently** - `feedback-cache.ts:80` TTL inconsistent
- [x] 35. **FTS BM25 Normalization Formula Not Documented** - FIXED: Added comprehensive JSDoc with formula explanation

#### Edge Cases
- [x] 36. **No Handling for Very Large Embeddings** - VERIFIED: cosineSimilarity handles zero-length/magnitude (returns 0.0)
- [x] 37. **Empty Type Array Not Validated** - VERIFIED: resolve.ts:26-29 correctly falls back to DEFAULT_TYPES
- [x] 38. **Negative Limit Values Not Prevented** - VERIFIED: resolve.ts:36 checks `> 0` before using value
- [x] 39. **No Handling for Circular Relations** - VERIFIED: CTE uses UNION+DISTINCT, BFS uses visited Set
- [x] 40. **Missing Memory Pressure Handling** - VERIFIED: MemoryCoordinator exists and manages caches. Intermediate result sets during processing are bounded by limit param.

#### Architecture
- [x] 41. **Context Type Safety Issues** - ANALYZED: Type casts are TypeScript pattern for progressive context enrichment. Would need branded types or type guards to eliminate.
- [ ] 42. **Pipeline Stage Ordering Not Validated** - Stages could be reordered silently (enhancement)
- [ ] 43. **Missing Dry-Run Mode** - Can't validate query without executing (enhancement)
- [ ] 44. **Limited Observable Telemetry** - Only basic timing logged, no decision visibility (enhancement)

---

### EXTRACTION SERVICES (Tasks 45-120)

#### Extraction Service Core
- [ ] 45. **Missing Batch Processing** - No batch embedding support for large extractions
- [ ] 46. **Hardcoded MAX_CONTEXT_LENGTH** - `extraction.service.ts:27` 100KB limit hardcoded
- [ ] 47. **No Partial Extraction Retry** - Entire result lost if extraction fails partway
- [ ] 48. **Missing Input Validation for contextType** - Not validated against allowed values
- [ ] 49. **Confidence Score Normalization Issue** - `extraction.service.ts:1125` no warning on invalid values
- [ ] 50. **No Deduplication Within Single Extraction** - Multiple identical entries possible
- [ ] 51. **Missing Error Context in Retry** - `extraction.service.ts:905-906` no error context in logs
- [ ] 52. **SSRF Validation Incomplete** - `extraction.service.ts:85-90` IPv6 zone IDs not handled
- [x] 53. **No Rate Limiting Between Requests** - VERIFIED: Token bucket rate limiter exists (rate-limiter-core.ts) with per-agent, global, and burst limits
- [ ] 54. **Provider State Tracking Issue** - `extraction.service.ts:647` module-level state shared
- [x] 55. **Missing Temperature Validation** - VERIFIED: Config schema validates with z.number().min(0).max(2)
- [ ] 56. **Timeout Not Cancellable** - `extraction.service.ts:752` timeout promise memory leak
- [ ] 57. **Missing Ollama Response Validation** - `extraction.service.ts:1005` no schema validation
- [ ] 58. **Parsing Fallback Is Silent** - `extraction.service.ts:1102-1106` can't distinguish parse error

#### Extraction Hook Service
- [x] 59. **Regex State Management Vulnerability** - VERIFIED: Line 247 correctly resets lastIndex = 0 before each pattern
- [ ] 60. **Hash Collision Vulnerability** - `extraction-hook.service.ts:312-320` uses weak JavaScript hash
- [ ] 61. **Hardcoded Confidence Thresholds** - Pattern confidence values hardcoded
- [ ] 62. **No Max Pattern Match Limit** - `extraction-hook.service.ts:277` could match millions of times
- [ ] 63. **Pattern Efficiency Issue** - Global regexes processed sequentially
- [ ] 64. **Cooldown Resolution Too Coarse** - `extraction-hook.service.ts:302` Date.now() precision issues
- [ ] 65. **No Extraction Patterns for Errors** - Missing error handling pattern detection

#### Entity Extraction Service
- [ ] 66. **Function Name Extraction Too Aggressive** - `entity-extractor.ts:61` high false positive rate
- [ ] 67. **Package Name Regex Missing Patterns** - `entity-extractor.ts:66` misses npm-style packages
- [ ] 68. **File Path Pattern Too Restrictive** - `entity-extractor.ts:55` requires extension
- [ ] 69. **Entity Type Inference Weak** - `entity-extractor.ts:388-425` heuristic fragile
- [ ] 70. **Variants Generation Incomplete** - `entity-extractor.ts:316-383` no transliteration
- [ ] 71. **Confidence Calculation Hardcoded** - `entity-extractor.ts:430-478` no tuning capability
- [x] 72. **Singleton Pattern Issue** - ANALYZED: Already @deprecated, recommends DI via context.services.entityExtractor

#### Experience Capture
- [ ] 73. **Incomplete Trajectory Extraction** - `experience.module.ts:73-78` missing error details
- [ ] 74. **Confidence Threshold Not Applied to Trajectory** - Steps accepted regardless of confidence
- [ ] 75. **Hash-Based Duplicate Detection Weak** - `experience.module.ts:290-291` no semantic similarity
- [ ] 76. **No Batch Experience Creation** - `experience.module.ts:224-238` creates one-by-one
- [ ] 77. **Provider Fallback Chain Missing** - `experience.module.ts:124` no fallback providers
- [ ] 78. **Metric Aggregation Inaccurate** - `experience.module.ts:360` Set could have duplicates
- [ ] 79. **Silent Failure on Transcript Format Issue** - `experience.module.ts:378-392` no validation
- [ ] 80. **No Content Validation Before DB Write** - Experience stored without validation

#### Hierarchical Summarization
- [ ] 81. **Summarizer Initialization Error Swallowed** - `hierarchical-summarization.service.ts:92-104`
- [ ] 82. **inferMemberType Hardcoded Fallback** - `hierarchical-summarization.service.ts:954-959` always 'knowledge'
- [x] 83. **No Recursive Depth Limit** - VERIFIED: Line 337 checks currentLevel > maxLevels to bound recursion
- [ ] 84. **Embedding Cache Not Implemented** - `hierarchical-summarization.service.ts:627-674`
- [ ] 85. **Community Cohesion Not Validated** - `hierarchical-summarization.service.ts:403-407`
- [ ] 86. **Member Type Inference Lost** - `hierarchical-summarization.service.ts:929-959`

#### Query Rewrite Service
- [ ] 87. **Decomposition Plan Not Validated** - `query-rewrite.service.ts:187` could be empty
- [ ] 88. **Query Weight Normalization Missing** - `query-rewrite.service.ts:273` different scales
- [ ] 89. **HyDE Embedding Memory Not Freed** - `query-rewrite.service.ts:251-268` embeddings stored
- [x] 90. **Singleton Reset Needed in Tests** - VERIFIED: resetQueryRewriteService() exists at lines 446-448

#### LLM Summarizer
- [ ] 91. **Default Model Hardcoded** - `llm-summarizer.ts:149-159` requires code change
- [ ] 92. **No Streaming Support** - Waits for full response before returning
- [ ] 93. **Batch Processing Inefficient** - `llm-summarizer.ts:331-336` processes sequentially
- [ ] 94. **Model Name Validation Too Restrictive** - `llm-summarizer.ts:39-40` rejects valid names

#### Atomicity Service
- [ ] 95. **Imperative Verb List Incomplete** - `atomicity.ts:89-101` misses common verbs
- [ ] 96. **Sentence Splitting Unreliable** - `atomicity.ts:232` lookbehind not supported everywhere
- [ ] 97. **Split Confidence Reduction Arbitrary** - `atomicity.ts:303` 0.95 multiplier hardcoded
- [ ] 98. **Tool Splitting Too Conservative** - `atomicity.ts:393` only splits if all parts recognized

#### Configuration & Security
- [ ] 99. **API Key Exposure in Logs** - Extraction errors may contain auth tokens
- [x] 100. **Missing Rate Limit Handling** - VERIFIED: RateLimitError exists, 429 handled in tool-runner.ts and auth.ts
- [ ] 101. **Timeout Values Inconsistent** - Different services use different timeouts
- [ ] 102. **Environment Variable Parsing Issues** - `extraction.service.ts:967-970` no validation

#### Performance
- [ ] 103. **No Input Length Validation Before Processing** - Wastes API credits on oversized inputs
- [ ] 104. **Regex Compilation Not Cached** - Creates new RegExp objects in loops
- [ ] 105. **No Request Deduplication** - Identical extraction requests processed independently
- [ ] 106. **Memory Growth in Long Sessions** - seen sets hold references forever

#### Missing Features
- [ ] 107. **No Extraction Metrics/Observability** - No success/failure counters
- [ ] 108. **No Extraction Versioning** - Entries not tracked with extraction version
- [ ] 109. **No Extraction Explanation Generation** - Can't explain why entity was extracted
- [ ] 110. **No Multi-Language Support** - Patterns written for English only
- [ ] 111. **No Extraction Feedback Loop** - Can't mark extractions as incorrect

#### Error Handling
- [ ] 112. **Provider Mismatch Not Detected** - Config vs key mismatch fails late
- [ ] 113. **Missing Network Error Classification** - Can't distinguish timeout vs connection refused
- [x] 114. **No Circuit Breaker Pattern** - VERIFIED: DLQ has circuit breaker (useCircuitBreaker: true), rate-limiter has burst protection
- [ ] 115. **Parsing Error Recovery Non-Obvious** - Inconsistent behavior on parse failure

#### Edge Cases
- [ ] 116. **Empty Extraction Results Ambiguous** - Can't tell if LLM returned nothing vs failed
- [ ] 117. **Very Long Entity Names** - No truncation, could exceed DB column limits
- [x] 118. **Circular Relationships** - VERIFIED: CTE uses UNION+DISTINCT, BFS uses visited Set (see task 39)
- [ ] 119. **Unicode Handling** - Entity extraction patterns assume ASCII
- [ ] 120. **Deeply Nested Structures** - Experience trajectory has no max depth limit

---

### EMBEDDING & VECTOR SEARCH (Tasks 121-235)

#### Embedding Service Core
- [ ] 121. **No validation of embedding array elements** - NaN, Infinity not checked
- [ ] 122. **Cache key collision vulnerability** - Colons in text cause key collisions
- [ ] 123. **Missing cache statistics** - No hit/miss rate metrics
- [ ] 124. **Hardcoded embedding dimensions** - Should be fetched from model metadata
- [ ] 125. **No embedding output validation** - Embedding length not verified after API call
- [ ] 126. **Silent provider fallback risk** - No warning on OpenAI init failure
- [ ] 127. **Memory leak potential in cache eviction** - Only evicts 1 item at a time
- [ ] 128. **No cache serialization** - Cache lost on restart
- [ ] 129. **Instruction wrapping inconsistency** - wrapWithInstruction called differently
- [ ] 130. **Missing embedding tokenization validation** - Token limits not checked before API call
- [ ] 131. **OpenAI batch size not configurable** - Hardcoded to 2048 limit
- [x] 132. **No retry exponential backoff** - VERIFIED: retry.ts uses backoffMultiplier, DLQ has exponential backoff, configurable via AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER
- [ ] 133. **LM Studio dimension detection race condition** - Concurrent detection possible
- [ ] 134. **Local model lazy loading not thread-safe** - Race on pipeline initialization
- [ ] 135. **Float32Array conversion loses precision** - Rounding errors accumulate
- [x] 136. **No embedding model version tracking** - VERIFIED: embedding_model column exists and is populated via embedding-hooks.ts
- [ ] 137. **Disabled provider throws instead of graceful degradation** - Should return sentinel
- [ ] 138. **Max cache size never decreased** - Only evicts, never shrinks
- [x] 139. **No warning on dimension mismatch** - VERIFIED: logger.warn at lancedb.ts:88 and pgvector.ts:88 logs dimension mismatch

#### Embedding Hooks & Queue
- [ ] 140. **Sequence number can overflow** - No protection in long-running processes
- [ ] 141. **Stale job detection race condition** - Marked stale after API but before DB write
- [ ] 142. **No maximum queue depth limit** - Queue could grow unbounded
- [ ] 143. **Batch splitting doesn't preserve order** - Results may mismatch inputs
- [ ] 144. **Retry delay calculation doesn't account for clock skew** - Timing issues
- [ ] 145. **Concurrent batch processing leak** - All jobs retry together instead of individually
- [ ] 146. **Dead Letter Queue only stores first 100 chars** - Loses context for large entries
- [x] 147. **No circuit breaker pattern** - VERIFIED: DLQ has `useCircuitBreaker: true` in default config (dead-letter-queue.ts:78)
- [ ] 148. **Stale job skipping doesn't clean up entry embeddings** - Orphaned rows remain
- [ ] 149. **Batch job failure atomicity issue** - Inconsistency between vector DB and metadata
- [ ] 150. **No maximum batch processing time** - Large batches could timeout
- [ ] 151. **Queue stats don't track queue depth over time** - Can't identify sustained backlog
- [ ] 152. **No mechanism to prioritize urgent embedding jobs** - All jobs equal priority
- [ ] 153. **Re-enqueued jobs lose original timestamp** - Can't distinguish original vs retry
- [ ] 154. **Concurrent state mutation in retryFailedEmbeddings** - Double-retry possible

#### LanceDB Issues
- [ ] 155. **Vector dimension inference happens on first store** - Could lock wrong dimension
- [ ] 156. **No validation that vector values are normalized** - Incorrect cosine similarity
- [ ] 157. **Identifier validation is overly restrictive** - Rejects valid UUIDs
- [ ] 158. **Quantization index creation happens async fire-and-forget** - Errors ignored
- [ ] 159. **No index statistics tracking** - Can't tell if index is being used
- [ ] 160. **Distance-to-similarity conversion varies by metric** - L2 formula incorrect
- [ ] 161. **Search result type assertion is risky** - Missing field validation
- [ ] 162. **Empty search handling returns silently** - Can't distinguish empty vs not initialized
- [ ] 163. **Multiple concurrent index creation attempts** - Race condition possible
- [ ] 164. **No timeout on connection establishment** - Could hang indefinitely
- [ ] 165. **Count operation returns 0 on error silently** - Can't distinguish empty vs failure

#### pgvector Issues
- [ ] 166. **HNSW index parameters hardcoded** - m=16, ef_construction=64 not configurable
- [ ] 167. **Dimension validation is overly strict** - 10,000 limit may be too low
- [ ] 168. **Vector string conversion has precision loss** - Floating-point truncation
- [x] 169. **Search query has SQL injection vulnerability** - VERIFIED SAFE: entryTypes uses parameterized $2 with ANY() operator
- [ ] 170. **ALTER TABLE to specify dimension is risky** - Could fail with existing data
- [ ] 171. **Distance-to-similarity conversion for dot product incorrect** - Formula wrong
- [ ] 172. **Pool client release in finally block could throw** - Masks previous error
- [ ] 173. **No prepared statement usage** - Dynamic queries less efficient
- [ ] 174. **Index creation doesn't fail gracefully if dimension varies** - Inconsistent state

#### Vector Service
- [ ] 175. **Dimension mismatch error includes suggestion but doesn't prevent further errors** - Cascade
- [ ] 176. **State machine allows operations from 'error' state** - Should throw immediately
- [ ] 177. **Closed state is terminal but not checked consistently** - Some methods don't verify
- [ ] 178. **No metrics tracking for vector operations** - Can't monitor search latency
- [ ] 179. **Initialization promise not cleared if timeout occurs** - Permanent deadlock
- [ ] 180. **Delete operation doesn't verify deletion success** - Silent failure possible
- [ ] 181. **Automatic old version deletion on store could fail silently** - Env var masks failures
- [ ] 182. **No batch delete operation** - Deletes one-by-one
- [ ] 183. **Search limit parameter not validated** - Negative/zero values possible

#### Schema & Tracking
- [ ] 184. **No foreign key constraint to entries** - Orphaned embedding records possible
- [ ] 185. **No index on (entryType, hasEmbedding)** - Slow searches for unembedded entries
- [ ] 186. **createdAt/updatedAt use database default** - Timezone inconsistency
- [ ] 187. **No audit trail for embedding failures** - Can't track why specific embeddings failed
- [ ] 188. **Model/provider fields not nullable but could be missing** - Schema mismatch
- [ ] 189. **Version ID tracking doesn't cascade on entry deletion** - Dead embeddings remain

#### Integration Issues
- [ ] 190. **No atomic transaction for embedding + DB metadata writes** - Inconsistency risk
- [ ] 191. **Query embedding asymmetry not documented** - 'query' vs 'document' type difference
- [ ] 192. **Semantic stage assumes dimensionality matching** - No dimension check before search
- [ ] 193. **HyDE embedding weight application is ad-hoc** - Max score without confidence
- [ ] 194. **Batch embedding doesn't preserve original text order** - Could mismatch embeddings
- [ ] 195. **Embedding cache not considered in query pipeline** - Could serve stale embeddings

#### Configuration & Scaling
- [ ] 196. **Batch size configuration lacks upper bound validation** - Could request huge batches
- [ ] 197. **Max concurrency default not justified** - 16 for SQLite, 4 for embeddings arbitrary
- [ ] 198. **No adaptive batch sizing based on response times** - Fixed size regardless of load
- [ ] 199. **Retry delay exponential backoff could exceed timeout** - No maximum cap
- [ ] 200. **No sample of successful vs failed embedding models** - Can't identify reliability
- [ ] 201. **Vector DB quantization thresholds not configurable** - 256 embeddings hardcoded
- [ ] 202. **No warmup phase for embedding models** - First embedding slow

#### Error Handling & Resilience
- [ ] 203. **EmbeddingDisabledError doesn't distinguish intentionally disabled vs unavailable** - Retry confusion
- [x] 204. **Empty text error doesn't trim/normalize first** - VERIFIED: embedding.service.ts:234 trims text before checking empty
- [ ] 205. **Network errors during embedding assumed transient** - Some are permanent
- [ ] 206. **Vector store initialization failure allows operations to proceed** - Service returns false
- [ ] 207. **Dead Letter Queue has no expiration** - Failed jobs accumulate forever
- [x] 208. **No mechanism to manually retry DLQ entries** - VERIFIED: `retryFailedEmbeddings()` and `reindex --retry-failed` CLI command exist

#### Observability & Debugging
- [ ] 209. **No distributed tracing for embedding operations** - Can't correlate to query
- [ ] 210. **EmbeddingQueueStats doesn't track latency percentiles** - Can't identify slow ops
- [ ] 211. **No per-provider metrics** - Can't compare OpenAI vs LMStudio performance
- [ ] 212. **Embedding failures logged but not queryable** - No way to find all failed entries
- [x] 213. **Dimension mismatch errors don't suggest remediation** - VERIFIED: vector.service.ts:245 includes suggestion: 'Ensure the query embedding uses the same model as stored embeddings'
- [ ] 214. **Cache hit/miss not logged** - Can't optimize cache size

#### Performance & Scaling
- [ ] 215. **Embedding cache size fixed at 1000 entries** - Should be configurable
- [ ] 216. **No embedding result deduplication** - API called each time if not in cache
- [x] 217. **Vector search limit multiplied by 3 for hybrid search** - ANALYZED: Comment at semantic.ts:126 explains purpose (fetch more for scoring), factor could be configurable
- [ ] 218. **No pre-warming of popular embeddings** - Cold start slow
- [ ] 219. **Batch processing doesn't pipeline** - Waits for response before next batch
- [ ] 220. **L2 distance formula in LanceDB incorrect** - Bounds to [0,0.5] not [0,1]

#### Edge Cases Not Handled
- [ ] 221. **Empty entry after filtering/normalization** - Becomes empty after stripping
- [ ] 222. **Very large entries (megabytes)** - Could exceed API token limits
- [ ] 223. **Embedding dimension changes mid-deployment** - No migration support
- [ ] 224. **Concurrent dimension changes** - Multiple stores with different embeddings
- [ ] 225. **Network partition during batch embedding** - Partial batch persisted inconsistently
- [ ] 226. **Clock skew on retry timing** - System clock adjustment causes retry storms
- [ ] 227. **Floating point precision edge cases** - NaN, Infinity, -0 accepted without validation

#### Missing Features
- [x] 228. **No embedding versioning** - VERIFIED: embedding_model column tracks model version (see task 136)
- [x] 229. **No way to update embeddings for changed entries** - VERIFIED: `generateEmbeddingAsync()` called in all repository update methods (guidelines.ts:316, knowledge.ts:314, tools.ts:285, experiences.ts:341)
- [x] 230. **No bulk re-embedding capability** - VERIFIED: `reindex` command provides bulk re-embedding via `backfillEmbeddings()` with batch processing
- [ ] 231. **No embedding similarity statistics** - ANALYZED: No quality auditing exists; RL has avgSimilarity for training only
- [ ] 232. **No search result explanation** - ANALYZED: No end-user explainability feature exists
- [x] 233. **No embedding model switching support** - VERIFIED: Model configurable via env/config, `embedding_model` stored per embedding for tracking
- [x] 234. **No incremental indexing progress** - VERIFIED: `reindex` command has `onProgress` callback showing percent complete
- [ ] 235. **No cost tracking** - ANALYZED: No runtime embedding API usage cost tracking exists

---

## Completed

### 2026-01-12

- [x] **Audit Logging Gaps** - Added `logAction()` calls to all handlers
  - `factory.ts` bulk operations (bulk_add, bulk_update, bulk_delete)
  - `tags.handler.ts` - create, attach, detach operations
  - `relations.handler.ts` - create, delete operations
  - `graph-edges.handler.ts` - add, update, delete operations
  - `graph-nodes.handler.ts` - add, update, deactivate, reactivate, delete operations
  - `conversations.handler.ts` - Already had complete audit coverage (verified)

- [x] **Permission Check Gaps** - Added permission checks to graph handlers
  - `graph-edges.handler.ts` - Added `requireGraphPermission()` to all handlers
  - `graph-nodes.handler.ts` - Added scope-aware `requireGraphPermission()` to all handlers

- [x] **Error Sanitization Coverage** - Complete
  - MCP error responses: Already sanitized via `AgentMemoryError`
  - REST API error responses: Fixed `error-mapper.ts` to sanitize all paths
  - CLI error output: Inherits from error-mapper sanitization

- [x] **Memory Coordinator Activation** - Verified
  - Coordinator auto-starts in constructor (`this.start()`)
  - Caches registered via `registerCachesWithCoordinator()`
  - Memory pressure monitoring functional

- [x] **Config Registry Completeness** - Verified
  - Found raw `process.env.AGENT_MEMORY_*` reads in multiple files
  - Documented for future migration (low priority)
  - Current raw reads are safe (used for defaults/fallbacks)

- [x] **Embedding Pipeline Wiring** - Verified complete
  - `registerEmbeddingPipeline()` called in `runtime.ts:146`
  - Queue processes via `EmbeddingService.processQueue()`
  - All entry types covered (guidelines, knowledge, tools)

- [x] **Event Subscription Wiring** - Verified complete
  - `wireQueryCacheInvalidation()` called in `runtime.ts:153`
  - EventBus created and passed correctly
  - Subscriptions survive full request lifecycle

- [x] **Cache Invalidation Events** - Fixed missing event emission
  - Added event emission to `add` handler (create)
  - Added event emission to `deactivate` handler
  - Added event emission to `bulk_add` handler
  - Added event emission to `bulk_delete` handler
  - Added 8 regression tests for cache invalidation events

- [x] **Project Principles** - Established 23 guiding principles
  - Created `docs/PRINCIPLES.md`
  - Stored in agent-memory with priority 100

- [x] **ADR Documentation** - Created 12 missing ADRs (0016-0027)
  - Query Pipeline Architecture
  - Unified Adapter Pattern
  - CRUD Handler Factory
  - Configuration Registry
  - Hybrid DI Container
  - Event-Driven Cache Invalidation
  - Embedding Queue Mechanics
  - Memory Coordinator
  - Error Sanitization
  - Test Isolation Pattern
  - Hook/Plugin System
  - LRU Cache Implementation

---

## Backlog

_Ideas and tasks for future consideration:_

- [ ] Add cross-encoder re-ranking toggle for production benchmarks
- [ ] Implement query decomposition for multi-hop retrieval
- [ ] Add Cursor IDE hook support
- [ ] Add VS Code IDE hook support
- [ ] PostgreSQL performance benchmarks vs SQLite

---

## Notes

- This file is the source of truth for development tasks
- Update status as work progresses
- Add discovered issues to "Pending Verification" with appropriate priority
- Move completed items to "Completed" section with date
- **Retrieval & Extraction Audit**: 235 tasks identified through comprehensive codebase exploration
