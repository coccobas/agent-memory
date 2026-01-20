/**
 * Integration tests for boundary-to-episode wiring
 *
 * Tests that the boundary detector callback correctly creates
 * auto-detected episodes when shadowMode=false.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createBoundaryDetectorService,
  type BoundaryDetectorConfig,
  type DetectedBoundary,
  type BufferedEvent,
} from '../../src/services/episode/boundary-detector.js';
import { createEpisodeService, type EpisodeService } from '../../src/services/episode/index.js';
import type {
  IEpisodeRepository,
  EpisodeWithEvents,
} from '../../src/core/interfaces/repositories.js';

// Mock episode repository for integration tests
function createMockEpisodeRepo(): IEpisodeRepository {
  const episodes: EpisodeWithEvents[] = [];
  let eventSequence = 0;

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
      episodes.push(episode);
      return episode;
    }),
    getById: vi.fn().mockImplementation(async (id) => {
      return episodes.find((e) => e.id === id);
    }),
    list: vi.fn().mockImplementation(async () => episodes),
    update: vi.fn().mockImplementation(async (id, input) => {
      const ep = episodes.find((e) => e.id === id);
      if (ep) {
        Object.assign(ep, input);
      }
      return ep;
    }),
    deactivate: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    start: vi.fn().mockImplementation(async (id) => {
      const ep = episodes.find((e) => e.id === id);
      if (ep) {
        ep.status = 'active';
        ep.startedAt = new Date().toISOString();
      }
      return ep as EpisodeWithEvents;
    }),
    complete: vi.fn().mockImplementation(async (id, outcome, outcomeType) => {
      const ep = episodes.find((e) => e.id === id);
      if (ep) {
        ep.status = 'completed';
        ep.outcome = outcome;
        ep.outcomeType = outcomeType;
        ep.endedAt = new Date().toISOString();
      }
      return ep as EpisodeWithEvents;
    }),
    fail: vi.fn().mockImplementation(async (id, outcome) => {
      const ep = episodes.find((e) => e.id === id);
      if (ep) {
        ep.status = 'failed';
        ep.outcome = outcome;
        ep.outcomeType = 'failure';
        ep.endedAt = new Date().toISOString();
      }
      return ep as EpisodeWithEvents;
    }),
    cancel: vi.fn().mockImplementation(async (id, reason) => {
      const ep = episodes.find((e) => e.id === id);
      if (ep) {
        ep.status = 'cancelled';
        ep.outcome = reason ?? null;
        ep.endedAt = new Date().toISOString();
      }
      return ep as EpisodeWithEvents;
    }),
    addEvent: vi.fn().mockImplementation(async (input) => {
      const ep = episodes.find((e) => e.id === input.episodeId);
      if (ep) {
        const event = {
          id: `evt_${++eventSequence}`,
          episodeId: input.episodeId,
          eventType: input.eventType,
          name: input.name,
          description: input.description ?? null,
          occurredAt: new Date().toISOString(),
          sequenceNum: eventSequence,
          entryType: input.entryType ?? null,
          entryId: input.entryId ?? null,
          data: input.data ? JSON.stringify(input.data) : null,
          createdAt: new Date().toISOString(),
        };
        ep.events = ep.events ?? [];
        ep.events.push(event);
        return event;
      }
      throw new Error('Episode not found');
    }),
    getEvents: vi.fn().mockImplementation(async (episodeId) => {
      const ep = episodes.find((e) => e.id === episodeId);
      return ep?.events ?? [];
    }),
    getActiveEpisode: vi.fn().mockImplementation(async (sessionId) => {
      return episodes.find((e) => e.sessionId === sessionId && e.status === 'active');
    }),
    getEpisodesInRange: vi.fn().mockResolvedValue([]),
    getChildren: vi.fn().mockResolvedValue([]),
    getAncestors: vi.fn().mockResolvedValue([]),
    // Expose internal state for testing
    _getEpisodes: () => episodes,
    _clearEpisodes: () => {
      episodes.length = 0;
    },
  } as unknown as IEpisodeRepository & {
    _getEpisodes: () => EpisodeWithEvents[];
    _clearEpisodes: () => void;
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

/**
 * Create the boundary-to-episode callback that wires detection to episode creation
 * This simulates the callback that will be created in context-wiring.ts
 */
