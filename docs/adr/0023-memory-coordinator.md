# ADR-0023: Memory Coordinator

## Status

Accepted

## Context

Agent Memory uses multiple in-memory caches:
- Query result cache
- Feedback score cache
- Entity index
- Scope resolution cache
- Embedding vector cache

Each cache has its own size limit, but they share process memory. Without coordination:
- Total memory can exceed process limits
- Low-priority caches can starve high-priority ones
- Memory pressure is discovered too late (OOM)

We needed:
- Process-wide memory monitoring
- Priority-based eviction across caches
- Proactive eviction before OOM
- Per-cache visibility into memory usage

## Decision

Implement a MemoryCoordinator that monitors total heap usage across registered caches and triggers priority-based eviction when pressure thresholds are exceeded.

### Coordinator Structure

```typescript
// src/core/memory-coordinator.ts
interface RegisteredCache {
  name: string;
  cache: ICacheAdapter;
  priority: number;  // 0-10, higher = keep longer
  getMemoryUsage: () => number;  // bytes
}

class MemoryCoordinator {
  private caches: RegisteredCache[] = [];
  private maxMemoryBytes: number;
  private pressureThreshold: number;  // 0.0-1.0
  private checkIntervalMs: number;
  private intervalId?: NodeJS.Timeout;

  constructor(config: MemoryCoordinatorConfig) {
    this.maxMemoryBytes = config.maxMemoryMB * 1024 * 1024;
    this.pressureThreshold = config.pressureThreshold ?? 0.8;
    this.checkIntervalMs = config.checkIntervalMs ?? 5000;
  }

  register(
    name: string,
    cache: ICacheAdapter,
    priority: number,
    getMemoryUsage: () => number,
  ): void {
    this.caches.push({ name, cache, priority, getMemoryUsage });
    // Sort by priority (ascending) for eviction order
    this.caches.sort((a, b) => a.priority - b.priority);
  }

  start(): void {
    this.intervalId = setInterval(
      () => this.checkPressure(),
      this.checkIntervalMs,
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
```

### Pressure Check

```typescript
private checkPressure(): void {
  const totalUsage = this.getTotalMemoryUsage();
  const pressure = totalUsage / this.maxMemoryBytes;

  if (pressure > this.pressureThreshold) {
    this.evictUntilSafe(pressure);
  }
}

private getTotalMemoryUsage(): number {
  return this.caches.reduce(
    (total, { getMemoryUsage }) => total + getMemoryUsage(),
    0,
  );
}
```

### Priority-Based Eviction

```typescript
private evictUntilSafe(currentPressure: number): void {
  // Evict from lowest priority first
  for (const { name, cache, priority } of this.caches) {
    if (currentPressure <= this.pressureThreshold) {
      break;  // Pressure relieved
    }

    const beforeSize = cache.size();
    const targetEviction = Math.ceil(beforeSize * 0.25);  // Evict 25%

    cache.evict(targetEviction);

    logger.info('Memory pressure eviction', {
      cache: name,
      priority,
      evicted: targetEviction,
      remaining: cache.size(),
    });

    currentPressure = this.getTotalMemoryUsage() / this.maxMemoryBytes;
  }
}
```

### Priority Guidelines

```typescript
// Registration with priorities
coordinator.register('query-cache', queryCache, 8, () => queryCache.memoryUsage());
coordinator.register('feedback-cache', feedbackCache, 3, () => feedbackCache.memoryUsage());
coordinator.register('entity-index', entityIndex, 5, () => entityIndex.memoryUsage());
coordinator.register('scope-cache', scopeCache, 7, () => scopeCache.memoryUsage());
coordinator.register('embedding-cache', embeddingCache, 4, () => embeddingCache.memoryUsage());
```

| Cache | Priority | Rationale |
|-------|----------|-----------|
| Query cache | 8 | Most expensive to rebuild, user-facing |
| Scope cache | 7 | Frequently accessed, cheap to rebuild |
| Entity index | 5 | Medium cost to rebuild |
| Embedding cache | 4 | Can re-fetch from DB |
| Feedback cache | 3 | Least critical, easily rebuilt |

### Memory Usage Estimation

```typescript
// Each cache provides memory estimation
class LRUCache implements ICacheAdapter {
  private memoryBytes = 0;

  set(key: string, value: unknown): void {
    const size = this.estimateSize(value);
    this.memoryBytes += size;
    this.entries.set(key, { value, size });
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.memoryBytes -= entry.size;
      this.entries.delete(key);
    }
  }

  memoryUsage(): number {
    return this.memoryBytes;
  }
}
```

## Consequences

**Positive:**
- Prevents OOM by proactive eviction
- Priority-based eviction preserves important caches
- Per-cache memory visibility for debugging
- Configurable thresholds for different environments
- Graceful degradation (eviction before crash)

**Negative:**
- Periodic checking adds overhead (mitigated by long intervals)
- Memory estimation is approximate (JSON.stringify or heuristics)
- Eviction can cause temporary performance degradation
- Priority tuning requires understanding cache importance

## References

- Code locations:
  - `src/core/memory-coordinator.ts` - Coordinator implementation
  - `src/utils/lru-cache.ts` - Cache with memory tracking
  - `src/core/factory/services.ts` - Cache registration
  - `src/config/registry/sections/cache.ts` - Memory limits config
- Related ADRs: ADR-0027 (LRU Cache Implementation)
- Principles: A1 (Performance is a Feature), O4 (Graceful Degradation)
