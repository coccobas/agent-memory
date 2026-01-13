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
- [x] 7. **No Pagination Cursor Support** - `pipeline.ts:408` - FIXED: Added cursor/offset params to BaseQueryParams, cursor decoding in resolve stage, cursor encoding in buildQueryResult
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
- [x] 17. **No Query Result Invalidation on Cascade Deletes** - `index.ts:178-186` - FIXED: On delete actions, now invalidates ALL caches to handle cross-scope relations
- [x] 18. **Missing Limit Enforcement in FTS Scored Results** - FIXED: Added limit slicing in fallback path
- [x] 19. **No Support for Excluding Search Terms** - Missing `-term` syntax support - **DECISION: BACKLOG**
- [x] 20. **Missing Query Analytics** - No structured success/failure rate capture - **DECISION: BACKLOG**
- [x] 21. **No Result Diversification** - Results could all be from same scope/category - **DECISION: BACKLOG**
- [x] 22. **No Late Binding for Dependencies** - `index.ts:51-53` - FIXED: Added MutablePipelineDependencies with updateDependencies() method for runtime service swapping

#### Hidden Complexity
- [x] 23. **FTS Expanded Query Weight Handling Unclear** - VERIFIED: weight IS applied at line 122 (score * query.weight), matchWeights map is unused cleanup
- [x] 24. **Semantic Score Deduplication Issue** - VERIFIED: weight IS applied at line 130 (score * weight), max-score dedup is intentional
- [x] 25. **Phase 1 Light Score May Not Preserve Top Candidates** - ANALYZED: 1.5x buffer is intentional trade-off for performance, could increase if recall issues arise
- [x] 26. **Feedback Multiplier Doesn't Account for Recency** - `feedback-cache.ts:267-285` old feedback distorts - **DECISION: WONTFIX**
- [x] 27. **Cached Feedback Has No Invalidation Trigger** - VERIFIED: feedback/index.ts:300-311 invalidates cache when outcomes are recorded
- [x] 28. **Post-Filter Tags Stage Has Resource Overhead** - FIXED: Added getTagsForEntriesBatch() that loads all entry types in a single DB call instead of 4 separate calls
- [x] 29. **Cross-Encoder Re-ranking Score Blending Not Configurable** - VERIFIED: alpha IS configurable via AGENT_MEMORY_CROSS_ENCODER_ALPHA
- [x] 30. **Hierarchical Filtering May Drop Relevant Results** - FIXED: Now preserves candidateScores from retrieval and merges into semanticScores for proper re-ranking

#### Configuration
- [x] 31. **Hardcoded Timeout Missing** - VERIFIED: Embedding service has 60s timeout (embedding.service.ts:149,161)
- [x] 32. **No Circuit Breaker for External Services** - VERIFIED: DLQ has useCircuitBreaker, rate limiter has burst protection, withRetry has backoff
- [x] 33. **Scope Chain Cache TTL Not Configurable** - `scope-chain.ts:31` - FIXED: Now uses config.cache.scopeCacheTTLMs (AGENT_MEMORY_SCOPE_CACHE_TTL_MS)
- [x] 34. **Feedback Cache TTL Not Applied Consistently** - `feedback-cache.ts:80` - FIXED: Now passes TTL to LRUCache constructor for consistent expiration
- [x] 35. **FTS BM25 Normalization Formula Not Documented** - FIXED: Added comprehensive JSDoc with formula explanation

#### Edge Cases
- [x] 36. **No Handling for Very Large Embeddings** - VERIFIED: cosineSimilarity handles zero-length/magnitude (returns 0.0)
- [x] 37. **Empty Type Array Not Validated** - VERIFIED: resolve.ts:26-29 correctly falls back to DEFAULT_TYPES
- [x] 38. **Negative Limit Values Not Prevented** - VERIFIED: resolve.ts:36 checks `> 0` before using value
- [x] 39. **No Handling for Circular Relations** - VERIFIED: CTE uses UNION+DISTINCT, BFS uses visited Set
- [x] 40. **Missing Memory Pressure Handling** - VERIFIED: MemoryCoordinator exists and manages caches. Intermediate result sets during processing are bounded by limit param.

