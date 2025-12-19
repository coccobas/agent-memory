# Performance Guide

Optimize Agent Memory for high-throughput and low-latency operations.

## Table of Contents

- [Performance Characteristics](#performance-characteristics)
- [Cache Configuration](#cache-configuration)
- [Query Optimization](#query-optimization)
- [Batch Operations](#batch-operations)
- [Database Tuning](#database-tuning)
- [Memory Management](#memory-management)
- [Rate Limiting](#rate-limiting)
- [Monitoring](#monitoring)

---

## Performance Characteristics

Agent Memory is optimized for read-heavy workloads typical of AI agent interactions.

### Baseline Performance

| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Simple query | 4.5M ops/sec | < 0.3ms |
| Scoped query with inheritance | 3.6M ops/sec | < 0.4ms |
| Full-text search (FTS5) | 3.5M ops/sec | < 0.4ms |
| Semantic search | 3.1M ops/sec | < 0.5ms |

### Factors Affecting Performance

- **Database size**: Larger databases require more time to scan
- **Query complexity**: Inherited scopes and joins add overhead
- **Cache state**: Cache hits are 10-100x faster than misses
- **Embedding generation**: External API calls add latency

---

## Cache Configuration

Agent Memory uses multi-level caching to minimize database access.

### Query Cache

Caches query results for repeated queries.

```bash
# TTL (time-to-live) in milliseconds
AGENT_MEMORY_QUERY_CACHE_TTL_MS=300000  # 5 minutes

# Maximum entries
AGENT_MEMORY_QUERY_CACHE_SIZE=200

# Maximum memory
AGENT_MEMORY_QUERY_CACHE_MEMORY_MB=50
```

### Scope Chain Cache

Caches scope inheritance chains.

```bash
# TTL in milliseconds
AGENT_MEMORY_SCOPE_CACHE_TTL_MS=600000  # 10 minutes
```

### Prepared Statement Cache

Caches compiled SQL statements.

```bash
# Maximum statements to cache
AGENT_MEMORY_MAX_PREPARED_STATEMENTS=100
```

### Total Cache Memory

```bash
# Total cache memory limit
AGENT_MEMORY_CACHE_LIMIT_MB=100
```

### Cache Pressure Management

```bash
# Start eviction when cache exceeds this percentage
AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD=0.8

# Evict until cache drops to this percentage
AGENT_MEMORY_CACHE_EVICTION_TARGET=0.8
```

---

## Query Optimization

### Use Specific Scopes

Avoid searching all scopes when possible:

```json
// Slower - searches all scopes
{
  "action": "search",
  "search": "authentication"
}

// Faster - specific scope
{
  "action": "search",
  "search": "authentication",
  "scope": {
    "type": "project",
    "id": "proj-123",
    "inherit": false
  }
}
```

### Limit Results

Always specify reasonable limits:

```json
{
  "action": "search",
  "search": "query",
  "limit": 20  // Don't fetch more than needed
}
```

### Use Type Filters

Filter by entry type when possible:

```json
{
  "action": "search",
  "search": "style",
  "types": ["guidelines"]  // Only search guidelines
}
```

### Use Tags for Filtering

Tags are indexed and faster than content search:

```json
{
  "action": "search",
  "tags": {
    "include": ["typescript", "security"]
  }
}
```

### Prefer Context over Search

For loading all project memory, use context:

```json
// More efficient for loading everything
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-123",
  "inherit": true
}

// Less efficient for same result
{
  "action": "search",
  "types": ["guidelines", "knowledge", "tools"],
  "scope": { "type": "project", "id": "proj-123", "inherit": true }
}
```

---

## Batch Operations

Bulk operations are significantly faster than individual calls.

### Bulk Add

```json
// Instead of 10 separate add calls:
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-123",
  "entries": [
    { "name": "rule-1", "content": "..." },
    { "name": "rule-2", "content": "..." },
    // ... up to 100 entries
  ]
}
```

### Bulk Update

```json
{
  "action": "bulk_update",
  "entries": [
    { "id": "guideline-1", "content": "Updated 1" },
    { "id": "guideline-2", "content": "Updated 2" }
  ]
}
```

### Batch Size Limits

```bash
# Maximum entries per bulk operation
AGENT_MEMORY_BULK_OPERATION_MAX=100
```

### Performance Comparison

| Operation | 100 Individual Calls | 1 Bulk Call |
|-----------|---------------------|-------------|
| Add guidelines | ~500ms | ~50ms |
| Network overhead | 100 round trips | 1 round trip |
| Transaction overhead | 100 transactions | 1 transaction |

---

## Database Tuning

### WAL Mode

Agent Memory uses WAL (Write-Ahead Logging) mode by default for better concurrent access.

```bash
# Verify WAL mode
sqlite3 ~/.agent-memory/data/memory.db "PRAGMA journal_mode;"
# Should return: wal
```

### Vacuum

Periodically vacuum the database to reclaim space:

```bash
# Manual vacuum
sqlite3 ~/.agent-memory/data/memory.db "VACUUM;"
```

### Analyze

Update query planner statistics:

```bash
sqlite3 ~/.agent-memory/data/memory.db "ANALYZE;"
```

### Index Usage

Agent Memory creates indexes automatically. Verify indexes exist:

```bash
sqlite3 ~/.agent-memory/data/memory.db ".indexes"
```

---

## Memory Management

### Heap Pressure Monitoring

```bash
# Threshold for proactive cache eviction (0-1)
AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD=0.85

# Check interval in milliseconds
AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS=30000
```

### Memory Limits

For constrained environments:

```bash
# Reduce cache memory
AGENT_MEMORY_CACHE_LIMIT_MB=50
AGENT_MEMORY_QUERY_CACHE_MEMORY_MB=25

# Reduce prepared statement cache
AGENT_MEMORY_MAX_PREPARED_STATEMENTS=50
```

### Memory Usage Monitoring

Check current memory usage:

```json
// Tool: memory_health
{}

// Response includes:
{
  "cache": {
    "entries": 45,
    "memoryMB": 12.5
  }
}
```

---

## Rate Limiting

Rate limiting prevents resource exhaustion.

### Disable for High-Throughput

For trusted single-agent setups:

```bash
AGENT_MEMORY_RATE_LIMIT=0
```

### Tuning Limits

```bash
# Per-agent limits
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX=100     # Requests
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS=60000  # Per minute

# Global limits
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=1000
AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS=60000

# Burst protection
AGENT_MEMORY_RATE_LIMIT_BURST_MAX=20
AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS=1000
```

---

## Monitoring

### Performance Logging

```bash
# Enable performance logging
AGENT_MEMORY_PERF=1 agent-memory mcp
```

Logs include:

- Query execution time
- Cache hit/miss ratios
- Memory usage trends

### Health Check

```json
// Tool: memory_health
{}

// Response
{
  "status": "healthy",
  "database": {
    "connected": true,
    "size": "15.2MB"
  },
  "vectorDb": {
    "entries": 500
  },
  "cache": {
    "entries": 150,
    "memoryMB": 25.3,
    "hitRate": 0.87
  }
}
```

### Analytics

```json
// Tool: memory_analytics
{
  "action": "get_stats",
  "scopeType": "project",
  "scopeId": "proj-123"
}
```

---

## Performance Checklist

### For Low Latency

- [ ] Enable query caching
- [ ] Use specific scopes (avoid global searches)
- [ ] Limit query results
- [ ] Use tags for filtering

### For High Throughput

- [ ] Use bulk operations
- [ ] Increase or disable rate limits
- [ ] Increase cache sizes
- [ ] Use WAL mode (default)

### For Large Databases

- [ ] Regular consolidation
- [ ] Archive stale entries
- [ ] Periodic vacuum
- [ ] Increase cache TTL

### For Limited Memory

- [ ] Reduce cache limits
- [ ] Enable heap pressure monitoring
- [ ] Reduce prepared statement cache
- [ ] Use smaller query result limits

---

## Example Configurations

### Development (Default)

Good for local development:

```bash
# Uses defaults - balanced performance and memory
agent-memory mcp
```

### Production (High Performance)

For production with many agents:

```bash
AGENT_MEMORY_CACHE_LIMIT_MB=200 \
AGENT_MEMORY_QUERY_CACHE_SIZE=500 \
AGENT_MEMORY_QUERY_CACHE_TTL_MS=600000 \
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=10000 \
agent-memory mcp
```

### Constrained Environment

For limited resources (e.g., containers):

```bash
AGENT_MEMORY_CACHE_LIMIT_MB=25 \
AGENT_MEMORY_QUERY_CACHE_SIZE=50 \
AGENT_MEMORY_MAX_PREPARED_STATEMENTS=25 \
AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD=0.7 \
agent-memory mcp
```

### Single Agent (Maximum Speed)

For trusted single-agent setups:

```bash
AGENT_MEMORY_RATE_LIMIT=0 \
AGENT_MEMORY_PERMISSIONS_MODE=permissive \
AGENT_MEMORY_CACHE_LIMIT_MB=200 \
agent-memory mcp
```

---

## See Also

- [Troubleshooting](troubleshooting.md) - Common issues
- [Environment Variables](../reference/environment-variables.md) - All configuration
- [Architecture](../concepts/architecture.md) - System design
