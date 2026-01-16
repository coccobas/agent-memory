# Latent Memory Services

This directory contains services for managing latent (compressed/implicit) memories with efficient caching and retrieval.

## KV Cache Service

### Purpose

The `KVCacheService` implements a two-tier caching strategy for latent memory entries:

- **L1 Cache**: In-memory LRU cache with short TTL for hot data
- **L2 Cache**: Persistent cache (Redis/SQLite) with longer TTL for warm data

### Architecture

```
┌─────────────────────────────────────────────────┐
│           KVCacheService                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐         ┌──────────────────┐  │
│  │  L1 Cache   │         │    L2 Cache      │  │
│  │  (LRU/TTL)  │────────▶│  (ICacheAdapter) │  │
│  │             │ promote │                  │  │
│  │ - Max: 1000 │         │  - Redis/SQLite  │  │
│  │ - TTL: 10m  │         │  - TTL: 24h      │  │
│  └─────────────┘         └──────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Features

- **Tiered Architecture**: L1 (memory) → L2 (persistent) → Miss
- **Write-Through Caching**: Writes go to both L1 and L2 atomically
- **Session Scoping**: Optional isolation by session ID
- **LRU Eviction**: Automatic eviction based on access patterns
- **TTL Management**: Independent TTLs for L1 and L2
- **Statistics Tracking**: Hit rates, memory usage, access patterns

### Usage

#### Basic Setup

```typescript
import { createKVCacheService } from './services/latent-memory';
import { createMemoryCacheAdapter } from './core/adapters/memory-cache.adapter';
import { LRUCache } from './utils/lru-cache';

// Create L2 cache adapter
const l2Cache = createMemoryCacheAdapter(
  new LRUCache({ maxSize: 5000, ttlMs: 24 * 60 * 60 * 1000 })
);

// Create KV cache service
const kvCache = createKVCacheService(l2Cache, {
  l1MaxSize: 1000,
  l1TtlMs: 600000, // 10 minutes
  l2TtlMs: 86400000, // 24 hours
  sessionScope: true,
});
```

#### Storing Memories

```typescript
const memory: LatentMemory = {
  id: 'latent-mem-001',
  sourceType: 'knowledge',
  sourceId: 'knowledge-123',
  fullEmbedding: embedding1536,
  reducedEmbedding: embedding256,
  compressionMethod: 'pca',
  textPreview: 'TypeScript best practices...',
  importanceScore: 0.85,
  lastAccessedAt: new Date().toISOString(),
  accessCount: 0,
};

await kvCache.set(memory, 'session-abc');
```

#### Retrieving Memories

```typescript
const memory = await kvCache.get('latent-mem-001', 'session-abc');
if (memory) {
  console.log('Hit:', memory.textPreview);
}
```

### Configuration Options

| Option         | Type      | Default  | Description                       |
| -------------- | --------- | -------- | --------------------------------- |
| `l1MaxSize`    | `number`  | 1000     | Maximum L1 cache entries          |
| `l1TtlMs`      | `number`  | 600000   | L1 TTL in milliseconds (10 min)   |
| `l2TtlMs`      | `number`  | 86400000 | L2 TTL in milliseconds (24 hours) |
| `sessionScope` | `boolean` | true     | Enable session-scoped cache keys  |

See `kv-cache.example.ts` for comprehensive usage examples.
