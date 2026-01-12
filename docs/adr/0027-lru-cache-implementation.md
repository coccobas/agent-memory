# ADR-0027: LRU Cache Implementation

## Status

Accepted

## Context

Agent Memory needs caching for:
- Query results (avoid re-executing expensive queries)
- Feedback scores (avoid re-calculating)
- Entity index (avoid re-building)
- Scope resolution (avoid re-traversing)

Requirements:
- LRU eviction (least recently used items removed first)
- TTL support (entries expire after time)
- Memory-based limits (evict when memory pressure)
- Size estimation (track memory usage per entry)
- High performance (cache access on hot paths)

External cache libraries either lacked features (no memory limits) or added overhead (excessive dependencies). We implemented a custom LRU cache.

## Decision

Implement a custom LRU cache combining count-based eviction, TTL expiration, memory-based limits, and configurable size estimation.

### Cache Structure

```typescript
// src/utils/lru-cache.ts
interface CacheEntry<T> {
  value: T;
  size: number;       // Estimated memory bytes
  expiresAt: number;  // Timestamp or Infinity
}

interface LRUCacheOptions {
  maxSize?: number;           // Max entry count
  maxMemoryMB?: number;       // Max memory in MB
  ttlMs?: number;             // Default TTL in milliseconds
  sizeEstimator?: (value: unknown) => number;  // Custom size estimation
  onEvict?: (key: string, value: unknown) => void;  // Eviction callback
}

class LRUCache<T> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private memoryBytes = 0;
  private readonly maxMemoryBytes: number;
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly sizeEstimator: (value: unknown) => number;
}
```

### LRU Ordering with Map

JavaScript's Map maintains insertion order. Moving an entry to "most recently used" is done by delete + re-insert:

```typescript
get(key: string): T | undefined {
  const entry = this.entries.get(key);
  if (!entry) return undefined;

  // Check TTL
  if (entry.expiresAt < Date.now()) {
    this.delete(key);
    return undefined;
  }

  // Move to end (most recently used)
  this.entries.delete(key);
  this.entries.set(key, entry);

  return entry.value;
}
```

### Size Estimation

```typescript
private estimateSize(value: unknown): number {
  if (this.sizeEstimator) {
    return this.sizeEstimator(value);
  }

  // Default: rough estimation based on type
  if (typeof value === 'string') {
    return value.length * 2;  // UTF-16
  }
  if (Array.isArray(value)) {
    return value.length * 64 + 32;  // Rough array overhead
  }
  if (typeof value === 'object' && value !== null) {
    // Objects: count keys + estimate values
    const keys = Object.keys(value);
    return keys.length * 64 + keys.reduce(
      (sum, k) => sum + this.estimateSize(value[k]),
      0,
    );
  }
  return 8;  // Primitives
}
```

### Eviction Strategy

```typescript
set(key: string, value: T, ttlMs?: number): void {
  // Remove existing entry if present
  this.delete(key);

  const size = this.estimateSize(value);
  const expiresAt = ttlMs
    ? Date.now() + ttlMs
    : this.defaultTtlMs
      ? Date.now() + this.defaultTtlMs
      : Infinity;

  // Evict if over memory limit
  while (this.memoryBytes + size > this.maxMemoryBytes && this.entries.size > 0) {
    this.evictOldest();
  }

  // Evict if over count limit
  while (this.entries.size >= this.maxSize) {
    this.evictOldest();
  }

  this.entries.set(key, { value, size, expiresAt });
  this.memoryBytes += size;
}

private evictOldest(): void {
  // Map iteration order is insertion order
  // First entry is least recently used
  const firstKey = this.entries.keys().next().value;
  if (firstKey !== undefined) {
    this.delete(firstKey);
  }
}
```

### TTL Cleanup

Rather than active cleanup timers, TTL is checked on access (lazy expiration):

```typescript
get(key: string): T | undefined {
  const entry = this.entries.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt < Date.now()) {
    this.delete(key);
    return undefined;
  }

  // ... rest of get
}

// Optional: Periodic cleanup for large caches
startPeriodicCleanup(intervalMs: number): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.delete(key);
      }
    }
  }, intervalMs);
}
```

### Memory Pressure Integration

```typescript
// Expose memory usage for MemoryCoordinator
memoryUsage(): number {
  return this.memoryBytes;
}

// Force eviction of N entries (called by coordinator)
evict(count: number): number {
  let evicted = 0;
  while (evicted < count && this.entries.size > 0) {
    this.evictOldest();
    evicted++;
  }
  return evicted;
}
```

### Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| get | O(1) | Map lookup + delete + set |
| set | O(1) amortized | May trigger O(k) evictions |
| delete | O(1) | Map delete |
| has | O(1) | Map has |
| evict(n) | O(n) | n deletions |

### Usage Example

```typescript
const queryCache = new LRUCache<QueryResult>({
  maxSize: 1000,
  maxMemoryMB: 50,
  ttlMs: 5 * 60 * 1000,  // 5 minutes
  sizeEstimator: (result: QueryResult) => {
    // Custom estimation for query results
    return result.entries.length * 500 + 100;
  },
  onEvict: (key, value) => {
    logger.debug('Query cache eviction', { key });
  },
});
```

## Consequences

**Positive:**
- No external dependencies for caching
- Combined count/memory/TTL eviction
- O(1) get/set operations
- Memory tracking for coordinator integration
- Customizable size estimation
- Eviction callbacks for cleanup

**Negative:**
- Custom implementation to maintain
- Size estimation is approximate
- No distributed cache support (use Redis adapter for that)
- Lazy TTL cleanup can delay memory reclamation

## References

- Code locations:
  - `src/utils/lru-cache.ts` - LRU cache implementation
  - `src/core/adapters/lru-cache.adapter.ts` - ICacheAdapter wrapper
  - `src/core/memory-coordinator.ts` - Memory pressure integration
  - `src/config/registry/sections/cache.ts` - Cache configuration
- Related ADRs: ADR-0023 (Memory Coordinator), ADR-0017 (Unified Adapter Pattern)
- Principles: A1 (Performance is a Feature)