function createBoundaryToEpisodeCallback(
  episodeService: EpisodeService,
  scopeType: 'session' | 'project' = 'session',
  scopeId?: string
) {
  return async (boundary: DetectedBoundary) => {
    // Get current active episode for the session
    const activeEpisode = await episodeService.getActiveEpisode(boundary.sessionId);

    // Complete the active episode if one exists
    if (activeEpisode) {
      await episodeService.complete(
        activeEpisode.id,
        `Auto-completed: new episode boundary detected (${boundary.decision.reason})`,
        'success'
      );
    }

    // Create new auto-detected episode
    await episodeService.create({
      scopeType,
      scopeId,
      sessionId: boundary.sessionId,
      name: boundary.suggestedName ?? 'Auto-detected episode',
      description: `Automatically detected via ${boundary.decision.reason}`,
      triggerType: 'auto_detected',
      triggerRef: boundary.decision.reason,
      metadata: {
        boundaryReason: boundary.decision.reason,
        boundaryConfidence: boundary.decision.confidence,
        boundarySimilarity: boundary.decision.similarity,
        detectedAt: boundary.timestamp.toISOString(),
        windowBeforeSize: boundary.windowBefore.length,
        windowAfterSize: boundary.windowAfter.length,
      },
    });
  };
}

describe('Boundary-to-Episode Wiring Integration', () => {
  let episodeRepo: ReturnType<typeof createMockEpisodeRepo>;
  let episodeService: EpisodeService;
  let config: BoundaryDetectorConfig;

  beforeEach(() => {
    episodeRepo = createMockEpisodeRepo();
    episodeService = createEpisodeService({ episodeRepo });

    config = {
      enabled: true,
      shadowMode: false, // Auto-create mode
      windowSize: 2,
      minEvents: 4,
      similarityThreshold: 0.65,
      timeGapThresholdMs: 100, // 100ms for testing
      boundaryDebounceMs: 0, // No debounce for testing
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('auto-detected episode creation', () => {
    it('should create episode with triggerType=auto_detected when boundary detected', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Trigger time gap boundary
      await detector.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes.length).toBe(1);
      expect(episodes[0].triggerType).toBe('auto_detected');
      expect(episodes[0].sessionId).toBe('session-1');
    });

    it('should include boundary metadata in episode', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Trigger boundary
      await detector.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes.length).toBe(1);

      const metadata = JSON.parse(episodes[0].metadata ?? '{}');
      expect(metadata.boundaryReason).toBe('time_gap');
      expect(metadata.boundaryConfidence).toBeGreaterThan(0);
      expect(metadata.detectedAt).toBeDefined();
    });

    it('should use suggestedName from boundary for episode name', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Trigger file context shift with specific files
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts', 0));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts', 50));
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/db/schema.ts', 100));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/db/query.ts', 150));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes.length).toBe(1);
      // Should contain 'db' from the file context (currWindow, not prevWindow)
      expect(episodes[0].name).toContain('db');
    });
  });

  describe('episode lifecycle management', () => {
    it('should complete previous episode when new boundary detected', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // First boundary - creates first episode
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts', 0));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts', 50));
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/db/schema.ts', 100));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/db/query.ts', 150));

      const episodes1 = episodeRepo._getEpisodes();
      expect(episodes1.length).toBe(1);
      const firstEpisodeId = episodes1[0].id;

      // Second boundary - should complete first and create second
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/api/routes.ts', 200));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/api/handlers.ts', 250));

      const episodes2 = episodeRepo._getEpisodes();
      expect(episodes2.length).toBe(2);

      // First episode should be completed
      const firstEpisode = episodes2.find((e) => e.id === firstEpisodeId);
      expect(firstEpisode?.status).toBe('completed');
      expect(firstEpisode?.outcome).toContain('Auto-completed');

      // Second episode should be active
      const secondEpisode = episodes2.find((e) => e.id !== firstEpisodeId);
      expect(secondEpisode?.status).toBe('active');
      expect(secondEpisode?.triggerType).toBe('auto_detected');
    });

    it('should handle multiple boundaries in sequence', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Three different file contexts = three boundaries = three episodes
      // Window 1: auth
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/a.ts', 0));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/b.ts', 10));
      // Window 2: db (boundary 1)
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/db/a.ts', 20));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/db/b.ts', 30));
      // Window 3: api (boundary 2)
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/api/a.ts', 40));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/api/b.ts', 50));
      // Window 4: utils (boundary 3)
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/utils/a.ts', 60));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/utils/b.ts', 70));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes.length).toBe(3);

      // Only the last one should be active
      const activeEpisodes = episodes.filter((e) => e.status === 'active');
      expect(activeEpisodes.length).toBe(1);

      // All should have auto_detected trigger
      expect(episodes.every((e) => e.triggerType === 'auto_detected')).toBe(true);
    });
  });

  describe('session isolation', () => {
    it('should create separate episodes for different sessions', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Session 1 boundary
      await detector.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // Session 2 boundary
      await detector.ingest(createEvent('session-2', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-2', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-2', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-2', 'tool4', 'add', undefined, 250));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes.length).toBe(2);

      const session1Episodes = episodes.filter((e) => e.sessionId === 'session-1');
      const session2Episodes = episodes.filter((e) => e.sessionId === 'session-2');

      expect(session1Episodes.length).toBe(1);
      expect(session2Episodes.length).toBe(1);
    });

    it('should not complete episode from different session', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Create episode in session-1
      await detector.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      // Create episode in session-2 - should NOT complete session-1's episode
      await detector.ingest(createEvent('session-2', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-2', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-2', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-2', 'tool4', 'add', undefined, 250));

      const episodes = episodeRepo._getEpisodes();

      // Both should be active (session-2 didn't complete session-1)
      const activeEpisodes = episodes.filter((e) => e.status === 'active');
      expect(activeEpisodes.length).toBe(2);
    });
  });

  describe('boundary reason tracking', () => {
    it('should track time_gap boundary reason', async () => {
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, config, { onBoundaryDetected });

      // Trigger time gap boundary (no file context)
      await detector.ingest(createEvent('session-1', 'tool1', 'add', undefined, 0));
      await detector.ingest(createEvent('session-1', 'tool2', 'add', undefined, 50));
      await detector.ingest(createEvent('session-1', 'tool3', 'add', undefined, 200));
      await detector.ingest(createEvent('session-1', 'tool4', 'add', undefined, 250));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes[0].triggerRef).toBe('time_gap');
    });

    it('should track file_context_shift boundary reason', async () => {
      const noTimeGapConfig = {
        ...config,
        timeGapThresholdMs: 1000000, // Disable time gap detection
      };
      const onBoundaryDetected = createBoundaryToEpisodeCallback(episodeService, 'session');
      const detector = createBoundaryDetectorService(null, noTimeGapConfig, { onBoundaryDetected });

      // Trigger file context shift
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/auth/login.ts', 0));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/auth/logout.ts', 10));
      await detector.ingest(createEvent('session-1', 'Read', 'read', 'src/db/schema.ts', 20));
      await detector.ingest(createEvent('session-1', 'Edit', 'edit', 'src/db/query.ts', 30));

      const episodes = episodeRepo._getEpisodes();
      expect(episodes[0].triggerRef).toBe('file_context_shift');
    });
  });
});