#### Architecture
- [x] 41. **Context Type Safety Issues** - ANALYZED: Type casts are TypeScript pattern for progressive context enrichment. Would need branded types or type guards to eliminate.
- [x] 42. **Pipeline Stage Ordering Not Validated** - FIXED: Added completedStages tracking, PIPELINE_STAGES constants, STAGE_PREREQUISITES map, and validateStagePrerequisites() function (dev-only validation)
- [x] 43. **Missing Dry-Run Mode** - FIXED: Added dryRun param to BaseQueryParams, executeDryRun() function returning DryRunResult with plan, validation errors, and complexity estimate
- [x] 44. **Limited Observable Telemetry** - FIXED: Added PipelineTelemetry type with stage timing, decisions tracking, and scoring summary. Added initializeTelemetry(), recordStageTelemetry(), recordDecision(), finalizeTelemetry() helpers

---

### EXTRACTION SERVICES (Tasks 45-120)

#### Extraction Service Core
- [x] 45. **Missing Batch Processing** - FIXED: Added extractBatch() method with configurable concurrency and continueOnError options
- [x] 46. **Hardcoded MAX_CONTEXT_LENGTH** - FIXED: Added AGENT_MEMORY_EXTRACTION_MAX_CONTEXT_LENGTH config option (default 100KB, range 10KB-1MB)
- [x] 47. **No Partial Extraction Retry** - FIXED: Added enablePartialRetry option that retries with 50% context on failure, returns partial=true result with error details
- [x] 48. **Missing Input Validation for contextType** - FIXED: Added runtime validation with warning log, defaults to 'mixed' on invalid value
- [x] 49. **Confidence Score Normalization Issue** - FIXED: Added normalizeConfidence() helper that logs warning when confidence is outside [0,1] range
- [x] 50. **No Deduplication Within Single Extraction** - FIXED: Added deduplicateEntries(), deduplicateEntities(), deduplicateRelationships() helpers that keep highest confidence on duplicates
- [x] 51. **Missing Error Context in Retry** - FIXED: Enhanced retry logs with full error context (name, message, stack, provider, model)
- [x] 52. **SSRF Validation Incomplete** - FIXED: Added IPv6 zone ID stripping (e.g., fe80::1%eth0) with warning log before SSRF validation
- [x] 53. **No Rate Limiting Between Requests** - VERIFIED: Token bucket rate limiter exists (rate-limiter-core.ts) with per-agent, global, and burst limits
- [x] 54. **Provider State Tracking Issue** - FIXED: Moved module-level hasWarnedAboutProvider to warningState object with ExtractionService.resetWarningState() for test isolation
- [x] 55. **Missing Temperature Validation** - VERIFIED: Config schema validates with z.number().min(0).max(2)
- [x] 56. **Timeout Not Cancellable** - VERIFIED: withTimeout() has proper cleanup with clearTimeout() in finally block at line 766
- [x] 57. **Missing Ollama Response Validation** - FIXED: Added JSON parse error handling, Ollama error response check, and type validation for response field
- [x] 58. **Parsing Fallback Is Silent** - FIXED: Enhanced error logging with parseError details, contentLength, reason field (JSON_PARSE_FAILURE/INVALID_RESPONSE_STRUCTURE)

#### Extraction Hook Service
- [x] 59. **Regex State Management Vulnerability** - VERIFIED: Line 247 correctly resets lastIndex = 0 before each pattern
- [x] 60. **Hash Collision Vulnerability** - FIXED: Replaced djb2 with FNV-1a hash + content length for better distribution
- [x] 61. **Hardcoded Confidence Thresholds** - FIXED: Added config section `suggest` with AGENT_MEMORY_SUGGEST_MIN_CONFIDENCE (default 0.7), AGENT_MEMORY_SUGGEST_MAX_SUGGESTIONS (default 5), AGENT_MEMORY_SUGGEST_MIN_CONTENT_LENGTH (default 15)
- [x] 62. **No Max Pattern Match Limit** - FIXED: Added MAX_MATCHES_PER_PATTERN=100 limit with debug logging when reached
- [x] 63. **Pattern Efficiency Issue** - FIXED: Implemented parallel pattern processing with confidence tier grouping (high >= 0.85, medium >= 0.75). Patterns grouped at construction, processed in parallel with Promise.all per tier, early exit when enough high-confidence suggestions found. Added scanSync() for backward compatibility.
- [x] 64. **Cooldown Resolution Too Coarse** - VERIFIED: Date.now() has 1ms precision, adequate for 5-30 second cooldowns
- [x] 65. **No Extraction Patterns for Errors** - FIXED: Added 8 error handling patterns covering error meanings, error codes, fix instructions, handling guidelines, and solution documentation. Added 'error_handling' category to SuggestedCategory.

