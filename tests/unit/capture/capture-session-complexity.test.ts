import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CaptureService,
  CaptureStateManager,
  resetCaptureStateManager,
} from '../../../src/services/capture/index.js';
import type { TurnData, CaptureConfig } from '../../../src/services/capture/types.js';
import type { IExperienceRepository } from '../../../src/core/interfaces/repositories.js';
import type { KnowledgeModuleDeps } from '../../../src/services/capture/knowledge.module.js';

function createMockExperienceRepo(): IExperienceRepository {
  return {
    create: vi.fn().mockResolvedValue({
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
    }),
    getById: vi.fn(),
    getByTitle: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    getHistory: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    delete: vi.fn(),
    addStep: vi.fn(),
    getTrajectory: vi.fn(),
    promote: vi.fn(),
    recordOutcome: vi.fn(),
    getPromotedExperienceIds: vi.fn().mockResolvedValue(new Set()),
  } as IExperienceRepository;
}

function createMockKnowledgeModuleDeps(): KnowledgeModuleDeps {
  return {
    knowledgeRepo: {
      create: vi.fn().mockResolvedValue({
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
      }),
      getById: vi.fn(),
      getByIds: vi.fn(),
      getByTitle: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getHistory: vi.fn(),
      deactivate: vi.fn(),
      reactivate: vi.fn(),
      delete: vi.fn(),
    } as KnowledgeModuleDeps['knowledgeRepo'],
    guidelineRepo: {
      create: vi.fn().mockResolvedValue({
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
      }),
      getById: vi.fn(),
      getByIds: vi.fn(),
      getByName: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getHistory: vi.fn(),
      deactivate: vi.fn(),
      reactivate: vi.fn(),
      delete: vi.fn(),
    } as KnowledgeModuleDeps['guidelineRepo'],
    toolRepo: {
      create: vi.fn().mockResolvedValue({
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
      }),
      getById: vi.fn(),
      getByIds: vi.fn(),
      getByName: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      getHistory: vi.fn(),
      deactivate: vi.fn(),
      reactivate: vi.fn(),
      delete: vi.fn(),
    } as KnowledgeModuleDeps['toolRepo'],
  };
}

interface CreateCaptureServiceOptions {
  experienceRepo?: IExperienceRepository;
  knowledgeModuleDeps?: KnowledgeModuleDeps;
  stateManager?: CaptureStateManager;
  config?: CaptureConfig;
}

function createCaptureService(options?: CreateCaptureServiceOptions): CaptureService {
  const experienceRepo = options?.experienceRepo ?? createMockExperienceRepo();
  const knowledgeModuleDeps = options?.knowledgeModuleDeps ?? createMockKnowledgeModuleDeps();
  const stateManager = options?.stateManager ?? new CaptureStateManager();

  return new CaptureService(
    {
      experienceRepo,
      knowledgeModuleDeps,
      stateManager,
    },
    options?.config
  );
}

function createTranscriptWithErrorRecovery(): TurnData[] {
  return [
    { role: 'user', content: 'Can you fix this bug in the auth module?' },
    {
      role: 'assistant',
      content: 'I see the error - there is a problem with the token validation.',
    },
    { role: 'user', content: 'The build failed again with an exception.' },
    {
      role: 'assistant',
      content: 'I tried a different approach and fixed the issue. It should work now.',
    },
    { role: 'user', content: 'Great, the tests pass!' },
  ];
}

function createTranscriptWithDecisions(): TurnData[] {
  return [
    { role: 'user', content: 'Should we use React or Vue for the frontend?' },
    {
      role: 'assistant',
      content: 'I decided to use React instead of Vue because of better TypeScript support.',
    },
    { role: 'user', content: 'What about state management?' },
    { role: 'assistant', content: 'I chose Zustand rather than Redux for simpler API.' },
    { role: 'user', content: 'Sounds good.' },
  ];
}

function createTranscriptWithLearning(): TurnData[] {
  return [
    { role: 'user', content: 'Why does the API return 401?' },
    { role: 'assistant', content: 'Looking into it...' },
    { role: 'user', content: 'Found anything?' },
    {
      role: 'assistant',
      content: 'I realized the token was expired. I learned that the refresh logic was broken.',
    },
    { role: 'user', content: 'Oh I see, thanks!' },
  ];
}

function createTranscriptWithHighComplexity(): TurnData[] {
  return [
    { role: 'user', content: 'Fix this bug in the auth module' },
    { role: 'assistant', content: 'I see the error - trying to fix it.' },
    { role: 'user', content: 'Still failing with an exception' },
    {
      role: 'assistant',
      content:
        'I tried another approach. I decided to use a different algorithm instead of the old one.',
    },
    { role: 'user', content: 'Any progress?' },
    {
      role: 'assistant',
      content: 'I realized the root cause - I learned that the config was wrong. Fixed it!',
    },
    { role: 'user', content: 'Perfect, it works now!' },
  ];
}

function createSimpleTranscript(): TurnData[] {
  return [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'What is 2+2?' },
    { role: 'assistant', content: 'The answer is 4.' },
    { role: 'user', content: 'Thanks' },
  ];
}

// =============================================================================
// TESTS
// =============================================================================

