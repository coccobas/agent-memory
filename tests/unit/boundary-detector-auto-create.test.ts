/**
 * Unit tests for Phase 2: Auto-detected episode creation
 *
 * Tests automatic episode creation from detected boundaries:
 * - Creating episodes with triggerType='auto_detected'
 * - Storing boundary metadata (reason, confidence, similarity)
 * - Completing previous episode when boundary detected
 * - Integration with EpisodeService
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  createBoundaryDetectorService,
  type BoundaryDetectorConfig,
  type BufferedEvent,
  type DetectedBoundary,
} from '../../src/services/episode/boundary-detector.js';
import type { IEmbeddingService, EmbeddingProvider } from '../../src/core/context.js';
import type { EpisodeWithEvents } from '../../src/core/interfaces/repositories.js';

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

// Mock episode service
function createMockEpisodeService() {
  const createdEpisodes: EpisodeWithEvents[] = [];
  const completedEpisodes: { id: string; outcome: string; outcomeType: string }[] = [];

  return {
    create: vi.fn().mockImplementation(async (input) => {
      const episode: EpisodeWithEvents = {
        id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        sessionId: input.sessionId ?? null,
        name: input.name,
        description: input.description ?? null,
        status: 'active',
        outcome: null,
        outcomeType: null,
        plannedAt: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationMs: null,
        parentEpisodeId: input.parentEpisodeId ?? null,
        depth: 0,
        triggerType: input.triggerType ?? null,
        triggerRef: input.triggerRef ?? null,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy ?? null,
        isActive: true,
        events: [],
      };
      createdEpisodes.push(episode);
      return episode;
    }),
    complete: vi.fn().mockImplementation(async (id, outcome, outcomeType) => {
      completedEpisodes.push({ id, outcome, outcomeType });
      const episode = createdEpisodes.find((e) => e.id === id);
      if (episode) {
        episode.status = 'completed';
        episode.outcome = outcome;
        episode.outcomeType = outcomeType;
        episode.endedAt = new Date().toISOString();
      }
      return episode;
    }),
    getActiveEpisode: vi.fn().mockResolvedValue(undefined),
    // Expose internal state for assertions
    _getCreatedEpisodes: () => createdEpisodes,
    _getCompletedEpisodes: () => completedEpisodes,
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

describe('BoundaryDetectorService - Phase 2: Auto-Create Episodes', () => {
  let config: BoundaryDetectorConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      shadowMode: false, // Phase 2: auto-create mode
      windowSize: 2,
      minEvents: 4,
      similarityThreshold: 0.65,
      timeGapThresholdMs: 100,
      boundaryDebounceMs: 0,
    };
    vi.clearAllMocks();
  });

  describe('auto-create mode configuration', () => {
    it('should support shadowMode=false for auto-create mode', () => {
      const service = createBoundaryDetectorService(null, config);
      expect(service.getConfig().shadowMode).toBe(false);
    });

    it('should still detect boundaries when shadowMode=false', async () => {
      const service = createBoundaryDetectorService(null, config);

      // Add events to trigger a time gap boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      const result = await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      expect(result).not.toBeNull();
      expect(result?.decision.isBoundary).toBe(true);
    });
  });

  describe('episode creation callback', () => {
    it('should call onBoundaryDetected callback when boundary is detected', async () => {
      const onBoundaryDetected = vi.fn();
      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Trigger boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      expect(onBoundaryDetected).toHaveBeenCalledTimes(1);
      expect(onBoundaryDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          decision: expect.objectContaining({
            isBoundary: true,
          }),
        })
      );
    });

    it('should not call callback when no boundary detected', async () => {
      const onBoundaryDetected = vi.fn();
      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Add events without triggering boundary (not enough for two windows)
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));

      expect(onBoundaryDetected).not.toHaveBeenCalled();
    });

    it('should provide boundary metadata for episode creation', async () => {
      const onBoundaryDetected = vi.fn();
      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Trigger time gap boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', 'src/auth/login.ts', 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', 'src/auth/logout.ts', 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', 'src/db/schema.ts', 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', 'src/db/query.ts', 250));

      const boundary: DetectedBoundary = onBoundaryDetected.mock.calls[0][0];

      // Verify boundary includes all needed data for episode creation
      expect(boundary.suggestedName).toBeDefined();
      expect(boundary.decision.reason).toBeDefined();
      expect(boundary.decision.confidence).toBeGreaterThan(0);
      expect(boundary.windowBefore.length).toBe(2);
      expect(boundary.windowAfter.length).toBe(2);
    });
  });

  describe('episode service integration', () => {
    it('should create episode with triggerType=auto_detected', async () => {
      const episodeService = createMockEpisodeService();
      const onBoundaryDetected = vi.fn().mockImplementation(async (boundary: DetectedBoundary) => {
        await episodeService.create({
          scopeType: 'session',
          sessionId: boundary.sessionId,
          name: boundary.suggestedName ?? 'Auto-detected episode',
          description: `Automatically detected via ${boundary.decision.reason}`,
          triggerType: 'auto_detected',
          metadata: {
            boundaryReason: boundary.decision.reason,
            boundaryConfidence: boundary.decision.confidence,
            boundarySimilarity: boundary.decision.similarity,
            detectedAt: boundary.timestamp.toISOString(),
          },
        });
      });

      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Trigger boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', 'src/auth/login.ts', 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', 'src/auth/logout.ts', 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', 'src/db/schema.ts', 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', 'src/db/query.ts', 250));

      // Verify episode was created with correct properties
      expect(episodeService.create).toHaveBeenCalledTimes(1);
      const createCall = (episodeService.create as Mock).mock.calls[0][0];

      expect(createCall.triggerType).toBe('auto_detected');
      expect(createCall.metadata.boundaryReason).toBeDefined();
      expect(createCall.metadata.boundaryConfidence).toBeGreaterThan(0);
    });

    it('should complete previous episode when new boundary detected', async () => {
      const episodeService = createMockEpisodeService();
      let currentEpisodeId: string | null = null;
      const episodeHistory: string[] = [];

      const onBoundaryDetected = vi.fn().mockImplementation(async (boundary: DetectedBoundary) => {
        // Complete previous episode if exists
        if (currentEpisodeId) {
          await episodeService.complete(
            currentEpisodeId,
            `Auto-completed: new episode started (${boundary.decision.reason})`,
            'success'
          );
        }

        // Create new episode
        const newEpisode = await episodeService.create({
          scopeType: 'session',
          sessionId: boundary.sessionId,
          name: boundary.suggestedName ?? 'Auto-detected episode',
          triggerType: 'auto_detected',
        });
        episodeHistory.push(newEpisode.id);
        currentEpisodeId = newEpisode.id;
      });

      // Use file context shift detection
      const fileShiftConfig = {
        ...config,
        timeGapThresholdMs: 1000000, // Very high to disable time gap detection
      };

      const service = createBoundaryDetectorService(null, fileShiftConfig, {
        onBoundaryDetected,
      });

      // Window 1: working on auth files
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts', 0));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts', 50));
      // Window 2: db files → triggers boundary 1 (no overlap with auth)
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/db/schema.ts', 100));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/db/query.ts', 150));

      expect(episodeService.create).toHaveBeenCalledTimes(1);
      const firstEpisodeId = currentEpisodeId;
      expect(firstEpisodeId).not.toBeNull();

      // Window 3: api files → triggers boundary 2 (no overlap with db)
      await service.ingest(createEvent('session-1', 'Read', 'read', 'src/api/routes.ts', 200));
      await service.ingest(createEvent('session-1', 'Edit', 'edit', 'src/api/handlers.ts', 250));

      expect(episodeService.create).toHaveBeenCalledTimes(2);

      // Verify first episode was completed when second was created
      const completedEpisodes = episodeService._getCompletedEpisodes();
      expect(completedEpisodes.length).toBe(1);
      expect(completedEpisodes[0].id).toBe(firstEpisodeId);

      // Verify episode history is correct
      expect(episodeHistory.length).toBe(2);
    });
  });

  describe('boundary metadata in episodes', () => {
    it('should store boundary reason in episode metadata', async () => {
      const episodeService = createMockEpisodeService();
      const onBoundaryDetected = vi.fn().mockImplementation(async (boundary: DetectedBoundary) => {
        await episodeService.create({
          scopeType: 'session',
          sessionId: boundary.sessionId,
          name: boundary.suggestedName ?? 'Auto-detected episode',
          triggerType: 'auto_detected',
          metadata: {
            boundaryReason: boundary.decision.reason,
            boundaryConfidence: boundary.decision.confidence,
          },
        });
      });

      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Trigger time_gap boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      const createCall = (episodeService.create as Mock).mock.calls[0][0];
      expect(createCall.metadata.boundaryReason).toBe('time_gap');
    });

    it('should store similarity score for embedding-based boundaries', async () => {
      const mockEmbed = vi.fn();
      // Different embeddings to trigger similarity drop
      mockEmbed.mockResolvedValueOnce({
        embedding: [1, 0, 0, 0],
        model: 'test',
        provider: 'local',
      });
      mockEmbed.mockResolvedValueOnce({
        embedding: [0, 0, 0, 1],
        model: 'test',
        provider: 'local',
      });

      const embeddingService = createMockEmbeddingService({ embed: mockEmbed });
      const episodeService = createMockEpisodeService();

      const onBoundaryDetected = vi.fn().mockImplementation(async (boundary: DetectedBoundary) => {
        await episodeService.create({
          scopeType: 'session',
          sessionId: boundary.sessionId,
          name: boundary.suggestedName ?? 'Auto-detected episode',
          triggerType: 'auto_detected',
          metadata: {
            boundaryReason: boundary.decision.reason,
            boundarySimilarity: boundary.decision.similarity,
          },
        });
      });

      const service = createBoundaryDetectorService(embeddingService, config, {
        onBoundaryDetected,
      });

      // Add events (without file context to force embedding-based detection)
      await service.ingest(createEvent('session-1', 'memory_remember', 'add'));
      await service.ingest(createEvent('session-1', 'memory_knowledge', 'add'));
      await service.ingest(createEvent('session-1', 'memory_task', 'create'));
      await service.ingest(createEvent('session-1', 'memory_experience', 'learn'));

      const createCall = (episodeService.create as Mock).mock.calls[0][0];
      expect(createCall.metadata.boundaryReason).toBe('similarity_drop');
      expect(createCall.metadata.boundarySimilarity).toBeDefined();
      expect(createCall.metadata.boundarySimilarity).toBeLessThan(config.similarityThreshold);
    });
  });

  describe('shadow mode vs auto-create mode', () => {
    it('should store boundaries internally when shadowMode=true', async () => {
      const shadowConfig = { ...config, shadowMode: true };
      const onBoundaryDetected = vi.fn();
      const service = createBoundaryDetectorService(null, shadowConfig, {
        onBoundaryDetected,
      });

      // Trigger boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // In shadow mode, callback should NOT be called
      expect(onBoundaryDetected).not.toHaveBeenCalled();

      // But boundaries should be stored internally
      const boundaries = service.getDetectedBoundaries();
      expect(boundaries.length).toBe(1);
    });

    it('should NOT store boundaries internally when shadowMode=false', async () => {
      const onBoundaryDetected = vi.fn();
      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Trigger boundary
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // In auto-create mode, callback SHOULD be called
      expect(onBoundaryDetected).toHaveBeenCalledTimes(1);

      // Boundaries should NOT be stored internally (they're delegated to episode service)
      const boundaries = service.getDetectedBoundaries();
      expect(boundaries.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', async () => {
      const onBoundaryDetected = vi.fn().mockRejectedValue(new Error('Episode creation failed'));
      const service = createBoundaryDetectorService(null, config, {
        onBoundaryDetected,
      });

      // Ingest events - should not throw even if callback fails
      // The boundary detector catches callback errors internally
      await service.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await service.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await service.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await service.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // Callback was still called (and error was caught internally)
      expect(onBoundaryDetected).toHaveBeenCalledTimes(1);
    });
  });
});