#### Entity Extraction Service
- [x] 66. **Function Name Extraction Too Aggressive** - ANALYZED: Enhancement - could add more exclusion patterns but current regex is reasonable
- [x] 67. **Package Name Regex Missing Patterns** - ANALYZED: Enhancement - handles scoped and path packages, single-word packages are harder to distinguish from words
- [x] 68. **File Path Pattern Too Restrictive** - ANALYZED: Enhancement - extension requirement reduces false positives, extensionless paths are rare
- [x] 69. **Entity Type Inference Weak** - ANALYZED: Enhancement - mapping to 'concept' is conservative safe default, could add more heuristics
- [x] 70. **Variants Generation Incomplete** - ANALYZED: Enhancement - current variants cover main cases (case variants, parts), transliteration is edge case
- [x] 71. **Confidence Calculation Hardcoded** - ANALYZED: Enhancement - confidence values are type-specific and reasonable, could make configurable
- [x] 72. **Singleton Pattern Issue** - ANALYZED: Already @deprecated, recommends DI via context.services.entityExtractor

#### Experience Capture
- [x] 73. **Incomplete Trajectory Extraction** - ANALYZED: Enhancement - could add error field to trajectory, but success:false conveys failure
- [x] 74. **Confidence Threshold Not Applied to Trajectory** - ANALYZED: Enhancement - could filter steps by confidence, but all steps are useful context
- [x] 75. **Hash-Based Duplicate Detection Weak** - ANALYZED: Hash-based dedup is sufficient for session-level dedup, semantic would be costly
- [x] 76. **No Batch Experience Creation** - ANALYZED: One-by-one is simpler and provides better error isolation per experience
- [x] 77. **Provider Fallback Chain Missing** - ANALYZED: Enhancement - could add fallback chain, but explicit provider config is more predictable
- [x] 78. **Metric Aggregation Inaccurate** - VERIFIED: uniqueToolsUsed is Set<string> (types.ts:47, state.ts:79) - no duplicates by definition
- [x] 79. **Silent Failure on Transcript Format Issue** - ANALYZED: Enhancement - formatTranscript handles empty arrays gracefully (returns empty string)
- [x] 80. **No Content Validation Before DB Write** - ANALYZED: Repository layer handles validation (Zod schemas on input types)

#### Hierarchical Summarization
- [x] 81. **Summarizer Initialization Error Swallowed** - ANALYZED: Defensive coding - logs warning and gracefully degrades. Service logs hasSummarizer state at init.
- [x] 82. **inferMemberType Hardcoded Fallback** - ANALYZED: Enhancement - 'knowledge' is reasonable default for unknown types
- [x] 83. **No Recursive Depth Limit** - VERIFIED: Line 337 checks currentLevel > maxLevels to bound recursion
- [x] 84. **Embedding Cache Not Implemented** - ANALYZED: Enhancement - would improve performance but embedding service may have its own caching
- [x] 85. **Community Cohesion Not Validated** - ANALYZED: Enhancement - cohesion metrics are optional quality indicators
- [x] 86. **Member Type Inference Lost** - ANALYZED: Enhancement - type inference is best-effort, fallback to generic type is safe

#### Query Rewrite Service
- [x] 87. **Decomposition Plan Not Validated** - VERIFIED: query-rewrite.service.ts:221 checks `decompositionPlan.subQueries.length === 0` and falls back to original query if empty
- [x] 88. **Query Weight Normalization Missing** - ANALYZED: Enhancement - weights are per-query type, normalization would add complexity
- [x] 89. **HyDE Embedding Memory Not Freed** - ANALYZED: Enhancement - embeddings are small vectors, GC handles cleanup after response
- [x] 90. **Singleton Reset Needed in Tests** - VERIFIED: resetQueryRewriteService() exists at lines 446-448

#### LLM Summarizer
- [x] 91. **Default Model Hardcoded** - ANALYZED: Enhancement - config-driven model selection exists, default is reasonable fallback
- [x] 92. **No Streaming Support** - ANALYZED: Enhancement - streaming would require API changes, batch is sufficient for summarization
- [x] 93. **Batch Processing Inefficient** - ANALYZED: Enhancement - sequential is simpler and rate-limit friendly, parallel would need concurrency control
- [x] 94. **Model Name Validation Too Restrictive** - ANALYZED: Enhancement - validation prevents typos, can be relaxed if needed

