import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CaptureStateManager,
  getCaptureStateManager,
  resetCaptureStateManager,
} from '../../src/services/capture/state.js';
import {
  ExperienceCaptureModule,
  createExperienceCaptureModule,
} from '../../src/services/capture/experience.module.js';
import {
  KnowledgeCaptureModule,
  createKnowledgeCaptureModule,
} from '../../src/services/capture/knowledge.module.js';
import { CaptureService } from '../../src/services/capture/index.js';
import type {
  TurnData,
  TurnMetrics,
  CaptureConfig,
  CaptureOptions,
  RecordCaseParams,
  TrajectoryStep,
} from '../../src/services/capture/types.js';
import type {
  IExperienceRepository,
  IKnowledgeRepository,
  IGuidelineRepository,
  IToolRepository,
} from '../../src/core/interfaces/repositories.js';
import type { Experience, Knowledge, Guideline, Tool } from '../../src/db/schema.js';

// =============================================================================
// MOCK REPOSITORIES
// =============================================================================

const createMockExperience = (overrides: Partial<Experience> = {}): Experience => ({
  id: 'exp-1',
  scopeType: 'project',
  scopeId: 'proj-1',
  title: 'Test Experience',
  level: 'case',
  category: null,
  currentVersionId: 'ver-1',
  isActive: true,
  promotedToToolId: null,
  promotedFromId: null,
  useCount: 0,
  successCount: 0,
  lastUsedAt: null,
  createdBy: 'agent-1',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createMockKnowledge = (overrides: Partial<Knowledge> = {}): Knowledge => ({
  id: 'know-1',
  scopeType: 'project',
  scopeId: 'proj-1',
  title: 'Test Knowledge',
  category: 'fact',
  currentVersionId: 'ver-1',
  isActive: true,
  createdAt: new Date().toISOString(),
  createdBy: 'agent-1',
  lastAccessedAt: null,
  accessCount: 0,
  ...overrides,
});

const createMockGuideline = (overrides: Partial<Guideline> = {}): Guideline => ({
  id: 'guide-1',
  scopeType: 'project',
  scopeId: 'proj-1',
  name: 'test-guideline',
  category: 'code_style',
  priority: 50,
  currentVersionId: 'ver-1',
  isActive: true,
  createdAt: new Date().toISOString(),
  createdBy: 'agent-1',
  lastAccessedAt: null,
  accessCount: 0,
  ...overrides,
});

const createMockTool = (overrides: Partial<Tool> = {}): Tool => ({
  id: 'tool-1',
  scopeType: 'project',
  scopeId: 'proj-1',
  name: 'test-tool',
  category: 'cli',
  currentVersionId: 'ver-1',
  isActive: true,
  createdAt: new Date().toISOString(),
  createdBy: 'agent-1',
  lastAccessedAt: null,
  accessCount: 0,
  ...overrides,
});

const createMockExperienceRepo = (): IExperienceRepository => ({
  create: vi.fn().mockResolvedValue(createMockExperience()),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deactivate: vi.fn(),
  search: vi.fn(),
  recordUsage: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  promoteToTool: vi.fn(),
  demoteFromTool: vi.fn(),
  getVersion: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
});

const createMockKnowledgeRepo = (): IKnowledgeRepository => ({
  create: vi.fn().mockResolvedValue(createMockKnowledge()),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deactivate: vi.fn(),
  search: vi.fn(),
  recordAccess: vi.fn(),
  getVersion: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
});

const createMockGuidelineRepo = (): IGuidelineRepository => ({
  create: vi.fn().mockResolvedValue(createMockGuideline()),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deactivate: vi.fn(),
  search: vi.fn(),
  recordAccess: vi.fn(),
  getVersion: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
});

const createMockToolRepo = (): IToolRepository => ({
  create: vi.fn().mockResolvedValue(createMockTool()),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deactivate: vi.fn(),
  search: vi.fn(),
  recordAccess: vi.fn(),
  getVersion: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
});

// =============================================================================
// STATE MANAGER TESTS
// =============================================================================

describe('CaptureStateManager', () => {
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = new CaptureStateManager();
  });

  describe('Session Initialization', () => {
    it('should initialize state correctly', () => {
      const state = stateManager.getOrCreateSession('session-1', 'proj-1');

      expect(state).toBeDefined();
      expect(state.sessionId).toBe('session-1');
      expect(state.projectId).toBe('proj-1');
      expect(state.transcript).toEqual([]);
      expect(state.contentHashes.size).toBe(0);
      expect(state.capturedIds.size).toBe(0);
      expect(state.captureCount).toBe(0);
    });

    it('should return existing session on subsequent calls', () => {
      const state1 = stateManager.getOrCreateSession('session-1', 'proj-1');
      const state2 = stateManager.getOrCreateSession('session-1', 'proj-1');

      expect(state1).toBe(state2);
    });

    it('should initialize metrics correctly', () => {
      const state = stateManager.getOrCreateSession('session-1');

      expect(state.metrics.turnCount).toBe(0);
      expect(state.metrics.userTurnCount).toBe(0);
      expect(state.metrics.assistantTurnCount).toBe(0);
      expect(state.metrics.totalTokens).toBe(0);
      expect(state.metrics.toolCallCount).toBe(0);
      expect(state.metrics.uniqueToolsUsed.size).toBe(0);
      expect(state.metrics.errorCount).toBe(0);
    });

    it('should track start time', () => {
      const before = Date.now();
      const state = stateManager.getOrCreateSession('session-1');
      const after = Date.now();

      expect(state.startTime).toBeGreaterThanOrEqual(before);
      expect(state.startTime).toBeLessThanOrEqual(after);
      expect(state.metrics.startTime).toBeGreaterThanOrEqual(before);
      expect(state.metrics.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('State Updates', () => {
    it('should update state with user turn', () => {
      const turn: TurnData = {
        role: 'user',
        content: 'Hello, world!',
        tokenCount: 10,
      };

      const metrics = stateManager.addTurn('session-1', turn);

      expect(metrics.turnCount).toBe(1);
      expect(metrics.userTurnCount).toBe(1);
      expect(metrics.assistantTurnCount).toBe(0);
      expect(metrics.totalTokens).toBe(10);
    });

    it('should update state with assistant turn', () => {
      const turn: TurnData = {
        role: 'assistant',
        content: 'Hi there!',
        tokenCount: 5,
      };

      const metrics = stateManager.addTurn('session-1', turn);

      expect(metrics.turnCount).toBe(1);
      expect(metrics.userTurnCount).toBe(0);
      expect(metrics.assistantTurnCount).toBe(1);
      expect(metrics.totalTokens).toBe(5);
    });

    it('should track tool calls in turn', () => {
      const turn: TurnData = {
        role: 'assistant',
        content: 'Running tool',
        toolCalls: [
          {
            name: 'grep',
            input: { pattern: 'test' },
            success: true,
          },
          {
            name: 'read',
            input: { path: 'file.ts' },
            success: true,
          },
        ],
      };

      const metrics = stateManager.addTurn('session-1', turn);

      expect(metrics.toolCallCount).toBe(2);
      expect(metrics.uniqueToolsUsed.size).toBe(2);
      expect(metrics.uniqueToolsUsed.has('grep')).toBe(true);
      expect(metrics.uniqueToolsUsed.has('read')).toBe(true);
    });

    it('should track tool errors', () => {
      const turn: TurnData = {
        role: 'assistant',
        content: 'Tool failed',
        toolCalls: [
          {
            name: 'grep',
            input: { pattern: 'test' },
            success: false,
          },
        ],
      };

      const metrics = stateManager.addTurn('session-1', turn);

      expect(metrics.errorCount).toBe(1);
    });

    it('should accumulate metrics across multiple turns', () => {
      stateManager.addTurn('session-1', {
        role: 'user',
        content: 'First turn',
        tokenCount: 10,
      });

      stateManager.addTurn('session-1', {
        role: 'assistant',
        content: 'Second turn',
        tokenCount: 20,
        toolCalls: [
          {
            name: 'grep',
            input: { pattern: 'test' },
            success: true,
          },
        ],
      });

      const metrics = stateManager.addTurn('session-1', {
        role: 'user',
        content: 'Third turn',
        tokenCount: 15,
      });

      expect(metrics.turnCount).toBe(3);
      expect(metrics.userTurnCount).toBe(2);
      expect(metrics.assistantTurnCount).toBe(1);
      expect(metrics.totalTokens).toBe(45);
      expect(metrics.toolCallCount).toBe(1);
    });

    it('should update last turn time', () => {
      const state = stateManager.getOrCreateSession('session-1');
      const initialTime = state.metrics.lastTurnTime;

      // Small delay to ensure time difference
      const turn: TurnData = {
        role: 'user',
        content: 'Test',
      };

      stateManager.addTurn('session-1', turn);
      const state2 = stateManager.getSession('session-1')!;

      expect(state2.metrics.lastTurnTime).toBeGreaterThanOrEqual(initialTime);
    });
  });

  describe('Session State Transitions', () => {
    it('should clear session state', () => {
      stateManager.getOrCreateSession('session-1', 'proj-1');
      stateManager.clearSession('session-1');

      const state = stateManager.getSession('session-1');
      expect(state).toBeUndefined();
    });

    it('should track active sessions', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.getOrCreateSession('session-2');
      stateManager.getOrCreateSession('session-3');

      const activeSessions = stateManager.getActiveSessions();

      expect(activeSessions).toHaveLength(3);
      expect(activeSessions).toContain('session-1');
      expect(activeSessions).toContain('session-2');
      expect(activeSessions).toContain('session-3');
    });

    it('should remove cleared sessions from active list', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.getOrCreateSession('session-2');
      stateManager.clearSession('session-1');

      const activeSessions = stateManager.getActiveSessions();

      expect(activeSessions).toHaveLength(1);
      expect(activeSessions).toContain('session-2');
      expect(activeSessions).not.toContain('session-1');
    });

    it('should track capture count', () => {
      const state = stateManager.getOrCreateSession('session-1');
      expect(state.captureCount).toBe(0);

      stateManager.recordCapture('session-1');
      const state2 = stateManager.getSession('session-1')!;
      expect(state2.captureCount).toBe(1);

      stateManager.recordCapture('session-1');
      const state3 = stateManager.getSession('session-1')!;
      expect(state3.captureCount).toBe(2);
    });

    it('should track last capture time', () => {
      stateManager.getOrCreateSession('session-1');
      const state1 = stateManager.getSession('session-1')!;
      expect(state1.lastCaptureTime).toBeUndefined();

      const before = Date.now();
      stateManager.recordCapture('session-1');
      const after = Date.now();

      const state2 = stateManager.getSession('session-1')!;
      expect(state2.lastCaptureTime).toBeGreaterThanOrEqual(before);
      expect(state2.lastCaptureTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Deduplication', () => {
    it('should generate content hash', () => {
      const hash1 = stateManager.generateContentHash('Test content', 'sha256');
      const hash2 = stateManager.generateContentHash('Test content', 'sha256');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should normalize content before hashing', () => {
      const hash1 = stateManager.generateContentHash('Test Content!');
      const hash2 = stateManager.generateContentHash('  test   content  ');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different algorithms', () => {
      const hash1 = stateManager.generateContentHash('Test', 'sha256');
      const hash2 = stateManager.generateContentHash('Test', 'md5');

      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256
      expect(hash2).toHaveLength(32); // MD5
    });

    it('should detect duplicate in session', () => {
      const hash = stateManager.generateContentHash('Test content');
      // Create session first
      stateManager.getOrCreateSession('session-1');
      stateManager.registerHash(hash, 'knowledge', 'entry-1', 'session-1');

      expect(stateManager.isDuplicateInSession('session-1', hash)).toBe(true);
      expect(stateManager.isDuplicateInSession('session-2', hash)).toBe(false);
    });

    it('should detect duplicate globally', () => {
      const hash = stateManager.generateContentHash('Test content');
      stateManager.registerHash(hash, 'knowledge', 'entry-1');

      expect(stateManager.isDuplicateGlobally(hash)).toBe(true);
    });

    it('should check duplicate with config', () => {
      const hash = stateManager.generateContentHash('Test content');
      // Create session first
      stateManager.getOrCreateSession('session-1');
      stateManager.registerHash(hash, 'knowledge', 'entry-1', 'session-1');

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: { enabled: true, similarityThreshold: 0.9, hashAlgorithm: 'sha256' },
        confidence: { experience: 0.7, knowledge: 0.7, guideline: 0.75, tool: 0.65 },
      };

      expect(stateManager.isDuplicate(hash, 'session-1', config)).toBe(true);
    });

    it('should not check duplicate when deduplication disabled', () => {
      const hash = stateManager.generateContentHash('Test content');
      // Create session first
      stateManager.getOrCreateSession('session-1');
      stateManager.registerHash(hash, 'knowledge', 'entry-1', 'session-1');

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: { enabled: false, similarityThreshold: 0.9, hashAlgorithm: 'sha256' },
        confidence: { experience: 0.7, knowledge: 0.7, guideline: 0.75, tool: 0.65 },
      };

      expect(stateManager.isDuplicate(hash, 'session-1', config)).toBe(false);
    });

    it('should register hash with metadata', () => {
      const hash = stateManager.generateContentHash('Test content');
      const before = Date.now();
      stateManager.registerHash(hash, 'experience', 'exp-1', 'session-1');
      const after = Date.now();

      const info = stateManager.getHashInfo(hash);
      expect(info).toBeDefined();
      expect(info!.hash).toBe(hash);
      expect(info!.entryType).toBe('experience');
      expect(info!.entryId).toBe('exp-1');
      expect(info!.createdAt).toBeGreaterThanOrEqual(before);
      expect(info!.createdAt).toBeLessThanOrEqual(after);
    });

    it('should clear old hashes', async () => {
      const hash1 = stateManager.generateContentHash('Content 1');
      const hash2 = stateManager.generateContentHash('Content 2');

      stateManager.registerHash(hash1, 'knowledge', 'entry-1');
      stateManager.registerHash(hash2, 'knowledge', 'entry-2');

      // Wait a tiny bit to ensure hashes are "old"
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clear hashes older than 5ms (should clear both)
      const cleared = stateManager.clearOldHashes(5);

      expect(cleared).toBe(2);
      expect(stateManager.getHashInfo(hash1)).toBeUndefined();
      expect(stateManager.getHashInfo(hash2)).toBeUndefined();
    });

    it('should not clear recent hashes', () => {
      const hash = stateManager.generateContentHash('Content');
      stateManager.registerHash(hash, 'knowledge', 'entry-1');

      // Clear hashes older than 1 day
      const cleared = stateManager.clearOldHashes(24 * 60 * 60 * 1000);

      expect(cleared).toBe(0);
      expect(stateManager.getHashInfo(hash)).toBeDefined();
    });
  });

  describe('Threshold Checks', () => {
    const createConfig = (): CaptureConfig => ({
      enabled: true,
      sessionEnd: {
        enabled: true,
        minTurns: 3,
        minTokens: 500,
        extractExperiences: true,
        extractKnowledge: true,
      },
      turnBased: {
        enabled: true,
        triggerAfterTurns: 5,
        triggerAfterTokens: 1000,
        triggerOnToolError: true,
        maxCapturesPerSession: 3,
      },
      deduplication: {
        enabled: true,
        similarityThreshold: 0.9,
        hashAlgorithm: 'sha256',
      },
      confidence: {
        experience: 0.7,
        knowledge: 0.7,
        guideline: 0.75,
        tool: 0.65,
      },
    });

    it('should trigger turn capture on turn threshold', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 100,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerTurnCapture(metrics, config, 0)).toBe(true);
    });

    it('should trigger turn capture on token threshold', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        totalTokens: 1000,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerTurnCapture(metrics, config, 0)).toBe(true);
    });

    it('should trigger turn capture on tool error', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 1,
        userTurnCount: 1,
        assistantTurnCount: 0,
        totalTokens: 50,
        toolCallCount: 1,
        uniqueToolsUsed: new Set(['grep']),
        errorCount: 1,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerTurnCapture(metrics, config, 0)).toBe(true);
    });

    it('should not trigger when turn-based disabled', () => {
      const config = createConfig();
      config.turnBased.enabled = false;

      const metrics: TurnMetrics = {
        turnCount: 10,
        userTurnCount: 5,
        assistantTurnCount: 5,
        totalTokens: 2000,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerTurnCapture(metrics, config, 0)).toBe(false);
    });

    it('should not trigger when max captures reached', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 10,
        userTurnCount: 5,
        assistantTurnCount: 5,
        totalTokens: 2000,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerTurnCapture(metrics, config, 3)).toBe(false);
    });

    it('should trigger session end capture when thresholds met', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerSessionEndCapture(metrics, config)).toBe(true);
    });

    it('should not trigger session end capture when turns below threshold', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerSessionEndCapture(metrics, config)).toBe(false);
    });

    it('should not trigger session end capture when tokens below threshold', () => {
      const config = createConfig();
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 300,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerSessionEndCapture(metrics, config)).toBe(false);
    });

    it('should not trigger session end when disabled', () => {
      const config = createConfig();
      config.sessionEnd.enabled = false;

      const metrics: TurnMetrics = {
        turnCount: 10,
        userTurnCount: 5,
        assistantTurnCount: 5,
        totalTokens: 2000,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      expect(stateManager.shouldTriggerSessionEndCapture(metrics, config)).toBe(false);
    });
  });

  describe('Singleton Access', () => {
    it('should return singleton instance', () => {
      const manager1 = getCaptureStateManager();
      const manager2 = getCaptureStateManager();

      expect(manager1).toBe(manager2);
    });

    it('should reset singleton', () => {
      const manager1 = getCaptureStateManager();
      resetCaptureStateManager();
      const manager2 = getCaptureStateManager();

      expect(manager1).not.toBe(manager2);
    });
  });
});