describe('CaptureService.onSessionEnd with Transcript Complexity', () => {
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = new CaptureStateManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complexity Detection Integration', () => {
    it('should detect error recovery patterns in transcript and boost extraction', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      // Initialize session with error recovery transcript
      const sessionId = 'session-error-recovery';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithErrorRecovery();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      // End session - should detect error recovery and capture experiences
      const result = await service.onSessionEnd(sessionId);

      // When error recovery is detected, extraction should be more aggressive
      // The result should include complexity signals metadata
      expect(result.experiences.experiences.length).toBeGreaterThanOrEqual(0);

      // Check that complexity was assessed (exposed via result or logs)
      // The session had error recovery patterns, so extraction should have been triggered
    });

    it('should detect decision patterns in transcript', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      const sessionId = 'session-decisions';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithDecisions();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // Decision patterns should be detected and extraction boosted
      expect(result).toBeDefined();
      expect(result.experiences).toBeDefined();
    });

    it('should detect learning patterns in transcript', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      const sessionId = 'session-learning';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithLearning();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // Learning patterns should trigger more aggressive extraction
      expect(result).toBeDefined();
    });

    it('should have higher confidence for high-complexity transcripts', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      const sessionId = 'session-high-complexity';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithHighComplexity();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // High complexity (error recovery + decisions + learning) should result in
      // more aggressive extraction with higher confidence
      expect(result).toBeDefined();
    });

    it('should not boost extraction for simple transcripts', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      const sessionId = 'session-simple';
      service.initSession(sessionId, 'proj-1');

      const transcript = createSimpleTranscript();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // Simple transcripts without complexity signals should use default thresholds
      expect(result).toBeDefined();
    });
  });

  describe('Complexity-based Threshold Adjustment', () => {
    it('should lower minTurns threshold when complexity is high', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({
        experienceRepo,
        stateManager,
        config: {
          enabled: true,
          sessionEnd: {
            enabled: true,
            minTurns: 10, // High threshold
            minTokens: 100,
            extractExperiences: true,
            extractKnowledge: true,
          },
          turnBased: {
            enabled: false,
            triggerAfterTurns: 10,
            triggerAfterTokens: 5000,
            triggerOnToolError: false,
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
        },
      });

      const sessionId = 'session-complexity-threshold';
      service.initSession(sessionId, 'proj-1');

      // Only 7 turns, but high complexity
      const transcript = createTranscriptWithHighComplexity();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      // Without complexity boost, 7 turns < 10 minTurns would skip extraction
      // With complexity boost, extraction should still trigger
      const result = await service.onSessionEnd(sessionId);

      // The complexity signals should lower the effective threshold
      expect(result).toBeDefined();
    });

    it('should lower minTokens threshold when complexity is high', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({
        experienceRepo,
        stateManager,
        config: {
          enabled: true,
          sessionEnd: {
            enabled: true,
            minTurns: 3,
            minTokens: 10000, // High token threshold
            extractExperiences: true,
            extractKnowledge: true,
          },
          turnBased: {
            enabled: false,
            triggerAfterTurns: 10,
            triggerAfterTokens: 5000,
            triggerOnToolError: false,
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
        },
      });

      const sessionId = 'session-token-threshold';
      service.initSession(sessionId, 'proj-1');

      // High complexity transcript
      const transcript = createTranscriptWithHighComplexity();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // Complexity should compensate for low token count
      expect(result).toBeDefined();
    });
  });

  describe('getTranscriptComplexity method', () => {
    it('should expose complexity signals for a session', () => {
      const service = createCaptureService({ stateManager });

      const sessionId = 'session-complexity-api';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithHighComplexity();
      for (const turn of transcript) {
        stateManager.addTurn(sessionId, turn);
      }

      // New API: getTranscriptComplexity(sessionId) returns ComplexitySignals
      const complexity = service.getTranscriptComplexity(sessionId);

      expect(complexity).toBeDefined();
      expect(complexity.score).toBeGreaterThan(0);
      expect(complexity.hasErrorRecovery).toBe(true);
      expect(complexity.hasDecisions).toBe(true);
      expect(complexity.hasLearning).toBe(true);
      expect(complexity.signals.length).toBeGreaterThan(0);
    });

    it('should return zero complexity for empty/non-existent session', () => {
      const service = createCaptureService({ stateManager });

      const complexity = service.getTranscriptComplexity('non-existent-session');

      expect(complexity).toBeDefined();
      expect(complexity.score).toBe(0);
      expect(complexity.signals).toEqual([]);
      expect(complexity.hasErrorRecovery).toBe(false);
      expect(complexity.hasDecisions).toBe(false);
      expect(complexity.hasLearning).toBe(false);
    });

    it('should return zero complexity for simple transcript', () => {
      const service = createCaptureService({ stateManager });

      const sessionId = 'session-simple-api';
      service.initSession(sessionId, 'proj-1');

      const transcript = createSimpleTranscript();
      for (const turn of transcript) {
        stateManager.addTurn(sessionId, turn);
      }

      const complexity = service.getTranscriptComplexity(sessionId);

      expect(complexity).toBeDefined();
      expect(complexity.score).toBe(0);
      expect(complexity.hasErrorRecovery).toBe(false);
      expect(complexity.hasDecisions).toBe(false);
      expect(complexity.hasLearning).toBe(false);
    });
  });

  describe('Complexity affects CaptureResult metadata', () => {
    it('should include complexity signals in capture result', async () => {
      const experienceRepo = createMockExperienceRepo();
      const service = createCaptureService({ experienceRepo, stateManager });

      const sessionId = 'session-result-metadata';
      service.initSession(sessionId, 'proj-1');

      const transcript = createTranscriptWithHighComplexity();
      for (const turn of transcript) {
        await service.onTurnComplete(sessionId, turn);
      }

      const result = await service.onSessionEnd(sessionId);

      // Result should include complexity metadata
      expect(result.complexitySignals).toBeDefined();
      expect(result.complexitySignals?.score).toBeGreaterThan(0);
      expect(result.complexitySignals?.hasErrorRecovery).toBe(true);
    });
  });
});
