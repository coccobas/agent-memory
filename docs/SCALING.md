# Scaling Guide

Scale Agent Memory from single-developer setups to enterprise deployments.

> **Related:** [ADR-0015: Scaling Strategy](adr/0015-scaling-strategy.md) | [Deployment Modes](guides/deployment-modes.md)

---

## Quick Decision Matrix

Choose your deployment tier based on these metrics:

| Metric                     | SQLite           | PostgreSQL        | PostgreSQL + Redis |
| -------------------------- | ---------------- | ----------------- | ------------------ |
| **Writes/second**          | < 50             | < 500/instance    | < 5000+ cluster    |
| **Instances**              | 1                | Many              | Many               |
| **Concurrent connections** | 1 writer         | Pool (2-20)       | Pool + distributed |
| **Cache scope**            | Instance-local   | Instance-local    | Distributed        |
| **File locks**             | Instance-local   | Instance-local    | Cross-instance     |
| **Event propagation**      | N/A              | N/A               | Pub/sub            |
| **Database size**          | < 10 GB          | TB+               | TB+                |
| **Setup complexity**       | None             | Moderate          | Higher             |
| **Best for**               | Dev, single-user | Production, teams | Enterprise, HA     |

**Start simple.** Begin with SQLite and migrate when you hit limitations.

---

## Understanding Your Limits

### SQLite Limitations

SQLite is excellent for getting started but has inherent constraints:

**Single Writer:**

```
Process A: WRITE (holds lock)
Process B: WRITE (blocked) --> SQLITE_BUSY error after timeout
```

