/**
 * Tests for Context Detection Service - Transcript Analysis Integration
 *
 * Tests the scope mismatch warning feature that uses transcript analysis
 * to detect when conversation mentions different projects than the current scope.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextDetectionService,
  type ScopeMismatchWarning,
} from '../../src/services/context-detection.service.js';
import type { Config } from '../../src/config/index.js';
import type {
  IProjectRepository,
  ISessionRepository,
} from '../../src/core/interfaces/repositories.js';
import type { TurnData } from '../../src/services/capture/types.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock repositories
function createMockProjectRepo() {
  return {
    findByPath: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockSessionRepo() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
  };
}

function createMockConfig(overrides: Partial<Config['autoContext']> = {}): Config {
  return {
    autoContext: {
      enabled: true,
      cacheTTLMs: 5000,
      defaultAgentId: 'default-agent',
      autoSession: true,
      autoSessionName: 'Auto Session',
      ...overrides,
    },
  } as Config;
}

describe('ContextDetectionService - Transcript Analysis', () => {
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let sessionRepo: ReturnType<typeof createMockSessionRepo>;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    sessionRepo = createMockSessionRepo();
    delete process.env.AGENT_MEMORY_DEFAULT_AGENT_ID;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectScopeMismatch()', () => {
    it('should return null when transcript is empty', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch([]);

      expect(result).toBeNull();
    });

    it('should return null when transcript mentions match current project', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the agent-memory project' },
        { role: 'assistant', content: 'I see you are in agent-memory' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      expect(result).toBeNull();
    });

    it('should detect mismatch when transcript mentions different project', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the frontend-app project' },
        { role: 'assistant', content: 'Let me help with frontend-app' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      expect(result).not.toBeNull();
      expect(result?.mentionedProjects).toContain('frontend-app');
      expect(result?.currentProject).toBe('agent-memory');
      expect(result?.warning).toContain('frontend-app');
    });

    it('should detect multiple mentioned projects', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'The backend repo has similar code' },
        { role: 'assistant', content: 'Comparing with the frontend-app codebase' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      expect(result).not.toBeNull();
      expect(result?.mentionedProjects.length).toBeGreaterThanOrEqual(1);
    });

    it('should return null when no project is detected from cwd', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue(null);
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the other-project project' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      // No current project to compare against
      expect(result).toBeNull();
    });

    it('should handle case-insensitive project name matching', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'Agent-Memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'The AGENT-MEMORY project is great' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      // Should match despite case difference
      expect(result).toBeNull();
    });

    it('should not trigger on partial name matches', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the agent-memory project' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      // "agent-memory" is different from "memory"
      expect(result).not.toBeNull();
      expect(result?.mentionedProjects).toContain('agent-memory');
    });

    it('should include confidence score in result', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the frontend-app project' },
        { role: 'user', content: 'The frontend-app module needs changes' },
        { role: 'user', content: 'In the frontend-app codebase' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.detectScopeMismatch(transcript);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThan(0);
      expect(result?.confidence).toBeLessThanOrEqual(1);
      // Multiple mentions should increase confidence
      expect(result?.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('enrichParams() with transcript analysis', () => {
    it('should include scope mismatch warning when transcript provided', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the frontend-app project' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ action: 'list' }, transcript);

      expect(result.scopeMismatchWarning).toBeDefined();
      expect(result.scopeMismatchWarning?.mentionedProjects).toContain('frontend-app');
    });

    it('should not include warning when transcript matches current scope', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const transcript: TurnData[] = [
        { role: 'user', content: 'Working on the agent-memory project' },
      ];

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ action: 'list' }, transcript);

      expect(result.scopeMismatchWarning).toBeUndefined();
    });

    it('should work without transcript parameter (backward compatible)', async () => {
      const config = createMockConfig();
      projectRepo.findByPath.mockResolvedValue({
        id: 'proj-123',
        name: 'agent-memory',
      });
      sessionRepo.list.mockResolvedValue([]);

      const service = new ContextDetectionService(config, projectRepo as any, sessionRepo as any);
      const result = await service.enrichParams({ action: 'list' });

      expect(result.scopeMismatchWarning).toBeUndefined();
      expect(result.enriched.scopeType).toBe('project');
    });
  });
});
