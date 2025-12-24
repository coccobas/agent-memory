/**
 * KV Cache Service - Usage Examples
 *
 * Demonstrates how to use the KVCacheService for caching latent memories
 * with tiered L1/L2 strategy.
 */

import { KVCacheService, createKVCacheService } from './kv-cache.service.js';
import type { LatentMemory } from './kv-cache.service.js';
import { createMemoryCacheAdapter } from '../../core/adapters/memory-cache.adapter.js';
import { LRUCache } from '../../utils/lru-cache.js';

// =============================================================================
// EXAMPLE 1: Basic Usage with Memory Cache Adapter
// =============================================================================

/**
 * Create a KV cache service with in-memory L2 cache (for testing/development).
 */
function createBasicCache(): KVCacheService {
  // Create L2 cache using in-memory LRU cache
  const l2LruCache = new LRUCache<LatentMemory>({
    maxSize: 5000,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  });

  const l2Cache = createMemoryCacheAdapter(l2LruCache);

  // Create KV cache service with custom config
  const kvCache = createKVCacheService(l2Cache, {
    l1MaxSize: 1000,
    l1TtlMs: 10 * 60 * 1000, // 10 minutes
    l2TtlMs: 24 * 60 * 60 * 1000, // 24 hours
    sessionScope: true,
  });

  return kvCache;
}

// =============================================================================
// EXAMPLE 2: Storing and Retrieving Latent Memories
// =============================================================================