#### Atomicity Service
- [x] 95. **Imperative Verb List Incomplete** - ANALYZED: Enhancement - current list covers common cases, can be extended
- [x] 96. **Sentence Splitting Unreliable** - VERIFIED: Lookbehind IS supported in Node.js v8.10+ (only runtime for this package). Line 232 uses `(?<=[.!?])` which is valid.
- [x] 97. **Split Confidence Reduction Arbitrary** - ANALYZED: Enhancement - 0.95 is reasonable, could make configurable
- [x] 98. **Tool Splitting Too Conservative** - ANALYZED: Enhancement - conservative prevents false splits, better precision over recall

#### Configuration & Security
- [x] 99. **API Key Exposure in Logs** - VERIFIED: Pino logger has built-in redaction for apiKey, openaiApiKey, token, secret, password paths (logger.ts:62-82)
- [x] 100. **Missing Rate Limit Handling** - VERIFIED: RateLimitError exists, 429 handled in tool-runner.ts and auth.ts
- [x] 101. **Timeout Values Inconsistent** - ANALYZED: Enhancement - different services have different latency profiles, inconsistency is intentional
- [x] 102. **Environment Variable Parsing Issues** - VERIFIED: Lines 968-971 validate with isNaN check, Math.max(1000) min, fallback to 30000

#### Performance
- [x] 103. **No Input Length Validation Before Processing** - VERIFIED: Lines 780-783 check context.length > MAX_CONTEXT_LENGTH before API call
- [x] 104. **Regex Compilation Not Cached** - ANALYZED: Enhancement - regex creation is fast, caching adds complexity for minor gain
- [x] 105. **No Request Deduplication** - ANALYZED: Enhancement - would require content hashing and cache, complexity vs benefit tradeoff
- [x] 106. **Memory Growth in Long Sessions** - ANALYZED: Enhancement - session-scoped sets are bounded by session lifetime, cleared on session end

#### Missing Features
- [x] 107. **No Extraction Metrics/Observability** - ANALYZED: Enhancement - logger provides basic observability, metrics could be added
- [x] 108. **No Extraction Versioning** - ANALYZED: Enhancement - entries have createdAt/updatedAt, full versioning is separate feature
- [x] 109. **No Extraction Explanation Generation** - ANALYZED: Enhancement - would require LLM call, adds latency and cost
- [x] 110. **No Multi-Language Support** - ANALYZED: Enhancement - English-first is reasonable for code/technical context
- [x] 111. **No Extraction Feedback Loop** - ANALYZED: Enhancement - feedback system exists for entries, extraction feedback is separate feature

#### Error Handling
- [x] 112. **Provider Mismatch Not Detected** - ANALYZED: Enhancement - early validation could improve UX but current error is informative
- [x] 113. **Missing Network Error Classification** - VERIFIED: isRetryableNetworkError() classifies timeout, econnreset, econnrefused, socket hang up, 502/503/504
- [x] 114. **No Circuit Breaker Pattern** - VERIFIED: DLQ has circuit breaker (useCircuitBreaker: true), rate-limiter has burst protection
- [x] 115. **Parsing Error Recovery Non-Obvious** - ANALYZED: Task 58 added detailed logging with reason field for parse failures

#### Edge Cases
- [x] 116. **Empty Extraction Results Ambiguous** - ANALYZED: Task 58 added reason field to distinguish parse failure from empty results
- [x] 117. **Very Long Entity Names** - ANALYZED: Enhancement - DB layer has column limits, validation could be added at extraction layer
- [x] 118. **Circular Relationships** - VERIFIED: CTE uses UNION+DISTINCT, BFS uses visited Set (see task 39)
- [x] 119. **Unicode Handling** - ANALYZED: Enhancement - patterns use \w which handles basic Latin, full Unicode support is enhancement
- [x] 120. **Deeply Nested Structures** - ANALYZED: Enhancement - trajectory depth is bounded by conversation length, practical limit exists

---

### EMBEDDING & VECTOR SEARCH (Tasks 121-235)

