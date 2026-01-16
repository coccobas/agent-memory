# ADR-0021: Event-Driven Cache Invalidation

## Status

Accepted

## Context

Agent Memory uses multiple cache layers:

- Query result cache (hot queries)
- Feedback score cache (scoring lookups)
- Entity index cache (entity matching)
- Scope resolution cache (inheritance chains)

When entries are modified (add, update, delete), these caches must be invalidated to prevent stale reads. Direct invalidation from repositories creates tight coupling:

```typescript
// Bad: Repository knows about all cache layers
class GuidelineRepository {
  async update(id, data) {
    await this.db.update(...);
    // Repository shouldn't know about these
    queryCache.invalidate(id);
    feedbackCache.invalidate(id);
    entityIndex.invalidate(id);
  }
}
```

We needed:

- Decoupled cache invalidation
- Support for multiple cache subscribers
- Distributed invalidation (multi-instance deployments)
- Clear event contracts

## Decision

Use a pub/sub event system (IEventAdapter) for cache invalidation. Repositories emit events; caches subscribe to relevant events.

### Event Structure

```typescript
interface EntryChangedEvent {
  entryType: 'guideline' | 'knowledge' | 'tool';
  entryId: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId: string | null;
  action: 'add' | 'update' | 'delete' | 'deactivate';
  timestamp: number;
  agentId?: string;
}
```

### Publisher (Repository)

```typescript
// src/db/repositories/guideline.repository.ts
class GuidelineRepository {
  constructor(
    private db: Database,
    private eventBus: IEventAdapter
  ) {}

  async update(id: string, data: Partial<Guideline>): Promise<Guideline> {
    const result = await this.db.update(guidelines, data).where(eq(id));

    // Emit event - doesn't know who's listening
    await this.eventBus.publish('entry:changed', {
      entryType: 'guideline',
      entryId: id,
      scopeType: result.scopeType,
      scopeId: result.scopeId,
      action: 'update',
      timestamp: Date.now(),
    });

    return result;
  }
}
```

### Subscriber (Cache)

```typescript
// src/core/factory/query-pipeline.ts
function wireQueryCacheInvalidation(eventBus: IEventAdapter, queryCache: ICacheAdapter) {
  eventBus.subscribe('entry:changed', (event: EntryChangedEvent) => {
    // Invalidate queries that might include this entry
    const patterns = [
      `query:${event.scopeType}:${event.scopeId}:*`,
      `query:*:${event.entryType}:*`,
    ];

    for (const pattern of patterns) {
      queryCache.deletePattern(pattern);
    }
  });
}
```

### Multi-Instance Support

With LocalEventAdapter, events stay in-process. With RedisEventAdapter, events propagate across instances:

```
┌─────────────┐         ┌─────────────┐
│  Instance A │         │  Instance B │
│             │         │             │
│ Repository  │         │    Cache    │
│   update()  │         │  (stale)    │
│      │      │         │      ▲      │
│      ▼      │         │      │      │
│  EventBus   │────────▶│  EventBus   │
│  (publish)  │  Redis  │ (subscribe) │
└─────────────┘         └─────────────┘
```

### Invalidation Strategies

Different caches use different invalidation strategies:

```typescript
// Query cache: Invalidate by scope pattern
eventBus.subscribe('entry:changed', (event) => {
  queryCache.deletePattern(`query:${event.scopeType}:${event.scopeId}:*`);
});

// Feedback cache: Invalidate specific entry
eventBus.subscribe('entry:changed', (event) => {
  feedbackCache.delete(`feedback:${event.entryType}:${event.entryId}`);
});

// Entity index: Rebuild affected scope
eventBus.subscribe('entry:changed', (event) => {
  if (event.action !== 'delete') {
    entityIndex.rebuildScope(event.scopeType, event.scopeId);
  }
});
```

## Consequences

**Positive:**

- Repositories are decoupled from cache layers
- Multiple caches can subscribe independently
- Adding new caches doesn't require repository changes
- Distributed invalidation via Redis adapter
- Event audit trail for debugging
- Clear contract (EntryChangedEvent)

**Negative:**

- Eventual consistency (brief window of stale reads)
- Event ordering not guaranteed across instances
- Must remember to subscribe caches at startup
- Event storm risk during bulk operations (mitigated by debouncing)

## References

- Code locations:
  - `src/utils/events.ts` - EventBus and EntryChangedEvent
  - `src/core/adapters/local-event.adapter.ts` - Single-instance events
  - `src/core/adapters/redis-event.adapter.ts` - Distributed events
  - `src/core/factory/query-pipeline.ts:wireQueryCacheInvalidation()` - Cache subscription
  - `src/db/repositories/*.ts` - Event publishing
- Related ADRs: ADR-0017 (Unified Adapter Pattern)
- Principles: A3 (Layered Enhancement), O4 (Graceful Degradation)
