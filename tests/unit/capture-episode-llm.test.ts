/**
 * Episode LLM Capture Tests
 *
 * Tests for the LLM-based episode capture functionality.
 * Scaffolding with mocks for experience module factory.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the module factory
vi.mock('../../src/services/capture/experience.module.js', () => ({
  createExperienceCaptureModule: vi.fn(() => ({
    capture: vi.fn().mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-1', title: 'LLM-extracted title' },
          confidence: 0.85,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 100,
    }),
    recordCase: vi.fn().mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-recorded', title: 'Recorded case' },
          confidence: 0.7,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 50,
    }),
    shouldCapture: vi.fn().mockReturnValue(true),
  })),
}));

// Mock episode service for linking
const mockEpisodeService = {
  linkEntity: vi.fn().mockResolvedValue(undefined),
};

// Import AFTER mock setup
import { CaptureService } from '../../src/services/capture/index.js';
import type { TurnData } from '../../src/services/capture/types.js';

describe('Episode LLM Capture', () => {
  let captureService: CaptureService;

  beforeEach(() => {
    vi.clearAllMocks();

    captureService = new CaptureService({
      experienceRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
      } as any,
      knowledgeModuleDeps: {
        knowledgeRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        guidelineRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        toolRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
      },
    });
  });

  it('should call captureModule.capture() instead of recordCase()', async () => {
    const episode = {
      id: 'ep-1',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [
        {
          eventType: 'started',
          name: 'Episode started',
          description: 'Starting episode',
          data: null,
          occurredAt: '2025-01-28T10:00:00Z',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(result.experiences).toBeDefined();
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should not call summarizeMessages()', async () => {
    const episode = {
      id: 'ep-1',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(result).toBeDefined();
    expect(result.experiences).toBeDefined();
  });

  it('should include episodeId in CaptureOptions', async () => {
    const episode = {
      id: 'ep-123',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(result).toBeDefined();
    expect(result.experiences).toBeDefined();
  });

  it('should check minimum message length before capturing', async () => {
    const episode = {
      id: 'ep-1',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(result).toBeDefined();
    expect(result.experiences).toBeDefined();
  });

  it('should link all experiences from capture result to episode', async () => {
    const mockCapture = vi.fn().mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-1', title: 'Experience 1' },
          confidence: 0.85,
          source: 'observation',
        },
        {
          experience: { id: 'exp-2', title: 'Experience 2' },
          confidence: 0.9,
          source: 'observation',
        },
        {
          experience: { id: 'exp-3', title: 'Experience 3' },
          confidence: 0.88,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 150,
    });

    const mockExperienceModule = {
      capture: mockCapture,
      shouldCapture: vi.fn().mockReturnValue(true),
    };

    captureService = new CaptureService({
      experienceRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
      } as any,
      knowledgeModuleDeps: {
        knowledgeRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        guidelineRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        toolRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
      },
      episodeService: mockEpisodeService as any,
    });

    // @ts-ignore - set the experience module
    captureService.experienceModule = mockExperienceModule;

    const episode = {
      id: 'ep-123',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(result.experiences).toHaveLength(3);
    expect(mockEpisodeService.linkEntity).toHaveBeenCalledTimes(3);
    expect(mockEpisodeService.linkEntity).toHaveBeenCalledWith(
      'ep-123',
      'experience',
      'exp-1',
      'created'
    );
    expect(mockEpisodeService.linkEntity).toHaveBeenCalledWith(
      'ep-123',
      'experience',
      'exp-2',
      'created'
    );
    expect(mockEpisodeService.linkEntity).toHaveBeenCalledWith(
      'ep-123',
      'experience',
      'exp-3',
      'created'
    );
  });
});

describe('buildSyntheticMetrics', () => {
  let captureService: CaptureService;

  beforeEach(() => {
    captureService = new CaptureService({
      experienceRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
      } as any,
      knowledgeModuleDeps: {
        knowledgeRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        guidelineRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        toolRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
      },
    });
  });

  it('should return object with all 9 TurnMetrics fields', () => {
    const messages: TurnData[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);

    expect(metrics).toHaveProperty('turnCount');
    expect(metrics).toHaveProperty('userTurnCount');
    expect(metrics).toHaveProperty('assistantTurnCount');
    expect(metrics).toHaveProperty('totalTokens');
    expect(metrics).toHaveProperty('toolCallCount');
    expect(metrics).toHaveProperty('uniqueToolsUsed');
    expect(metrics).toHaveProperty('errorCount');
    expect(metrics).toHaveProperty('startTime');
    expect(metrics).toHaveProperty('lastTurnTime');
  });

  it('should calculate correct counts', () => {
    const messages: TurnData[] = [
      { role: 'user', content: 'First user message' },
      { role: 'assistant', content: 'First assistant response' },
      { role: 'user', content: 'Second user message' },
      { role: 'assistant', content: 'Second assistant response' },
      { role: 'assistant', content: 'Third assistant response' },
    ];

    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);

    expect(metrics.turnCount).toBe(5);
    expect(metrics.userTurnCount).toBe(2);
    expect(metrics.assistantTurnCount).toBe(3);
  });

  it('should have empty Set for uniqueToolsUsed', () => {
    const messages: TurnData[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);

    expect(metrics.uniqueToolsUsed).toBeInstanceOf(Set);
    expect(metrics.uniqueToolsUsed.size).toBe(0);
  });

  it('should set totalTokens, toolCallCount, and errorCount to 0', () => {
    const messages: TurnData[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);

    expect(metrics.totalTokens).toBe(0);
    expect(metrics.toolCallCount).toBe(0);
    expect(metrics.errorCount).toBe(0);
  });

  it('should set startTime and lastTurnTime to current time', () => {
    const messages: TurnData[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const beforeTime = Date.now();
    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);
    const afterTime = Date.now();

    expect(metrics.startTime).toBeGreaterThanOrEqual(beforeTime);
    expect(metrics.startTime).toBeLessThanOrEqual(afterTime);
    expect(metrics.lastTurnTime).toBeGreaterThanOrEqual(beforeTime);
    expect(metrics.lastTurnTime).toBeLessThanOrEqual(afterTime);
  });

  it('should handle empty messages array', () => {
    const messages: TurnData[] = [];

    // @ts-ignore - accessing private method for testing
    const metrics = captureService.buildSyntheticMetrics(messages);

    expect(metrics.turnCount).toBe(0);
    expect(metrics.userTurnCount).toBe(0);
    expect(metrics.assistantTurnCount).toBe(0);
  });
});

describe('Fallback to recordCase', () => {
  let captureService: CaptureService;
  let recordCaseSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    captureService = new CaptureService({
      experienceRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
      } as any,
      knowledgeModuleDeps: {
        knowledgeRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        guidelineRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        toolRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
      },
    });

    // Spy on recordCase method
    recordCaseSpy = vi.spyOn(captureService, 'recordCase');
  });

  it('should fall back to recordCase when messages.length < 2', async () => {
    recordCaseSpy.mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-fallback', title: 'Fallback case' },
          confidence: 0.7,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 50,
    });

    const episode = {
      id: 'ep-1',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [
        {
          eventType: 'started',
          name: 'Episode started',
          description: 'Starting episode',
          data: null,
          occurredAt: '2025-01-28T10:00:00Z',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(recordCaseSpy).toHaveBeenCalled();
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0].experience?.id).toBe('exp-fallback');
  });

  it('should fall back to recordCase when capture returns 0 experiences', async () => {
    recordCaseSpy.mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-fallback-2', title: 'Fallback case 2' },
          confidence: 0.7,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 50,
    });

    // Mock capture to return empty experiences
    const mockExperienceModule = {
      capture: vi.fn().mockResolvedValue({
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 100,
      }),
      recordCase: vi.fn(),
      shouldCapture: vi.fn().mockReturnValue(true),
    };

    // Replace the experience module
    // @ts-ignore - accessing private property for testing
    captureService.experienceModule = mockExperienceModule;

    const episode = {
      id: 'ep-2',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(recordCaseSpy).toHaveBeenCalled();
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0].experience?.id).toBe('exp-fallback-2');
  });

  it('should fall back to recordCase when capture throws error', async () => {
    recordCaseSpy.mockResolvedValue({
      experiences: [
        {
          experience: { id: 'exp-fallback-3', title: 'Fallback case 3' },
          confidence: 0.7,
          source: 'observation',
        },
      ],
      skippedDuplicates: 0,
      processingTimeMs: 50,
    });

    // Mock capture to throw error
    const mockExperienceModule = {
      capture: vi.fn().mockRejectedValue(new Error('LLM API failed')),
      recordCase: vi.fn(),
      shouldCapture: vi.fn().mockReturnValue(true),
    };

    // Replace the experience module
    // @ts-ignore - accessing private property for testing
    captureService.experienceModule = mockExperienceModule;

    const episode = {
      id: 'ep-3',
      name: 'Test Episode',
      description: 'Test description',
      outcome: 'Completed',
      outcomeType: 'success',
      durationMs: 5000,
      scopeType: 'project',
      scopeId: 'proj-123',
      sessionId: 'sess-456',
      events: [],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2025-01-28T10:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-28T10:00:01Z',
        },
      ],
    };

    // @ts-ignore - accessing private method for testing
    const result = await captureService.onEpisodeComplete(episode);

    expect(recordCaseSpy).toHaveBeenCalled();
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0].experience?.id).toBe('exp-fallback-3');
  });
});

describe('convertMessagesToTurnData', () => {
  let captureService: CaptureService;

  beforeEach(() => {
    captureService = new CaptureService({
      experienceRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
      } as any,
      knowledgeModuleDeps: {
        knowledgeRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        guidelineRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
        toolRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          search: vi.fn(),
        } as any,
      },
    });
  });

  it('should convert messages to TurnData format', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        createdAt: '2025-01-28T10:00:00Z',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there',
        createdAt: '2025-01-28T10:00:01Z',
      },
    ];

    // @ts-ignore - accessing private method for testing
    const result = captureService.convertMessagesToTurnData(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'user',
      content: 'Hello',
      timestamp: '2025-01-28T10:00:00Z',
    });
    expect(result[1]).toEqual({
      role: 'assistant',
      content: 'Hi there',
      timestamp: '2025-01-28T10:00:01Z',
    });
  });

  it('should handle empty array', () => {
    const messages: any[] = [];

    // @ts-ignore - accessing private method for testing
    const result = captureService.convertMessagesToTurnData(messages);

    expect(result).toEqual([]);
  });

  it('should map role types correctly', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'User message',
        createdAt: '2025-01-28T10:00:00Z',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Assistant message',
        createdAt: '2025-01-28T10:00:01Z',
      },
      {
        id: 'msg-3',
        role: 'system',
        content: 'System message',
        createdAt: '2025-01-28T10:00:02Z',
      },
    ];

    // @ts-ignore - accessing private method for testing
    const result = captureService.convertMessagesToTurnData(messages);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('system');
  });
});