#### Embedding Service Core
- [x] 121. **No validation of embedding array elements** - FIXED: Added validateEmbedding() and validateEmbeddingBatch() helpers that check for NaN/Infinity and replace with 0
- [x] 122. **Cache key collision vulnerability** - ANALYZED: Non-issue - cache keys are used as-is with Map.get(), not parsed back. Format `provider:type:text` is unambiguous.
- [x] 123. **Missing cache statistics** - FIXED: Added cacheHits/cacheMisses counters and getCacheStats() method returning size, hits, misses, and hitRate
- [x] 124. **Hardcoded embedding dimensions** - FIXED: Added configurable dimensions via AGENT_MEMORY_EMBEDDING_*_DIMENSION env vars (openai, lmstudio, local)
- [x] 125. **No embedding output validation** - FIXED: validateEmbedding() checks array length and value validity after API call
- [x] 126. **Silent provider fallback risk** - FIXED: Added warning when OpenAI provider configured but API key missing
- [x] 127. **Memory leak potential in cache eviction** - ANALYZED: Batch eviction exists at line 392-396, evicts until under limit
- [x] 128. **No cache serialization** - ANALYZED: Enhancement - in-memory cache is intentional for simplicity, persistence would add complexity
- [x] 129. **Instruction wrapping inconsistency** - ANALYZED: Enhancement - wrapWithInstruction has asymmetric mode for query vs document
- [x] 130. **Missing embedding tokenization validation** - ANALYZED: Enhancement - would require model-specific tokenizer, API handles truncation
- [x] 131. **OpenAI batch size not configurable** - ANALYZED: Enhancement - 2048 is OpenAI's limit, configurable via code change
- [x] 132. **No retry exponential backoff** - VERIFIED: retry.ts uses backoffMultiplier, DLQ has exponential backoff, configurable via AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER
- [x] 133. **LM Studio dimension detection race condition** - ANALYZED: Enhancement - single instance per process, race unlikely in practice
- [x] 134. **Local model lazy loading not thread-safe** - ANALYZED: Already has localPipelinePromise deduplication for concurrent loads
- [x] 135. **Float32Array conversion loses precision** - ANALYZED: 32-bit float precision is sufficient for embedding similarity
- [x] 136. **No embedding model version tracking** - VERIFIED: embedding_model column exists and is populated via embedding-hooks.ts
- [x] 137. **Disabled provider throws instead of graceful degradation** - ANALYZED: Throwing is intentional - callers can check isAvailable() first
- [x] 138. **Max cache size never decreased** - ANALYZED: Map size is managed by eviction, shrinking Map is JS engine behavior
- [x] 139. **No warning on dimension mismatch** - VERIFIED: logger.warn at lancedb.ts:88 and pgvector.ts:88 logs dimension mismatch

#### Embedding Hooks & Queue
- [x] 140. **Sequence number can overflow** - ANALYZED: Uses Number.MAX_SAFE_INTEGER (~9 quadrillion), overflow would take centuries at 1M ops/sec
- [x] 141. **Stale job detection race condition** - ANALYZED: Enhancement - window-based staleness is best-effort, not critical for consistency
- [x] 142. **No maximum queue depth limit** - ANALYZED: Enhancement - queue is bounded by pending entries in DB, not unbounded
- [x] 143. **Batch splitting doesn't preserve order** - ANALYZED: Enhancement - order preserved within batch, cross-batch order not guaranteed
- [x] 144. **Retry delay calculation doesn't account for clock skew** - ANALYZED: Enhancement - millisecond precision sufficient for retry delays
- [x] 145. **Concurrent batch processing leak** - ANALYZED: Enhancement - batch retry is simpler, individual retry adds complexity
- [x] 146. **Dead Letter Queue only stores first 100 chars** - ANALYZED: Enhancement - full content available via entry lookup
- [x] 147. **No circuit breaker pattern** - VERIFIED: DLQ has `useCircuitBreaker: true` in default config (dead-letter-queue.ts:78)
- [x] 148. **Stale job skipping doesn't clean up entry embeddings** - ANALYZED: Enhancement - orphaned rows cleaned by reindex command
- [x] 149. **Batch job failure atomicity issue** - ANALYZED: Enhancement - partial failure is acceptable, retry handles inconsistency
- [x] 150. **No maximum batch processing time** - ANALYZED: Enhancement - timeout exists per API call, batch size limits total time
- [x] 151. **Queue stats don't track queue depth over time** - ANALYZED: Enhancement - point-in-time stats sufficient for debugging
- [x] 152. **No mechanism to prioritize urgent embedding jobs** - ANALYZED: Enhancement - FIFO is simple and fair
- [x] 153. **Re-enqueued jobs lose original timestamp** - ANALYZED: Enhancement - retry count tracked, original timestamp less important
- [x] 154. **Concurrent state mutation in retryFailedEmbeddings** - ANALYZED: Enhancement - single caller pattern expected, could add mutex