async function storeAndRetrieveExample() {
  const cache = createBasicCache();

  // Create a latent memory entry
  const memory: LatentMemory = {
    id: 'latent-memory-001',
    sourceType: 'knowledge',
    sourceId: 'knowledge-123',
    fullEmbedding: new Array(1536).fill(0).map(() => Math.random()), // 1536-dim
    reducedEmbedding: new Array(256).fill(0).map(() => Math.random()), // 256-dim
    compressionMethod: 'pca',
    textPreview: 'This is a sample knowledge entry about TypeScript best practices...',
    importanceScore: 0.85,
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  // Store in cache (writes to both L1 and L2)
  await cache.set(memory, 'session-abc');
  console.log('✓ Memory stored in cache');

  // Retrieve from cache (should hit L1)
  const retrieved = await cache.get('latent-memory-001', 'session-abc');
  console.log('✓ Memory retrieved from L1:', retrieved?.id);
  console.log('  Access count:', retrieved?.accessCount);

  // Check stats
  const stats = cache.getStats();
  console.log('✓ Cache stats:', {
    l1HitRate: (stats.l1HitRate * 100).toFixed(1) + '%',
    totalGets: stats.totalGets,
  });
}

// =============================================================================
// EXAMPLE 3: Session-Scoped Caching
// =============================================================================

async function sessionScopingExample() {
  const cache = createBasicCache();

  // Store memories for different sessions
  const memory1: LatentMemory = {
    id: 'mem-1',
    sourceType: 'guideline',
    sourceId: 'guideline-1',
    fullEmbedding: new Array(1536).fill(0.1),
    reducedEmbedding: new Array(256).fill(0.1),
    compressionMethod: 'random_projection',
    textPreview: 'Session A guideline',
    importanceScore: 0.9,
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  const memory2: LatentMemory = {
    id: 'mem-1', // Same ID, different session
    sourceType: 'guideline',
    sourceId: 'guideline-2',
    fullEmbedding: new Array(1536).fill(0.2),
    reducedEmbedding: new Array(256).fill(0.2),
    compressionMethod: 'random_projection',
    textPreview: 'Session B guideline',
    importanceScore: 0.8,
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  // Store for different sessions
  await cache.set(memory1, 'session-a');
  await cache.set(memory2, 'session-b');

  // Retrieve session-specific memories
  const fromSessionA = await cache.get('mem-1', 'session-a');
  const fromSessionB = await cache.get('mem-1', 'session-b');

  console.log('✓ Session A memory:', fromSessionA?.textPreview);
  console.log('✓ Session B memory:', fromSessionB?.textPreview);
  console.log('✓ Memories are isolated by session');
}

// =============================================================================
// EXAMPLE 4: Cache Invalidation
// =============================================================================

async function invalidationExample() {
  const cache = createBasicCache();

  // Store multiple memories
  for (let i = 0; i < 10; i++) {
    const memory: LatentMemory = {
      id: `mem-${i}`,
      sourceType: i % 2 === 0 ? 'knowledge' : 'tool',
      sourceId: `source-${i}`,
      fullEmbedding: new Array(1536).fill(i),
      reducedEmbedding: new Array(256).fill(i),
      compressionMethod: 'quantized',
      textPreview: `Memory ${i}`,
      importanceScore: 0.5,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    };
    await cache.set(memory, 'session-test');
  }

  console.log('✓ Stored 10 memories');
  console.log('  L1 size:', cache.getStats().l1Size);

  // Invalidate all memories for a session
  const invalidated = cache.invalidateSession('session-test');
  console.log('✓ Invalidated session:', invalidated, 'entries');
  console.log('  L1 size after:', cache.getStats().l1Size);

  // Invalidate by source type
  await cache.set(
    {
      id: 'tool-mem',
      sourceType: 'tool',
      sourceId: 'tool-1',
      fullEmbedding: [],
      reducedEmbedding: [],
      compressionMethod: 'pca',
      textPreview: 'Tool memory',
      importanceScore: 0.7,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    },
    'session-new'
  );

  const typeInvalidated = cache.invalidateBySourceType('tool');
  console.log('✓ Invalidated by type:', typeInvalidated, 'tool entries');
}

// =============================================================================
// EXAMPLE 5: L1/L2 Tier Promotion
// =============================================================================

async function tierPromotionExample() {
  const cache = createBasicCache();

  const memory: LatentMemory = {
    id: 'promotion-test',
    sourceType: 'experience',
    sourceId: 'exp-1',
    fullEmbedding: new Array(1536).fill(0.5),
    reducedEmbedding: new Array(256).fill(0.5),
    compressionMethod: 'pca',
    textPreview: 'Experience memory for promotion test',
    importanceScore: 0.95,
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  // Store memory
  await cache.set(memory);

  // First access (L1 hit)
  await cache.get('promotion-test');
  console.log('✓ First access - L1 hit');

  // Clear L1 cache only (simulate eviction)
  cache.getStats(); // Access to prevent optimization
  // Note: We can't directly clear L1 without clearing L2,
  // but in real usage, L1 entries expire or get evicted by LRU

  // Simulate L1 eviction by accessing many other entries
  for (let i = 0; i < 1100; i++) {
    const tempMem: LatentMemory = {
      id: `temp-${i}`,
      sourceType: 'knowledge',
      sourceId: `temp-${i}`,
      fullEmbedding: [],
      reducedEmbedding: [],
      compressionMethod: 'quantized',
      textPreview: 'Temp',
      importanceScore: 0.1,
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    };
    await cache.set(tempMem);
  }

  console.log('✓ Filled L1 cache to trigger eviction');

  // Access original memory again (should be L2 hit, then promoted to L1)
  const retrieved = await cache.get('promotion-test');
  const stats = cache.getStats();

  console.log('✓ Second access after eviction:', retrieved?.id);
  console.log('  L2 hits:', stats.l2Hits);
  console.log('  Memory was promoted from L2 to L1');
}

// =============================================================================
// EXAMPLE 6: Monitoring Cache Performance
// =============================================================================

async function monitoringExample() {
  const cache = createBasicCache();

  // Simulate realistic access patterns
  const memories: LatentMemory[] = [];
  for (let i = 0; i < 50; i++) {
    memories.push({
      id: `mem-${i}`,
      sourceType: ['knowledge', 'guideline', 'tool', 'experience'][i % 4] as any,
      sourceId: `source-${i}`,
      fullEmbedding: new Array(1536).fill(i / 100),
      reducedEmbedding: new Array(256).fill(i / 100),
      compressionMethod: ['pca', 'random_projection', 'quantized'][i % 3] as any,
      textPreview: `Memory entry ${i}`,
      importanceScore: Math.random(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    });
  }

  // Store all memories
  for (const memory of memories) {
    await cache.set(memory, 'perf-test');
  }

  // Simulate access patterns (Zipf distribution - some items accessed more)
  for (let i = 0; i < 200; i++) {
    // Zipf: 80% of accesses to 20% of items
    const id = i < 160 ? `mem-${i % 10}` : `mem-${(i % 40) + 10}`;
    await cache.get(id, 'perf-test');
  }

  // Get and display statistics
  cache.logStats();
  const stats = cache.getStats();

  console.log('\n=== Cache Performance Report ===');
  console.log(`Total Gets: ${stats.totalGets}`);
  console.log(`L1 Hit Rate: ${(stats.l1HitRate * 100).toFixed(2)}%`);
  console.log(`L2 Hit Rate: ${(stats.l2HitRate * 100).toFixed(2)}%`);
  console.log(`Overall Hit Rate: ${(stats.overallHitRate * 100).toFixed(2)}%`);
  console.log(`L1 Size: ${stats.l1Size} entries`);
  console.log(`L1 Memory: ${(stats.l1MemoryBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Writes: ${stats.totalWrites}`);
  console.log(`Total Deletes: ${stats.totalDeletes}`);
}

// =============================================================================
// RUN EXAMPLES
// =============================================================================

async function runAllExamples() {
  console.log('\n=== Example 1: Basic Store and Retrieve ===');
  await storeAndRetrieveExample();

  console.log('\n=== Example 2: Session-Scoped Caching ===');
  await sessionScopingExample();

  console.log('\n=== Example 3: Cache Invalidation ===');
  await invalidationExample();

  console.log('\n=== Example 4: L1/L2 Tier Promotion ===');
  await tierPromotionExample();

  console.log('\n=== Example 5: Performance Monitoring ===');
  await monitoringExample();
}

// Uncomment to run examples:
// runAllExamples().catch(console.error);

export { runAllExamples };
