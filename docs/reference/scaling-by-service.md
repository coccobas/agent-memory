# Scaling Limits by Service

Service-specific scaling constraints and configuration options for Agent Memory.

> **Related:** [Scaling Guide](../SCALING.md) | [ADR-0015: Scaling Strategy](../adr/0015-scaling-strategy.md) | [Environment Variables](./env-vars.md)

---

## Overview

This document details per-service scaling characteristics to help you identify bottlenecks and tune configurations. Each service has different constraints depending on your backend (SQLite vs PostgreSQL vs PostgreSQL+Redis).

---

## Service Matrix

| Service               | SQLite Limits                | PostgreSQL Limits    | Redis Benefits      |
| --------------------- | ---------------------------- | -------------------- | ------------------- |
| Query Pipeline        | 5 concurrent queries         | Pool-limited (10-20) | Distributed cache   |
| Embedding Service     | 16 concurrent (configurable) | 16 concurrent        | Queue distribution  |
| Librarian Maintenance | 100 entries/run              | 500+ entries/run     | Distributed locks   |
| File Locks            | Single-instance only         | Instance-local       | Cross-instance      |
| FTS Search            | ~3,000 ops/sec               | ~5,000 ops/sec       | -                   |
| Rate Limiting         | Per-instance                 | Per-instance         | Global cluster-wide |

---

## Query Pipeline

**Source:** `src/services/query/`, `src/config/registry/sections/pagination.ts`

The query pipeline orchestrates search across multiple stages: FTS, semantic search, graph traversal, and scoring.

### Configuration

```bash
# Maximum concurrent query executions (default: 5)
# Increase for high-throughput read workloads
AGENT_MEMORY_QUERY_MAX_CONCURRENT=5

# Default query limit (default: 20)
AGENT_MEMORY_DEFAULT_QUERY_LIMIT=20

# Maximum query limit (default: 100)
AGENT_MEMORY_MAX_QUERY_LIMIT=100
```

### Limits by Backend

| Backend            | Concurrent Queries | Notes                                                        |
| ------------------ | ------------------ | ------------------------------------------------------------ |
| SQLite             | 5 (default)        | Limited by file locking; reads can proceed concurrently      |
| PostgreSQL         | 10-20              | Pool-limited; increase `AGENT_MEMORY_PG_POOL_MAX`            |
| PostgreSQL + Redis | 10-20              | Cache reduces DB load; set `AGENT_MEMORY_REDIS_CACHE_TTL_MS` |

### Bottleneck Indicators

- High query latency (>100ms p99)
- Connection pool exhaustion
- Cache eviction rate >100/min

### Tuning Recommendations

1. **Increase cache TTL** for read-heavy workloads:

   ```bash
   AGENT_MEMORY_QUERY_CACHE_TTL_MS=600000  # 10 minutes
   ```

2. **Enable hierarchical context** to reduce response size:

   ```json
   { "action": "context", "hierarchical": true }
   ```

   Returns ~1.5k tokens instead of ~15k tokens.

3. **Use Redis** for multi-instance deployments to share cache.

---

## Embedding Service

**Source:** `src/config/registry/sections/embedding.ts`, `src/services/embedding.service.ts`

Generates text embeddings for semantic search. Supports OpenAI, LM Studio, and local providers.

### Configuration

```bash
# Maximum concurrent embedding requests (default: 16)
AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY=16

# Batch size per API call (default: 20, max: 100)
# Batching is 10-100x faster than individual calls
AGENT_MEMORY_EMBEDDING_BATCH_SIZE=20

# Request timeout (default: 60000ms)
AGENT_MEMORY_EMBEDDING_TIMEOUT_MS=60000

# Retry configuration
AGENT_MEMORY_EMBEDDING_MAX_RETRIES=3
AGENT_MEMORY_EMBEDDING_RETRY_DELAY_MS=1000
```

### Limits by Provider

| Provider  | Concurrency | Batch Size | Notes                                                      |
| --------- | ----------- | ---------- | ---------------------------------------------------------- |
| OpenAI    | 16          | 20-100     | Rate-limited by OpenAI; increase batch size for throughput |
| LM Studio | 1-4         | 10-20      | CPU/GPU bound; reduce concurrency on slow hardware         |
| Local     | 1           | 1          | Single-threaded; suitable for low-volume use               |

### Bottleneck Indicators

- Embedding queue backlog growing
- Timeout errors from embedding provider
- High retry rate

### Tuning Recommendations

1. **Increase batch size** for bulk operations:

   ```bash
   AGENT_MEMORY_EMBEDDING_BATCH_SIZE=50
   ```

2. **Reduce concurrency** on resource-constrained systems:

   ```bash
   AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY=4
   ```