#### LanceDB Issues
- [x] 155. **Vector dimension inference happens on first store** - ANALYZED: Dimension lock is intentional - consistent embeddings required for similarity search
- [x] 156. **No validation that vector values are normalized** - ANALYZED: Enhancement - normalization not required for all distance metrics
- [x] 157. **Identifier validation is overly restrictive** - VERIFIED: Regex `/^[a-zA-Z0-9_-]+$/` at lancedb.ts:29 DOES allow UUIDs (alphanumeric+hyphens). Tested: `550e8400-e29b-41d4-a716-446655440000` passes.
- [x] 158. **Quantization index creation happens async fire-and-forget** - ANALYZED: Enhancement - index creation is non-blocking by design, errors logged
- [x] 159. **No index statistics tracking** - ANALYZED: Enhancement - LanceDB doesn't expose index stats, would need custom tracking
- [x] 160. **Distance-to-similarity conversion varies by metric** - FIXED: Task 220 fixed L2 formula to use 1/(1+distance)
- [x] 161. **Search result type assertion is risky** - VERIFIED: lancedb.ts:389-398 HAS field validation checking typeof, null, and all required fields (entryType, entryId, versionId, text) before type assertion
- [x] 162. **Empty search handling returns silently** - ANALYZED: Enhancement - empty array is valid result, callers can check isInitialized()
- [x] 163. **Multiple concurrent index creation attempts** - VERIFIED: lancedb.ts:235-238 HAS concurrency protection - `if (this.createIndexPromise) return this.createIndexPromise;` deduplicates concurrent calls
- [x] 164. **No timeout on connection establishment** - ANALYZED: LanceDB has 30s timeout (lancedb.ts:106-117), pgvector uses pool with connection timeout config
- [x] 165. **Count operation returns 0 on error silently** - ANALYZED: Enhancement - 0 is safe fallback, error already logged

#### pgvector Issues
- [x] 166. **HNSW index parameters hardcoded** - ANALYZED: Enhancement - m=16, ef_construction=64 are well-tuned defaults, could be configurable
- [x] 167. **Dimension validation is overly strict** - ANALYZED: 10,000 is above typical embedding dimensions (384-4096), sufficient for current models
- [x] 168. **Vector string conversion has precision loss** - ANALYZED: Float64 to string precision is sufficient for similarity search
- [x] 169. **Search query has SQL injection vulnerability** - VERIFIED SAFE: entryTypes uses parameterized $2 with ANY() operator
- [x] 170. **ALTER TABLE to specify dimension is risky** - ANALYZED: Dimension set once at table creation, ALTER only for initial setup
- [x] 171. **Distance-to-similarity conversion for dot product incorrect** - ANALYZED: Formula (1-distance)/2 with clamp handles non-unit vectors correctly
- [x] 172. **Pool client release in finally block could throw** - ANALYZED: Enhancement - release errors are rare and non-critical
- [x] 173. **No prepared statement usage** - ANALYZED: Enhancement - queries are parameterized for security, prepared statements for performance
- [x] 174. **Index creation doesn't fail gracefully if dimension varies** - ANALYZED: Dimension is fixed at table creation, variance is configuration error

#### Vector Service
- [x] 175. **Dimension mismatch error includes suggestion but doesn't prevent further errors** - ANALYZED: Error is thrown immediately, no cascade possible
- [x] 176. **State machine allows operations from 'error' state** - VERIFIED: ensureInitialized() throws immediately at lines 150-152 when state is 'error'. All operations (store, search, remove, count) call ensureInitialized()
- [x] 177. **Closed state is terminal but not checked consistently** - ANALYZED: ensureInitialized() checks for 'ready' state, closed is handled
- [x] 178. **No metrics tracking for vector operations** - ANALYZED: Enhancement - basic timing logged, full metrics could be added
- [x] 179. **Initialization promise not cleared if timeout occurs** - ANALYZED: Enhancement - rare edge case, service restart handles
- [x] 180. **Delete operation doesn't verify deletion success** - ANALYZED: Enhancement - backend verifies, no silent failure
- [x] 181. **Automatic old version deletion on store could fail silently** - VERIFIED: Errors are caught and rethrown (vector.service.ts:224-226), env var only skips deletion
- [x] 182. **No batch delete operation** - ANALYZED: Enhancement - batch delete would improve performance for bulk operations
- [x] 183. **Search limit parameter not validated** - ANALYZED: Enhancement - could add min/max validation, current behavior handles gracefully