// =============================================================================
// EXPERIENCE MODULE TESTS
// =============================================================================

describe('ExperienceCaptureModule', () => {
  let module: ExperienceCaptureModule;
  let mockRepo: IExperienceRepository;
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = getCaptureStateManager();
    mockRepo = createMockExperienceRepo();
    module = createExperienceCaptureModule(mockRepo, stateManager, 'disabled');
  });

  describe('Capture Triggers', () => {
    it('should capture when session end enabled', () => {
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(true);
    });

    it('should not capture when session end disabled', () => {
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: false,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(false);
    });

    it('should not capture when experiences extraction disabled', () => {
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: false,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(false);
    });

    it('should not capture when below turn threshold', () => {
      const metrics: TurnMetrics = {
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        totalTokens: 800,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(false);
    });

    it('should not capture when below token threshold', () => {
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 300,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 10,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(false);
    });
  });

  describe('Experience Capture', () => {
    it('should handle disabled provider', async () => {
      const transcript: TurnData[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const metrics: TurnMetrics = {
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        totalTokens: 100,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const options: CaptureOptions = {
        scopeType: 'project',
        scopeId: 'proj-1',
      };

      const result = await module.capture(transcript, metrics, options);

      expect(result.experiences).toHaveLength(0);
      expect(result.skippedDuplicates).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Record Case', () => {
    it('should record explicit case experience', async () => {
      const params: RecordCaseParams = {
        projectId: 'proj-1',
        sessionId: 'session-1',
        agentId: 'agent-1',
        title: 'Bug Fix Experience',
        scenario: 'Encountered null pointer error in production',
        outcome: 'Fixed by adding null check',
        category: 'debugging',
        confidence: 0.9,
        source: 'user',
      };

      const result = await module.recordCase(params);

      expect(result.experiences).toHaveLength(1);
      expect(result.experiences[0].confidence).toBe(0.9);
      expect(result.experiences[0].source).toBe('reflection');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Bug Fix Experience',
          scenario: 'Encountered null pointer error in production',
          outcome: 'Fixed by adding null check',
          category: 'debugging',
          confidence: 0.9,
          source: 'user',
        })
      );
    });

    it('should include trajectory in case', async () => {
      const trajectory: TrajectoryStep[] = [
        {
          action: 'Inspect error logs',
          observation: 'Found null pointer exception',
          reasoning: 'Need to identify source of null value',
          success: true,
        },
        {
          action: 'Add null check',
          observation: 'Error resolved',
          reasoning: 'Prevent null dereference',
          success: true,
        },
      ];

      const params: RecordCaseParams = {
        title: 'Debugging Session',
        scenario: 'Production error',
        outcome: 'Fixed',
        trajectory,
      };

      await module.recordCase(params);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: trajectory,
        })
      );
    });

    it('should skip duplicate case', async () => {
      // Reset and recreate module to get fresh state manager
      resetCaptureStateManager();
      const freshStateManager = getCaptureStateManager();
      const freshModule = createExperienceCaptureModule(mockRepo, freshStateManager, 'disabled');

      // Create session first
      freshStateManager.getOrCreateSession('session-1');

      const params: RecordCaseParams = {
        sessionId: 'session-1',
        title: 'Same Experience',
        scenario: 'Same scenario',
        outcome: 'Same outcome',
      };

      // First call should succeed
      const result1 = await freshModule.recordCase(params);
      expect(result1.experiences).toHaveLength(1);

      // Second call should skip duplicate
      const result2 = await freshModule.recordCase(params);
      expect(result2.experiences).toHaveLength(0);
      expect(result2.skippedDuplicates).toBe(1);
    });

    it('should use default values for optional fields', async () => {
      const params: RecordCaseParams = {
        title: 'Minimal Case',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
      };

      await module.recordCase(params);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'global',
          level: 'case',
          confidence: 0.7,
          source: 'user',
        })
      );
    });

    it('should handle UNIQUE constraint violation gracefully', async () => {
      const existingExperience = {
        id: 'existing-exp-id',
        title: 'Duplicate Title',
        currentVersion: { confidence: 0.8 },
      };

      mockRepo.create = vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'UNIQUE constraint failed: experiences.scope_type, experiences.scope_id, experiences.title'
          )
        );
      mockRepo.getByTitle = vi.fn().mockResolvedValueOnce(existingExperience);

      const params: RecordCaseParams = {
        title: 'Duplicate Title',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
        projectId: 'proj-1',
      };

      const result = await module.recordCase(params);

      expect(result.skippedDuplicates).toBe(1);
      expect(result.experiences).toHaveLength(1);
      expect(result.experiences[0].experience).toBe(existingExperience);
      expect(mockRepo.getByTitle).toHaveBeenCalledWith(
        'Duplicate Title',
        'project',
        'proj-1',
        false
      );
    });

    it('should mark as duplicate when UNIQUE constraint fails and getByTitle fails', async () => {
      mockRepo.create = vi.fn().mockRejectedValueOnce(new Error('UNIQUE constraint failed'));
      mockRepo.getByTitle = vi.fn().mockRejectedValueOnce(new Error('DB error'));

      const params: RecordCaseParams = {
        title: 'Duplicate Title',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
      };

      const result = await module.recordCase(params);

      expect(result.skippedDuplicates).toBe(1);
      expect(result.experiences).toHaveLength(0);
    });
  });
});

