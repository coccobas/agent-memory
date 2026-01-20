/**
 * Unit tests for episode boundary detector
 *
 * Tests automatic episode boundary detection including:
 * - Event buffering
 * - Time gap detection
 * - File context shift detection
 * - Embedding similarity-based detection (when available)
 * - Shadow mode logging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBoundaryDetectorService,
  DEFAULT_BOUNDARY_CONFIG,
  type BufferedEvent,
  type BoundaryDetectorConfig,
} from '../../src/services/episode/boundary-detector.js';
import type { IEmbeddingService, EmbeddingProvider } from '../../src/core/context.js';

// Mock embedding service
function createMockEmbeddingService(overrides?: Partial<IEmbeddingService>): IEmbeddingService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue('local' as EmbeddingProvider),
    getEmbeddingDimension: vi.fn().mockReturnValue(384),
    embed: vi.fn().mockResolvedValue({
      embedding: Array(384).fill(0.1),
      model: 'test-model',
      provider: 'local' as EmbeddingProvider,
    }),
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [Array(384).fill(0.1)],
      model: 'test-model',
      provider: 'local' as EmbeddingProvider,
    }),
    getCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 }),
    ...overrides,
  };
}

// Helper to create buffered events
function createEvent(
  sessionId: string,
  toolName: string,
  action?: string,
  targetFile?: string,
  timestampOffset = 0
): BufferedEvent {
  return {
    timestamp: new Date(Date.now() + timestampOffset),
    toolName,
    action,
    targetFile,
    summary: action ? `${action} (${toolName})` : toolName,
    sessionId,
  };
}

describe('BoundaryDetectorService', () => {
  let config: BoundaryDetectorConfig;

  beforeEach(() => {
    config = {
      ...DEFAULT_BOUNDARY_CONFIG,
      enabled: true,
      shadowMode: true,
      windowSize: 3,
      minEvents: 4, // windowSize + 1
      similarityThreshold: 0.65,
      timeGapThresholdMs: 10 * 60 * 1000, // 10 minutes
      boundaryDebounceMs: 1000,
    };
    vi.clearAllMocks();
  });

  describe('basic operation', () => {
    it('should create service with default config', () => {
      const service = createBoundaryDetectorService(null);
      expect(service.getConfig().enabled).toBe(true);
      expect(service.getConfig().shadowMode).toBe(true);
    });

    it('should not process events when disabled', async () => {
      const service = createBoundaryDetectorService(null, { ...config, enabled: false });
      const event = createEvent('session-1', 'memory_remember', 'add');

      const result = await service.ingest(event);

      expect(result).toBeNull();
      expect(service.getBufferSize('session-1')).toBe(0);
    });

    it('should buffer events', async () => {
      const service = createBoundaryDetectorService(null, config);

      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      await service.ingest(createEvent('session-1', 'memory_knowledge', 'add'));

      expect(service.getBufferSize('session-1')).toBe(2);
    });

    it('should maintain separate buffers per session', async () => {
      const service = createBoundaryDetectorService(null, config);

      await service.ingest(createEvent('session-1', 'memory_remember'));
      await service.ingest(createEvent('session-2', 'memory_knowledge'));
      await service.ingest(createEvent('session-1', 'memory_tool'));

      expect(service.getBufferSize('session-1')).toBe(2);
      expect(service.getBufferSize('session-2')).toBe(1);
    });
  });

  describe('time gap detection', () => {
    it('should detect boundary on time gap', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 500, // 500ms for testing
      });

      // Add events for first window (normal timing)
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 100));

      // Add events for second window (with time gap before first event)
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 700));
      const result = await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 800));

      expect(result).not.toBeNull();
      expect(result?.decision.isBoundary).toBe(true);
      expect(result?.decision.reason).toBe('time_gap');
    });
  });

  describe('file context shift detection', () => {
    it('should detect boundary when file context shifts completely', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
      });

      // Events working on auth files (first window)
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts'));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts'));

      // Events working on completely different files (second window)
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/db/migrations.ts'));
      const result = await service.ingest(
        createEvent('session-1', 'Edit', 'edit', 'src/db/schema.ts')
      );

      expect(result).not.toBeNull();
      expect(result?.decision.isBoundary).toBe(true);
      expect(result?.decision.reason).toBe('file_context_shift');
    });

    it('should not detect boundary when files overlap', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
      });

      // Events working on overlapping files
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts'));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts'));
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts'));
      const result = await service.ingest(
        createEvent('session-1', 'Edit', 'edit', 'src/auth/utils.ts')
      );

      // No boundary because files overlap (login.ts is in both windows)
      expect(result).toBeNull();
    });
  });

  describe('embedding similarity detection', () => {
    it('should detect boundary when embedding similarity is low', async () => {
      const mockEmbed = vi.fn();

      // First window: auth-related embeddings
      mockEmbed.mockResolvedValueOnce({
        embedding: [1, 0, 0, 0],
        model: 'test',
        provider: 'local',
      });

      // Second window: completely different embeddings
      mockEmbed.mockResolvedValueOnce({
        embedding: [0, 0, 0, 1],
        model: 'test',
        provider: 'local',
      });

      const embeddingService = createMockEmbeddingService({ embed: mockEmbed });
      const service = createBoundaryDetectorService(embeddingService, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        similarityThreshold: 0.5,
      });

      // Add events (without file context to avoid file-based detection)
      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      await service.ingest(createEvent('session-1', 'memory_knowledge', 'add'));
      await service.ingest(createEvent('session-1', 'memory_task', 'create'));
      const result = await service.ingest(createEvent('session-1', 'memory_experience', 'learn'));

      expect(result).not.toBeNull();
      expect(result?.decision.isBoundary).toBe(true);
      expect(result?.decision.reason).toBe('similarity_drop');
      expect(result?.decision.similarity).toBeDefined();
    });

    it('should not detect boundary when similarity is high', async () => {
      const mockEmbed = vi.fn().mockResolvedValue({
        embedding: [1, 0, 0, 0],
        model: 'test',
        provider: 'local',
      });

      const embeddingService = createMockEmbeddingService({ embed: mockEmbed });
      const service = createBoundaryDetectorService(embeddingService, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        similarityThreshold: 0.5,
      });

      // All events have same embedding (similarity = 1.0)
      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      const result = await service.ingest(createEvent('session-1', 'memory_remember', 'add'));

      // No boundary because similarity is high
      expect(result).toBeNull();
    });
  });

  describe('shadow mode', () => {
    it('should store detected boundaries in shadow mode', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        shadowMode: true,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 100,
      });

      // Trigger a boundary via time gap
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      const boundaries = service.getDetectedBoundaries();
      expect(boundaries.length).toBe(1);
      expect(boundaries[0]?.sessionId).toBe('session-1');
    });

    it('should return boundaries for specific session', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        shadowMode: true,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 100,
        boundaryDebounceMs: 0, // Disable debounce for testing
      });

      // Create boundary in session-1
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // Create boundary in session-2
      await service.ingest(createEvent('session-2', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-2', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-2', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-2', 'tool4', 'add', undefined, 250));

      const session1Boundaries = service.getBoundariesForSession('session-1');
      const session2Boundaries = service.getBoundariesForSession('session-2');

      expect(session1Boundaries.length).toBe(1);
      expect(session2Boundaries.length).toBe(1);
    });
  });

  describe('flush', () => {
    it('should return and clear buffer for session', async () => {
      const service = createBoundaryDetectorService(null, config);

      await service.ingest(createEvent('session-1', 'tool1'));
      await service.ingest(createEvent('session-1', 'tool2'));

      const flushed = service.flush('session-1');

      expect(flushed.length).toBe(2);
      expect(service.getBufferSize('session-1')).toBe(0);
    });

    it('should return empty array for unknown session', () => {
      const service = createBoundaryDetectorService(null, config);

      const flushed = service.flush('unknown-session');

      expect(flushed).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 3,
        timeGapThresholdMs: 100,
      });

      // Build up state
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));

      // Reset
      service.reset();

      expect(service.getBufferSize('session-1')).toBe(0);
      expect(service.getDetectedBoundaries().length).toBe(0);
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid boundary detections', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 100,
        boundaryDebounceMs: 5000, // Long debounce
      });

      // First boundary (via time gap)
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      const first = await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      expect(first).not.toBeNull();

      // Try to trigger another boundary immediately (should be debounced)
      // Even with time gap, debounce should prevent it
      await service.ingest(createEvent('session-1', 'tool5', 'add', undefined, 400));
      await service.ingest(createEvent('session-1', 'tool6', 'add', undefined, 450));
      await service.ingest(createEvent('session-1', 'tool7', 'add', undefined, 600));
      const second = await service.ingest(createEvent('session-1', 'tool8', 'add', undefined, 650));

      expect(second).toBeNull();
      expect(service.getDetectedBoundaries().length).toBe(1);
    });
  });

  describe('suggested episode name', () => {
    it('should generate name from file context', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 100,
      });

      // First window: auth files
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts', 0));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts', 50));
      // Second window: db files (time gap triggers boundary)
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/db/schema.ts', 200));
      const result = await service.ingest(
        createEvent('session-1', 'Edit', 'edit', 'src/db/migrations.ts', 250)
      );

      expect(result).not.toBeNull();
      expect(result?.suggestedName).toContain('db');
    });

    it('should generate name from actions when no files', async () => {
      const service = createBoundaryDetectorService(null, {
        ...config,
        windowSize: 2,
        minEvents: 4, // Need 2 * windowSize for two full windows
        timeGapThresholdMs: 100,
      });

      await service.ingest(createEvent('session-1', 'memory_remember', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'memory_knowledge', 'update', undefined, 50));
      await service.ingest(createEvent('session-1', 'memory_task', 'create', undefined, 200));
      const result = await service.ingest(
        createEvent('session-1', 'memory_experience', 'learn', undefined, 250)
      );

      expect(result).not.toBeNull();
      expect(result?.suggestedName).toBeDefined();
      expect(result?.suggestedName?.length).toBeGreaterThan(0);
    });
  });
});