#### Schema & Tracking
- [x] 184. **No foreign key constraint to entries** - ANALYZED: Enhancement - FK constraints add complexity, orphan cleanup via maintenance job
- [x] 185. **No index on (entryType, hasEmbedding)** - ANALYZED: Enhancement - query patterns indexed appropriately, additional indexes add write overhead
- [x] 186. **createdAt/updatedAt use database default** - ANALYZED: Enhancement - UTC timestamps are consistent, display timezone is configurable
- [x] 187. **No audit trail for embedding failures** - ANALYZED: Enhancement - DLQ provides failure tracking, detailed audit is separate feature
- [x] 188. **Model/provider fields not nullable but could be missing** - VERIFIED: embeddingModel and embeddingProvider ARE nullable (no .notNull() at embeddings.ts:19-20)
- [x] 189. **Version ID tracking doesn't cascade on entry deletion** - ANALYZED: Enhancement - orphan cleanup via reindex command

#### Integration Issues
- [x] 190. **No atomic transaction for embedding + DB metadata writes** - ANALYZED: Enhancement - eventual consistency acceptable for embeddings
- [x] 191. **Query embedding asymmetry not documented** - VERIFIED: JSDoc at lines 59-66 documents lmStudioQueryInstruction vs lmStudioDocumentInstruction
- [x] 192. **Semantic stage assumes dimensionality matching** - VERIFIED: Dimension check is in vector.service.ts:238-253 (correct architectural layer)
- [x] 193. **HyDE embedding weight application is ad-hoc** - ANALYZED: Enhancement - max score approach is simple and effective
- [x] 194. **Batch embedding doesn't preserve original text order** - ANALYZED: Order preserved - results returned in same order as input array
- [x] 195. **Embedding cache not considered in query pipeline** - ANALYZED: Cache is per-service instance, pipeline uses same instance

#### Configuration & Scaling
- [x] 196. **Batch size configuration lacks upper bound validation** - VERIFIED: Zod schema z.number().int().min(1).max(100) at embedding.ts:49
- [x] 197. **Max concurrency default not justified** - ANALYZED: Values are tuned for common hardware, configurable via env
- [x] 198. **No adaptive batch sizing based on response times** - ANALYZED: Enhancement - fixed batch size is simpler and predictable
- [x] 199. **Retry delay exponential backoff could exceed timeout** - VERIFIED: Math.min(delay, opts.maxDelayMs) at retry.ts:55 caps delay
- [x] 200. **No sample of successful vs failed embedding models** - ANALYZED: Enhancement - model reliability tracked via DLQ failure counts
- [x] 201. **Vector DB quantization thresholds not configurable** - VERIFIED: Configurable via AGENT_MEMORY_VECTOR_INDEX_THRESHOLD (vectorDb.ts:46-52)
- [x] 202. **No warmup phase for embedding models** - ANALYZED: Enhancement - first embedding latency is acceptable, warmup adds complexity

#### Error Handling & Resilience
- [x] 203. **EmbeddingDisabledError doesn't distinguish intentionally disabled vs unavailable** - ANALYZED: Enhancement - isAvailable() check before operations provides distinction
- [x] 204. **Empty text error doesn't trim/normalize first** - VERIFIED: embedding.service.ts:234 trims text before checking empty
- [x] 205. **Network errors during embedding assumed transient** - ANALYZED: isRetryableNetworkError classifies error types appropriately
- [x] 206. **Vector store initialization failure allows operations to proceed** - VERIFIED: Error state throws (vector.service.ts:150-152), isAvailable() enables graceful degradation (intentional)
- [x] 207. **Dead Letter Queue has no expiration** - ANALYZED: Enhancement - manual cleanup via reindex --clear-failed, auto-expiration adds complexity
- [x] 208. **No mechanism to manually retry DLQ entries** - VERIFIED: `retryFailedEmbeddings()` and `reindex --retry-failed` CLI command exist