3. **Increase timeout** for slow models:
   ```bash
   AGENT_MEMORY_EMBEDDING_TIMEOUT_MS=120000
   ```

---

## Librarian Maintenance

**Source:** `src/services/librarian/maintenance/types.ts`, `src/services/librarian/`

Performs background maintenance: consolidation, forgetting, graph backfill, latent memory population, and tag refinement.

### Configuration

```bash
# Consolidation
AGENT_MEMORY_CONSOLIDATION_THRESHOLD=0.85    # Similarity threshold
AGENT_MEMORY_CONSOLIDATION_MAX_GROUPS=20     # Groups per run

# Forgetting
AGENT_MEMORY_FORGETTING_STALE_DAYS=90        # Days before stale
AGENT_MEMORY_FORGETTING_MAX_ENTRIES=100      # Max entries per run

# Graph backfill
AGENT_MEMORY_GRAPH_BACKFILL_BATCH_SIZE=50    # Entries per batch
AGENT_MEMORY_GRAPH_BACKFILL_MAX_ENTRIES=100  # Max entries per run

# Latent memory population
AGENT_MEMORY_LATENT_BATCH_SIZE=20            # Entries per batch
AGENT_MEMORY_LATENT_MAX_ENTRIES=100          # Max entries per run
```

### Default Batch Sizes

| Task              | Batch Size | Max Per Run | Notes                                       |
| ----------------- | ---------- | ----------- | ------------------------------------------- |
| Consolidation     | -          | 20 groups   | Similarity-based grouping                   |
| Forgetting        | -          | 100 entries | Based on recency/frequency                  |
| Graph Backfill    | 50         | 100         | Lower for session-end, higher for scheduled |
| Latent Population | 20         | 100         | Memory-intensive                            |
| Tag Refinement    | -          | 100         | Semantic similarity                         |

### Limits by Backend

| Backend            | Recommended Max Entries | Notes                                 |
| ------------------ | ----------------------- | ------------------------------------- |
| SQLite             | 50-100                  | Single writer limits throughput       |
| PostgreSQL         | 200-500                 | Connection pool allows parallelism    |
| PostgreSQL + Redis | 500+                    | Distributed locks enable coordination |

### Bottleneck Indicators

- Maintenance taking >5 minutes
- Memory usage spikes during maintenance
- Embedding API rate limits hit

### Tuning Recommendations

1. **Reduce batch sizes** for memory-constrained environments:

   ```bash
   AGENT_MEMORY_GRAPH_BACKFILL_BATCH_SIZE=20
   AGENT_MEMORY_LATENT_BATCH_SIZE=10
   ```

2. **Schedule maintenance** during low-traffic periods instead of session-end.

3. **Disable unused tasks** to reduce maintenance time.

---

## File Locks

**Source:** `src/core/adapters/local-lock.adapter.ts`, `src/core/adapters/redis-lock.adapter.ts`

Coordinates file access across agents to prevent concurrent modifications.

### Configuration

```bash
# Lock TTL (default: 30000ms)
AGENT_MEMORY_REDIS_LOCK_TTL_MS=30000

# Lock retry configuration
AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT=3
AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS=200
```

### Limits by Backend

| Backend            | Scope          | Notes                               |
| ------------------ | -------------- | ----------------------------------- |
| SQLite             | Instance-local | Locks only visible to same process  |
| PostgreSQL         | Instance-local | Each instance has independent locks |
| PostgreSQL + Redis | Cross-instance | Locks shared via Redis              |

### Bottleneck Indicators

- Lock acquisition failures
- Deadlock timeouts
- Stale locks preventing access

### Tuning Recommendations

1. **Enable Redis** for multi-instance deployments:

   ```bash
   AGENT_MEMORY_REDIS_ENABLED=true
   ```

2. **Increase lock TTL** for long operations:
   ```bash
   AGENT_MEMORY_REDIS_LOCK_TTL_MS=60000
   ```

---

## Rate Limiting

**Source:** `src/config/registry/sections/rateLimit.ts`, `src/core/adapters/redis-rate-limiter.adapter.ts`

Protects resources from overload with per-agent, global, and burst limits.

### Configuration

```bash
# Per-agent limits (default: 500 req/min)
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX=500
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS=60000

# Global limits (default: 5000 req/min)
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=5000
AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS=60000

# Burst limits (default: 50 req/sec)
AGENT_MEMORY_RATE_LIMIT_BURST_MAX=50
AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS=1000

# Disable rate limiting
AGENT_MEMORY_RATE_LIMIT=0
```

### Limits by Backend

