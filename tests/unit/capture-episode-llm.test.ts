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
    shouldCapture: vi.fn().mockReturnValue(true),
  })),
}));

// Import AFTER mock setup
import { CaptureService } from '../../src/services/capture/index.js';
import type { TurnData } from '../../src/services/capture/types.js';

describe('Episode LLM Capture', () => {
  let captureService: CaptureService;

  beforeEach(() => {
    // Setup will go here
  });

  it.skip('placeholder - tests will be added in next phase', () => {
    // Tests will be added in next phase
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

    // Verify all 9 fields are present
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