#### Observability & Debugging
- [x] 209. **No distributed tracing for embedding operations** - ANALYZED: Enhancement - request IDs logged, full tracing is separate feature
- [x] 210. **EmbeddingQueueStats doesn't track latency percentiles** - ANALYZED: Enhancement - basic stats sufficient, percentiles add complexity
- [x] 211. **No per-provider metrics** - ANALYZED: Enhancement - provider logged per operation, aggregation is separate
- [x] 212. **Embedding failures logged but not queryable** - ANALYZED: Enhancement - DLQ provides failure records, query via DB
- [x] 213. **Dimension mismatch errors don't suggest remediation** - VERIFIED: vector.service.ts:245 includes suggestion: 'Ensure the query embedding uses the same model as stored embeddings'
- [x] 214. **Cache hit/miss not logged** - ANALYZED: Enhancement - would add log noise, cache stats available via getStats()

#### Performance & Scaling
- [x] 215. **Embedding cache size fixed at 1000 entries** - ANALYZED: Enhancement - 1000 is reasonable default, could be configurable
- [x] 216. **No embedding result deduplication** - ANALYZED: Cache provides deduplication for repeated queries
- [x] 217. **Vector search limit multiplied by 3 for hybrid search** - ANALYZED: Comment at semantic.ts:126 explains purpose (fetch more for scoring), factor could be configurable
- [x] 218. **No pre-warming of popular embeddings** - ANALYZED: Enhancement - warmup adds startup complexity, lazy loading is simpler
- [x] 219. **Batch processing doesn't pipeline** - ANALYZED: Enhancement - pipelining adds complexity, sequential is reliable
- [x] 220. **L2 distance formula in LanceDB incorrect** - FIXED: Changed from 1-d/2 to 1/(1+d) to properly map any distance to [0,1]

#### Edge Cases Not Handled
- [x] 221. **Empty entry after filtering/normalization** - ANALYZED: embedBatch filters empty strings after normalization
- [x] 222. **Very large entries (megabytes)** - ANALYZED: Config maxContextLength limits input size before embedding
- [x] 223. **Embedding dimension changes mid-deployment** - ANALYZED: Enhancement - reindex command handles re-embedding with new model
- [x] 224. **Concurrent dimension changes** - ANALYZED: Dimension locked on first store, subsequent stores validated
- [x] 225. **Network partition during batch embedding** - ANALYZED: DLQ handles failures, retry recovers partial batches
- [x] 226. **Clock skew on retry timing** - ANALYZED: Enhancement - millisecond skew is negligible for retry delays
- [x] 227. **Floating point precision edge cases** - FIXED: Task 121 added validateEmbedding() that checks for NaN/Infinity

#### Missing Features
- [x] 228. **No embedding versioning** - VERIFIED: embedding_model column tracks model version (see task 136)
- [x] 229. **No way to update embeddings for changed entries** - VERIFIED: `generateEmbeddingAsync()` called in all repository update methods (guidelines.ts:316, knowledge.ts:314, tools.ts:285, experiences.ts:341)
- [x] 230. **No bulk re-embedding capability** - VERIFIED: `reindex` command provides bulk re-embedding via `backfillEmbeddings()` with batch processing
- [x] 231. **No embedding similarity statistics** - ANALYZED: Enhancement - quality auditing is separate feature
- [x] 232. **No search result explanation** - ANALYZED: Enhancement - explainability is separate feature
- [x] 233. **No embedding model switching support** - VERIFIED: Model configurable via env/config, `embedding_model` stored per embedding for tracking
- [x] 234. **No incremental indexing progress** - VERIFIED: `reindex` command has `onProgress` callback showing percent complete
- [x] 235. **No cost tracking** - ANALYZED: Enhancement - API usage cost tracking is separate feature

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

- [x] Add cross-encoder re-ranking toggle for production benchmarks - FIXED: Added `useCrossEncoder` param to DefaultQuery that overrides global AGENT_MEMORY_CROSS_ENCODER_ENABLED setting. Useful for A/B testing and benchmarking.
- [x] Implement query decomposition for multi-hop retrieval - FIXED: Added configurable decomposition settings (AGENT_MEMORY_DECOMPOSITION_THRESHOLD, AGENT_MEMORY_DECOMPOSITION_MAX_SUB_QUERIES, AGENT_MEMORY_DECOMPOSITION_USE_LLM). Pattern-based decomposition handles multi_topic, comparison, temporal_chain, and causal query types. LLM-based decomposition infrastructure is in place for future enhancement.
- [ ] PostgreSQL performance benchmarks vs SQLite

---

## Notes

- This file is the source of truth for development tasks
- Update status as work progresses
- Add discovered issues to "Pending Verification" with appropriate priority
- Move completed items to "Completed" section with date
- **Retrieval & Extraction Audit**: 235 tasks identified through comprehensive codebase exploration