| Backend            | Scope          | Effective Cluster Limit |
| ------------------ | -------------- | ----------------------- |
| SQLite             | Instance-local | N/A (single instance)   |
| PostgreSQL         | Instance-local | Limit × Instance Count  |
| PostgreSQL + Redis | Cluster-wide   | Configured Limit        |

### Critical Note

Without Redis, rate limits apply per-instance. With 5 instances and a 500 req/min limit, the effective cluster-wide limit is 2500 req/min. Enable Redis for true global rate limiting.

---

## Backfill Service

**Source:** `src/services/backfill.service.ts`, `src/services/graph/backfill.service.ts`

Populates embeddings and graph nodes for existing entries.

### Configuration

```bash
# Embedding backfill
AGENT_MEMORY_BACKFILL_BATCH_SIZE=50          # Entries per batch
AGENT_MEMORY_BACKFILL_DELAY_MS=100           # Delay between batches

# Reembedding service
AGENT_MEMORY_REEMBEDDING_BATCH_SIZE=10       # Entries per batch
```

### Limits

| Operation          | Default Batch | Recommended Max |
| ------------------ | ------------- | --------------- |
| Embedding backfill | 50            | 100             |
| Graph backfill     | 50            | 100             |
| Reembedding        | 10            | 20              |

### Tuning Recommendations

1. **Add delay** to avoid overwhelming embedding provider:

   ```bash
   AGENT_MEMORY_BACKFILL_DELAY_MS=500
   ```

2. **Reduce batch size** for rate-limited providers:
   ```bash
   AGENT_MEMORY_BACKFILL_BATCH_SIZE=20
   ```

---

## Extraction Service

**Source:** `src/config/registry/sections/extraction.ts`

Extracts knowledge from conversations using LLM analysis.

### Configuration

```bash
# Token limits
AGENT_MEMORY_EXTRACTION_MAX_TOKENS=4096
AGENT_MEMORY_EXTRACTION_MAX_CONTEXT_LENGTH=100000

# Incremental extraction
AGENT_MEMORY_INCREMENTAL_MAX_TOKENS=4000

# Atomicity
AGENT_MEMORY_EXTRACTION_ATOMICITY_MAX_SPLITS=5
AGENT_MEMORY_EXTRACTION_MIN_CHUNK_SIZE=300
```

### Limits

| Parameter   | Default  | Notes                   |
| ----------- | -------- | ----------------------- |
| Max tokens  | 4096     | LLM output limit        |
| Max context | 100000   | Input truncation        |
| Max splits  | 5        | Atomicity decomposition |
| Timeout     | 120000ms | LLM call timeout        |

### Tuning Recommendations

1. **Increase timeout** for slow LLM providers:

   ```bash
   AGENT_MEMORY_EXTRACTION_TIMEOUT_MS=180000
   ```

2. **Reduce context** for faster extraction:
   ```bash
   AGENT_MEMORY_EXTRACTION_MAX_CONTEXT_LENGTH=50000
   ```

---

## Cache Configuration

**Source:** `src/config/registry/sections/cache.ts`

In-memory caching for queries and scope chains.

### Configuration

```bash
# Memory limit (default: 512 MB)
AGENT_MEMORY_CACHE_LIMIT_MB=512

# Query cache TTL (default: 5 minutes)
AGENT_MEMORY_QUERY_CACHE_TTL_MS=300000

# Scope cache TTL (default: 10 minutes)
AGENT_MEMORY_SCOPE_CACHE_TTL_MS=600000

# Prepared statements limit (default: 500)
AGENT_MEMORY_MAX_PREPARED_STATEMENTS=500
```

### Limits

| Cache       | Default Size | Default TTL |
| ----------- | ------------ | ----------- |
| Query cache | 512 MB       | 5 min       |
| Scope cache | -            | 10 min      |
| Redis cache | -            | 60 min      |

---

## Retry Configuration

**Source:** `src/config/registry/sections/retry.ts`

Configures retry behavior for transient failures.

### Configuration

```bash
# Retry attempts (default: 3)
AGENT_MEMORY_RETRY_MAX_ATTEMPTS=3

# Base delay (default: 100ms)
AGENT_MEMORY_RETRY_BASE_DELAY_MS=100

# Max delay (default: 5000ms)
AGENT_MEMORY_RETRY_MAX_DELAY_MS=5000

# Backoff multiplier (default: 2)
AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER=2
```

---

## See Also

- [Scaling Guide](../SCALING.md) - General scaling overview and migration paths
- [ADR-0015: Scaling Strategy](../adr/0015-scaling-strategy.md) - Architecture decision
- [Environment Variables](./env-vars.md) - Complete configuration reference
- [Performance Guide](../guides/performance.md) - Optimization techniques