// =============================================================================
// KNOWLEDGE MODULE TESTS
// =============================================================================

describe('KnowledgeCaptureModule', () => {
  let module: KnowledgeCaptureModule;
  let mockKnowledgeRepo: IKnowledgeRepository;
  let mockGuidelineRepo: IGuidelineRepository;
  let mockToolRepo: IToolRepository;
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = getCaptureStateManager();
    mockKnowledgeRepo = createMockKnowledgeRepo();
    mockGuidelineRepo = createMockGuidelineRepo();
    mockToolRepo = createMockToolRepo();

    module = createKnowledgeCaptureModule({
      knowledgeRepo: mockKnowledgeRepo,
      guidelineRepo: mockGuidelineRepo,
      toolRepo: mockToolRepo,
      stateManager,
    });
  });

  describe('Capture Triggers', () => {
    it('should trigger on turn threshold', () => {
      const metrics: TurnMetrics = {
        turnCount: 5,
        userTurnCount: 3,
        assistantTurnCount: 2,
        totalTokens: 100,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: true,
          triggerAfterTurns: 5,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(true);
    });

    it('should not trigger when turn-based disabled', () => {
      const metrics: TurnMetrics = {
        turnCount: 10,
        userTurnCount: 5,
        assistantTurnCount: 5,
        totalTokens: 2000,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const config: CaptureConfig = {
        enabled: true,
        sessionEnd: {
          enabled: true,
          minTurns: 3,
          minTokens: 500,
          extractExperiences: true,
          extractKnowledge: true,
        },
        turnBased: {
          enabled: false,
          triggerAfterTurns: 5,
          triggerAfterTokens: 5000,
          triggerOnToolError: true,
          maxCapturesPerSession: 5,
        },
        deduplication: {
          enabled: true,
          similarityThreshold: 0.9,
          hashAlgorithm: 'sha256',
        },
        confidence: {
          experience: 0.7,
          knowledge: 0.7,
          guideline: 0.75,
          tool: 0.65,
        },
      };

      expect(module.shouldCapture(metrics, config)).toBe(false);
    });
  });

  describe('Knowledge Capture', () => {
    it('should handle unavailable extraction service', async () => {
      const transcript: TurnData[] = [{ role: 'user', content: 'Test' }];

      const metrics: TurnMetrics = {
        turnCount: 1,
        userTurnCount: 1,
        assistantTurnCount: 0,
        totalTokens: 10,
        toolCallCount: 0,
        uniqueToolsUsed: new Set(),
        errorCount: 0,
        startTime: Date.now(),
        lastTurnTime: Date.now(),
      };

      const options: CaptureOptions = {
        scopeType: 'project',
        scopeId: 'proj-1',
      };

      const result = await module.capture(transcript, metrics, options);

      expect(result.knowledge).toHaveLength(0);
      expect(result.guidelines).toHaveLength(0);
      expect(result.tools).toHaveLength(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('CaptureService Integration', () => {
  let service: CaptureService;
  let mockExperienceRepo: IExperienceRepository;
  let mockKnowledgeRepo: IKnowledgeRepository;
  let mockGuidelineRepo: IGuidelineRepository;
  let mockToolRepo: IToolRepository;
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = getCaptureStateManager();

    mockExperienceRepo = createMockExperienceRepo();
    mockKnowledgeRepo = createMockKnowledgeRepo();
    mockGuidelineRepo = createMockGuidelineRepo();
    mockToolRepo = createMockToolRepo();

    service = new CaptureService({
      experienceRepo: mockExperienceRepo,
      stateManager,
      knowledgeModuleDeps: {
        knowledgeRepo: mockKnowledgeRepo,
        guidelineRepo: mockGuidelineRepo,
        toolRepo: mockToolRepo,
      },
    });
  });

  describe('Session Management', () => {
    it('should initialize capture session', () => {
      service.initSession('session-1', 'proj-1');

      const metrics = service.getSessionMetrics('session-1');
      expect(metrics).toBeDefined();
      expect(metrics!.turnCount).toBe(0);
    });

    it('should track session metrics', async () => {
      service.initSession('session-1', 'proj-1');

      const turn: TurnData = {
        role: 'user',
        content: 'Test turn',
        tokenCount: 10,
      };

      await service.onTurnComplete('session-1', turn);

      const metrics = service.getSessionMetrics('session-1');
      expect(metrics!.turnCount).toBe(1);
      expect(metrics!.totalTokens).toBe(10);
    });

    it('should list active sessions', () => {
      service.initSession('session-1');
      service.initSession('session-2');

      const active = service.getActiveSessions();
      expect(active).toHaveLength(2);
      expect(active).toContain('session-1');
      expect(active).toContain('session-2');
    });
  });

  describe('Turn-Based Capture', () => {
    it('should not trigger capture when disabled', async () => {
      service.updateConfig({
        enabled: false,
      });

      const turn: TurnData = {
        role: 'user',
        content: 'Test',
      };

      const result = await service.onTurnComplete('session-1', turn);
      expect(result).toBeNull();
    });

    it('should return null when session not initialized', async () => {
      const turn: TurnData = {
        role: 'user',
        content: 'Test',
      };

      // Don't initialize session - should create it automatically
      const result = await service.onTurnComplete('session-1', turn);

      // With turn-based disabled by default, should return null
      expect(result).toBeNull();
    });
  });

  describe('Session End Capture', () => {
    it('should not capture when disabled', async () => {
      service.updateConfig({
        enabled: false,
      });

      const result = await service.onSessionEnd('session-1');

      expect(result.experiences.experiences).toHaveLength(0);
      expect(result.knowledge.knowledge).toHaveLength(0);
    });

    it('should not capture when session not found', async () => {
      const result = await service.onSessionEnd('nonexistent');

      expect(result.experiences.experiences).toHaveLength(0);
      expect(result.knowledge.knowledge).toHaveLength(0);
    });

    it('should not capture when below thresholds', async () => {
      service.initSession('session-1');

      // Add minimal turns
      await service.onTurnComplete('session-1', {
        role: 'user',
        content: 'Hi',
        tokenCount: 5,
      });

      const result = await service.onSessionEnd('session-1');

      expect(result.experiences.experiences).toHaveLength(0);
      expect(result.knowledge.knowledge).toHaveLength(0);
    });

    it('should clear session after capture', async () => {
      service.initSession('session-1');

      // Add enough turns to meet threshold
      for (let i = 0; i < 5; i++) {
        await service.onTurnComplete('session-1', {
          role: 'user',
          content: `Turn ${i}`,
          tokenCount: 100,
        });
      }

      await service.onSessionEnd('session-1');

      const metrics = service.getSessionMetrics('session-1');
      expect(metrics).toBeUndefined();
    });
  });

  describe('Explicit Case Recording', () => {
    it('should record case when enabled', async () => {
      const params: RecordCaseParams = {
        title: 'Test Case',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
      };

      const result = await service.recordCase(params);

      expect(result.experiences).toHaveLength(1);
      expect(mockExperienceRepo.create).toHaveBeenCalled();
    });

    it('should not record when disabled', async () => {
      service.updateConfig({
        enabled: false,
      });

      const params: RecordCaseParams = {
        title: 'Test Case',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
      };

      const result = await service.recordCase(params);

      expect(result.experiences).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should get current config', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
      expect(config.sessionEnd).toBeDefined();
      expect(config.turnBased).toBeDefined();
      expect(config.deduplication).toBeDefined();
      expect(config.confidence).toBeDefined();
    });

    it('should update config', () => {
      service.updateConfig({
        enabled: false,
        sessionEnd: {
          enabled: false,
          minTurns: 10,
          minTokens: 2000,
          extractExperiences: false,
          extractKnowledge: false,
        },
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.sessionEnd.enabled).toBe(false);
      expect(config.sessionEnd.minTurns).toBe(10);
    });

    it('should merge partial config updates', () => {
      service.updateConfig({
        sessionEnd: {
          minTurns: 5,
        } as any,
      });

      const config = service.getConfig();
      expect(config.sessionEnd.minTurns).toBe(5);
      expect(config.sessionEnd.enabled).toBe(true); // Should keep original value
    });
  });

  describe('Hash Management', () => {
    it('should clear old hashes', async () => {
      // Use the shared stateManager from beforeEach which is same as service's internal one

      // Register some hashes
      stateManager.registerHash('hash1', 'knowledge', 'entry-1');
      stateManager.registerHash('hash2', 'knowledge', 'entry-2');

      // Wait a tiny bit to ensure hashes are "old"
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Clear hashes older than 5ms
      const cleared = service.clearOldHashes(5);
      expect(cleared).toBe(2);
    });
  });
});