SQLite uses file-level locking. WAL mode improves concurrency (readers don't block writers) but only one writer can operate at a time.

**Configuration:**

```bash
# Busy timeout - how long to wait for locks (default: 5000ms)
AGENT_MEMORY_DB_BUSY_TIMEOUT_MS=5000
```

**Warning Signs:**

- `SQLITE_BUSY` errors in logs
- `SQLITE_LOCKED` errors during concurrent access
- Increasing write latency under load
- Multiple processes accessing the same database file

### PostgreSQL Sweet Spot

PostgreSQL handles most production workloads efficiently:

**Connection Pooling:**

```
Instance A --> Pool (5 connections) --> PostgreSQL
Instance B --> Pool (5 connections) --> PostgreSQL
Instance C --> Pool (5 connections) --> PostgreSQL
```

Each instance maintains its own connection pool, enabling true concurrent writes.

**Configuration:**

```bash
AGENT_MEMORY_DB_TYPE=postgresql
AGENT_MEMORY_PG_POOL_MIN=2
AGENT_MEMORY_PG_POOL_MAX=10
```

**Pool Sizing Guidelines:**
| Deployment | Min | Max | Notes |
|------------|-----|-----|-------|
| Development | 1 | 5 | Low overhead |
| Small production | 2 | 10 | Default settings |
| High traffic | 5 | 20 | Increase for concurrent load |

**Warning Signs:**

- Connection pool exhaustion (all connections busy)
- Cache inconsistency between instances
- File lock conflicts across instances
- Need for global rate limiting

### When Redis Becomes Necessary

Redis adds distributed coordination capabilities:

**Without Redis:**

```
Instance A: Updates entry --> Local cache invalidated
Instance B: Cache still holds stale data --> Serves stale response
```

**With Redis:**

```
Instance A: Updates entry --> Publishes event to Redis
Instance B: Receives event --> Invalidates local cache --> Fresh data
```

**Redis Provides:**

- **Distributed Cache:** Shared query results across instances
- **Cross-Instance Locks:** File locks work across all instances
- **Event Broadcasting:** Cache invalidation propagates everywhere
- **Global Rate Limiting:** Limits apply across the cluster

**Distributed Rate Limiting Requirement:**

When running multiple instances, rate limiting is only truly global if Redis is enabled.
Without Redis, each instance enforces limits independently, which effectively raises
the cluster-wide limit. To enforce shared limits across the fleet, enable Redis and
set `AGENT_MEMORY_REDIS_ENABLED=true` alongside PostgreSQL.

---

## Migration Paths

### SQLite to PostgreSQL

**Step 1: Export Data**

```json
// Tool: memory_export
{
  "action": "export",
  "format": "json"
}
```

Save the exported JSON file.

**Step 2: Configure PostgreSQL**

Create the database:

```sql
CREATE DATABASE agent_memory;
CREATE USER agent_memory_user WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE agent_memory TO agent_memory_user;
```

**Step 3: Start with PostgreSQL Backend**

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
AGENT_MEMORY_PG_USER=agent_memory_user \
AGENT_MEMORY_PG_PASSWORD=secure-password \
agent-memory mcp
```

Schema migrations run automatically on startup.

**Step 4: Import Data**

```json
// Tool: memory_import
{
  "action": "import",
  "content": "<exported-json>",
  "format": "json",
  "admin_key": "your-admin-key"
}
```

**Step 5: Verify**

```json
// Tool: memory_health
{}
```

Check that `database.type` shows `postgresql` and `connected` is `true`.

### Adding Redis

**Step 1: Start Redis**

```bash
# Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install natively
# brew install redis && brew services start redis
```

**Step 2: Enable Redis**

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
AGENT_MEMORY_REDIS_ENABLED=true \
AGENT_MEMORY_REDIS_HOST=localhost \
agent-memory mcp
```

**Step 3: Verify**

```json
// Tool: memory_health
{}
```

Check that `redis.connected` is `true`.

**Which Adapters Use Redis:**
| Feature | Adapter | Redis Keys |
|---------|---------|------------|
| Distributed cache | Cache adapter | `agentmem:cache:*` |
| File locks | Lock adapter | `agentmem:lock:*` |
| Event propagation | Event adapter | `agentmem:events` (pub/sub) |
| Rate limiting | Rate limiter | `agentmem:ratelimit:*` |

---

## Performance Tuning

### Circuit Breaker Configuration

The circuit breaker prevents cascading failures when external services fail:

```bash
# Open circuit after N consecutive failures
AGENT_MEMORY_CB_FAILURE_THRESHOLD=5

# Wait before attempting recovery (half-open state)
AGENT_MEMORY_CB_RESET_TIMEOUT_MS=30000

# Successful calls needed to close circuit
AGENT_MEMORY_CB_SUCCESS_THRESHOLD=2
```

**States:**

- **Closed:** Normal operation, requests pass through
- **Open:** Requests fail fast, no external calls
- **Half-Open:** Limited requests to test recovery

**Tuning Guidance:**
| Scenario | Failure Threshold | Reset Timeout |
|----------|-------------------|---------------|
| Aggressive (fail fast) | 3 | 15000 |
| Balanced (default) | 5 | 30000 |
| Conservative (retry more) | 10 | 60000 |

### Rate Limiting Settings

Protect resources from overload:

```bash
# Per-agent limits (default: 500 requests/minute)
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX=500
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS=60000

# Global limits (default: 5000 requests/minute)
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=5000
AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS=60000

# Burst protection (default: 50 requests/second)
AGENT_MEMORY_RATE_LIMIT_BURST_MAX=50
AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS=1000

# Disable rate limiting entirely
AGENT_MEMORY_RATE_LIMIT=0
```

**Tuning Guidance:**
| Scenario | Per-Agent Max | Global Max | Burst Max |
|----------|---------------|------------|-----------|
| Single trusted agent | Disabled | Disabled | Disabled |
| Small team | 500 | 5000 | 50 |
| Large deployment | 200 | 10000 | 100 |
| Public API | 100 | 2000 | 20 |

### Cache TTL Tuning

Balance freshness vs. performance:

**Query Cache:**

```bash
# How long to cache query results (default: 5 minutes)
AGENT_MEMORY_QUERY_CACHE_TTL_MS=300000

# Maximum cached queries (default: 1000)
AGENT_MEMORY_QUERY_CACHE_SIZE=1000

# Memory limit for query cache (default: 200 MB)
AGENT_MEMORY_QUERY_CACHE_MEMORY_MB=200
```

**Scope Cache:**

```bash
# How long to cache scope chains (default: 10 minutes)
AGENT_MEMORY_SCOPE_CACHE_TTL_MS=600000
```

**Redis Cache (when enabled):**

```bash
# Distributed cache TTL (default: 1 hour)
AGENT_MEMORY_REDIS_CACHE_TTL_MS=3600000
```

**Tuning Guidance:**
| Scenario | Query TTL | Scope TTL | Redis TTL |
|----------|-----------|-----------|-----------|
| High consistency | 60000 | 120000 | 300000 |
| Balanced | 300000 | 600000 | 3600000 |
| High performance | 600000 | 1800000 | 7200000 |

### Connection Pool Sizing

**PostgreSQL:**

```bash
# Minimum connections (kept open)
AGENT_MEMORY_PG_POOL_MIN=2

# Maximum connections (peak load)
AGENT_MEMORY_PG_POOL_MAX=10

# Idle connection timeout
AGENT_MEMORY_PG_IDLE_TIMEOUT_MS=30000

# Connection acquisition timeout
AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS=10000

# Query timeout
AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS=30000
```

**Sizing Formula:**

```
max_pool_per_instance = (target_concurrent_queries * 1.5)
total_pg_connections = instances * max_pool_per_instance
```

Ensure `total_pg_connections` < PostgreSQL's `max_connections`.

---

## Monitoring and Alerting

### Key Metrics to Track

**Database Health:**
| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Connection pool usage | > 70% | > 90% |
| Query latency (p99) | > 100ms | > 500ms |
| Transaction retry rate | > 1% | > 5% |
| Database size growth | > 10%/day | > 50%/day |

**Cache Health:**
| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Cache hit rate | < 70% | < 50% |
| Cache memory usage | > 80% limit | > 95% limit |
| Eviction rate | > 100/min | > 1000/min |

**Redis Health (when enabled):**
| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Connection failures | > 1/min | > 10/min |
| Lock acquisition failures | > 5% | > 20% |
| Pub/sub lag | > 100ms | > 1000ms |
| Memory usage | > 70% | > 90% |

**Application Health:**
| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Rate limit hits | > 10% requests | > 30% requests |
| Circuit breaker opens | Any | Sustained |
| Error rate | > 1% | > 5% |

### Health Check Endpoint

Use the built-in health check:

```json
// Tool: memory_health
{}
```

**Response Fields:**

```json
{
  "status": "healthy",
  "database": {
    "type": "postgresql",
    "connected": true,
    "poolSize": 10,
    "idleConnections": 7
  },
  "redis": {
    "connected": true,
    "host": "localhost",
    "port": 6379
  },
  "cache": {
    "entries": 150,
    "memoryMB": 25.3,
    "hitRate": 0.87
  },
  "vectorDb": {
    "entries": 500
  }
}
```

### Recommended Alert Rules

**High Priority:**

```yaml
# Database connection failure
- alert: DatabaseConnectionFailed
  condition: database.connected == false
  severity: critical

# Circuit breaker open
- alert: CircuitBreakerOpen
  condition: circuitBreaker.state == "open"
  severity: critical
  for: 5m

# Redis connection failure (when enabled)
- alert: RedisConnectionFailed
  condition: redis.enabled && !redis.connected
  severity: high
```

**Medium Priority:**

```yaml
# Low cache hit rate
- alert: LowCacheHitRate
  condition: cache.hitRate < 0.5
  severity: warning
  for: 15m

# High pool utilization
- alert: HighPoolUtilization
  condition: (poolSize - idleConnections) / poolSize > 0.8
  severity: warning
  for: 10m

# High rate limit hits
- alert: RateLimitHits
  condition: rateLimitHits / totalRequests > 0.1
  severity: warning
```

### Logging for Observability

Enable performance logging:

```bash
# Verbose database logging
AGENT_MEMORY_PERF=1

# Log level
AGENT_MEMORY_LOG_LEVEL=debug
```

Logs include:

- Query execution time
- Cache hit/miss events
- Connection pool status
- Rate limiting events
- Circuit breaker state changes

---

## Benchmarks

### Expected Performance by Tier

**SQLite (single instance):**
| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Simple read | ~10,000 ops/sec | < 1ms |
| Scoped read | ~5,000 ops/sec | < 2ms |
| Write | ~500 ops/sec | < 10ms |
| FTS search | ~3,000 ops/sec | < 2ms |

**PostgreSQL (per instance):**
| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Simple read | ~15,000 ops/sec | < 1ms |
| Scoped read | ~8,000 ops/sec | < 2ms |
| Write | ~2,000 ops/sec | < 5ms |
| FTS search | ~5,000 ops/sec | < 2ms |

**PostgreSQL + Redis (per instance):**
| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Cached read | ~50,000 ops/sec | < 0.5ms |
| Cache miss | ~15,000 ops/sec | < 2ms |
| Write | ~2,000 ops/sec | < 5ms |
| Cross-instance lock | ~1,000 ops/sec | < 10ms |

### Running Your Own Benchmarks

**Built-in Benchmark:**

```bash
# Run query quality benchmark
npm run benchmark:query

# Run extraction quality benchmark
npm run benchmark:extraction
```

**Custom Load Testing:**

1. **Baseline your current setup:**

```bash
AGENT_MEMORY_PERF=1 agent-memory mcp
# Monitor logs for operation timing
```

2. **Identify bottlenecks:**

- High query latency: Increase cache size/TTL
- Pool exhaustion: Increase pool size
- Write contention: Consider PostgreSQL
- Cross-instance issues: Add Redis

3. **Test at scale:**

```bash
# Simulate multiple agents
for i in {1..10}; do
  (agent-memory client benchmark --ops 1000 &)
done
wait
```

---

## Configuration Reference

### SQLite (Tier 1)

```bash
# Default - no configuration needed
agent-memory mcp

# Optional tuning
AGENT_MEMORY_DB_BUSY_TIMEOUT_MS=5000
AGENT_MEMORY_CACHE_LIMIT_MB=512
AGENT_MEMORY_QUERY_CACHE_TTL_MS=300000
```

### PostgreSQL (Tier 2)

```bash
AGENT_MEMORY_DB_TYPE=postgresql
AGENT_MEMORY_PG_HOST=localhost
AGENT_MEMORY_PG_PORT=5432
AGENT_MEMORY_PG_DATABASE=agent_memory
AGENT_MEMORY_PG_USER=agent_memory
AGENT_MEMORY_PG_PASSWORD=secure-password
AGENT_MEMORY_PG_SSL=true
AGENT_MEMORY_PG_POOL_MIN=2
AGENT_MEMORY_PG_POOL_MAX=10
```

### PostgreSQL + Redis (Tier 3)

```bash
# Database
AGENT_MEMORY_DB_TYPE=postgresql
AGENT_MEMORY_PG_HOST=db.example.com
AGENT_MEMORY_PG_DATABASE=agent_memory
AGENT_MEMORY_PG_USER=agent_memory
AGENT_MEMORY_PG_PASSWORD=secure-password
AGENT_MEMORY_PG_SSL=true
AGENT_MEMORY_PG_POOL_MAX=20

# Redis
AGENT_MEMORY_REDIS_ENABLED=true
AGENT_MEMORY_REDIS_HOST=redis.example.com
AGENT_MEMORY_REDIS_PORT=6379
AGENT_MEMORY_REDIS_PASSWORD=redis-password
AGENT_MEMORY_REDIS_TLS=true
AGENT_MEMORY_REDIS_CACHE_TTL_MS=3600000
AGENT_MEMORY_REDIS_KEY_PREFIX=agentmem:prod:

# Resilience
AGENT_MEMORY_CB_FAILURE_THRESHOLD=5
AGENT_MEMORY_CB_RESET_TIMEOUT_MS=30000
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=10000
```

---

## See Also

- [ADR-0015: Scaling Strategy](adr/0015-scaling-strategy.md) - Architecture decision record
- [Deployment Modes](guides/deployment-modes.md) - Backend comparison
- [PostgreSQL Setup](guides/postgresql-setup.md) - Database configuration
- [Redis Distributed](guides/redis-distributed.md) - Distributed features
- [Performance Guide](guides/performance.md) - Optimization techniques
- [Environment Variables](reference/environment-variables.md) - All configuration options
