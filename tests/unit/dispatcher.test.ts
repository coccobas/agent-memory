/**
 * Tests for the Unified Memory Dispatcher
 *
 * The dispatcher routes intent detection results to appropriate handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch, type DispatcherDeps } from '../../src/services/unified-memory/dispatcher.js';
import type { IntentDetectionResult } from '../../src/services/intent-detection/index.js';
import type { AppContext } from '../../src/core/context.js';

// Mock the query pipeline
vi.mock('../../src/services/query/index.js', () => ({
  executeQueryPipeline: vi.fn(),
}));

import { executeQueryPipeline } from '../../src/services/query/index.js';

describe('Unified Memory Dispatcher', () => {
  let mockContext: AppContext;
  let mockDeps: DispatcherDeps;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock repositories
    mockContext = {
      repos: {
        guidelines: {
          create: vi.fn().mockResolvedValue({
            id: 'guideline-123',
            name: 'Test Guideline',
            content: 'Test content',
          }),
          list: vi.fn().mockResolvedValue([
            { id: 'g1', name: 'Guideline 1' },
            { id: 'g2', name: 'Guideline 2' },
          ]),
        },
        knowledge: {
          create: vi.fn().mockResolvedValue({
            id: 'knowledge-123',
            title: 'Test Knowledge',
            content: 'Test content',
          }),
          list: vi.fn().mockResolvedValue([
            { id: 'k1', title: 'Knowledge 1' },
            { id: 'k2', title: 'Knowledge 2' },
          ]),
        },
        tools: {
          create: vi.fn().mockResolvedValue({
            id: 'tool-123',
            name: 'Test Tool',
            description: 'Test description',
          }),
          list: vi.fn().mockResolvedValue([
            { id: 't1', name: 'Tool 1' },
            { id: 't2', name: 'Tool 2' },
          ]),
        },
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'session-123',
            name: 'Test Session',
          }),
          end: vi.fn().mockResolvedValue(true),
        },
      },
      queryDeps: {},
    } as unknown as AppContext;

    mockDeps = {
      context: mockContext,
      projectId: 'project-123',
      sessionId: 'session-456',
      agentId: 'agent-789',
    };
  });

  describe('dispatch function', () => {
    describe('low confidence handling', () => {
      it('should return low_confidence status when confidence < 0.5', async () => {
        const intent: IntentDetectionResult = {
          intent: 'store',
          confidence: 0.3,
          content: 'test content',
        };

        const result = await dispatch(intent, mockDeps);

        expect(result.status).toBe('low_confidence');
        expect(result.action).toBe('store');
        expect(result.message).toContain('low confidence');
        expect(result.message).toContain('30%');
      });

      it('should not apply low confidence check for unknown intent', async () => {
        const intent: IntentDetectionResult = {
          intent: 'unknown',
          confidence: 0.3,
        };

        const result = await dispatch(intent, mockDeps);

        // Unknown intent goes through even with low confidence
        expect(result.status).toBe('error');
        expect(result.action).toBe('error');
      });

      it('should include context in low confidence response', async () => {
        const intent: IntentDetectionResult = {
          intent: 'retrieve',
          confidence: 0.4,
        };

        const result = await dispatch(intent, mockDeps);

        expect(result._context).toEqual({
          projectId: 'project-123',
          sessionId: 'session-456',
          agentId: 'agent-789',
        });
      });
    });

    describe('unknown intent handling', () => {
      it('should return error status for unknown intent', async () => {
        const intent: IntentDetectionResult = {
          intent: 'unknown',
          confidence: 0,
        };

        const result = await dispatch(intent, mockDeps);

        expect(result.action).toBe('error');
        expect(result.status).toBe('error');
        expect(result.message).toContain('Could not understand');
      });

      it('should provide helpful suggestions in error message', async () => {
        const intent: IntentDetectionResult = {
          intent: 'unknown',
          confidence: 0,
        };

        const result = await dispatch(intent, mockDeps);

        expect(result.message).toContain('Remember that');
        expect(result.message).toContain('What do we know about');
        expect(result.message).toContain('List all guidelines');
      });
    });

    describe('error handling', () => {
      it('should catch and return errors from handlers', async () => {
        // Make the create throw an error
        (mockContext.repos.guidelines.create as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Database connection failed')
        );

        const intent: IntentDetectionResult = {
          intent: 'store',
          confidence: 0.9,
          content: 'Test content',
          entryType: 'guideline',
        };

        const result = await dispatch(intent, mockDeps);

        expect(result.action).toBe('error');
        expect(result.status).toBe('error');
        expect(result.message).toBe('Database connection failed');
      });

      it('should handle non-Error exceptions', async () => {
        (mockContext.repos.guidelines.create as ReturnType<typeof vi.fn>).mockRejectedValue(
          'String error'
        );

        const intent: IntentDetectionResult = {
          intent: 'store',
          confidence: 0.9,
          content: 'Test content',
          entryType: 'guideline',
        };

        const result = await dispatch(intent, mockDeps);

        expect(result.action).toBe('error');
        expect(result.status).toBe('error');
        expect(result.message).toBe('Unknown error occurred');
      });
    });
  });

  describe('store intent', () => {
    it('should store a guideline', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'Always use TypeScript strict mode',
        entryType: 'guideline',
        category: 'code_style',
        title: 'TypeScript Strict Mode',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry?.type).toBe('guideline');
      expect(result.message).toContain('TypeScript Strict Mode');

      expect(mockContext.repos.guidelines.create).toHaveBeenCalledWith({
        scopeType: 'project',
        scopeId: 'project-123',
        name: 'TypeScript Strict Mode',
        content: 'Always use TypeScript strict mode',
        category: 'code_style',
        createdBy: 'agent-789',
      });
    });

    it('should store a knowledge entry', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'We chose PostgreSQL for persistence',
        entryType: 'knowledge',
        category: 'decision',
        title: 'Database Choice',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry?.type).toBe('knowledge');

      expect(mockContext.repos.knowledge.create).toHaveBeenCalledWith({
        scopeType: 'project',
        scopeId: 'project-123',
        title: 'Database Choice',
        content: 'We chose PostgreSQL for persistence',
        category: 'decision',
        createdBy: 'agent-789',
      });
    });

    it('should store a tool entry', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'npm run build compiles TypeScript',
        entryType: 'tool',
        title: 'npm run build',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry?.type).toBe('tool');
      expect(result.entry?.category).toBe('cli');

      expect(mockContext.repos.tools.create).toHaveBeenCalledWith({
        scopeType: 'project',
        scopeId: 'project-123',
        name: 'npm run build',
        description: 'npm run build compiles TypeScript',
        category: 'cli',
        createdBy: 'agent-789',
      });
    });

    it('should default to knowledge when no entry type specified', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'Some information to store',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.entry?.type).toBe('knowledge');
      expect(mockContext.repos.knowledge.create).toHaveBeenCalled();
    });

    it('should return error when no content provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: undefined,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('store');
      expect(result.status).toBe('error');
      expect(result.message).toBe('No content provided to store');
    });

    it('should return error when no project context', async () => {
      const depsWithoutProject = { ...mockDeps, projectId: undefined };

      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'Test content',
      };

      const result = await dispatch(intent, depsWithoutProject);

      expect(result.action).toBe('store');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No project context');
    });

    it('should truncate title from content when not provided', async () => {
      const longContent = 'A'.repeat(100);
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: longContent,
        entryType: 'guideline',
      };

      await dispatch(intent, mockDeps);

      expect(mockContext.repos.guidelines.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: longContent.substring(0, 50),
        })
      );
    });

    it('should use default category for guideline when not provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'Test guideline',
        entryType: 'guideline',
      };

      await dispatch(intent, mockDeps);

      expect(mockContext.repos.guidelines.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'code_style',
        })
      );
    });

    it('should use fact category for knowledge when not provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.9,
        content: 'Test knowledge',
        entryType: 'knowledge',
      };

      await dispatch(intent, mockDeps);

      expect(mockContext.repos.knowledge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'fact',
        })
      );
    });
  });

  describe('retrieve intent', () => {
    beforeEach(() => {
      (executeQueryPipeline as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [
          { type: 'guideline', id: 'g1', guideline: { name: 'Guideline 1' }, score: 0.95 },
          { type: 'knowledge', id: 'k1', knowledge: { title: 'Knowledge 1' }, score: 0.85 },
          { type: 'tool', id: 't1', tool: { name: 'Tool 1' }, score: 0.75 },
        ],
      });
    });

    it('should retrieve matching entries', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'authentication',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('success');
      expect(result.results).toHaveLength(3);
      expect(result.message).toContain('3 result(s)');
    });

    it('should include highlights summary', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result._highlights).toBeDefined();
      expect(result._highlights).toContain('Found 3 memories');
      expect(result._highlights).toContain('guideline');
    });

    it('should call query pipeline with correct parameters', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'authentication',
      };

      await dispatch(intent, mockDeps);

      expect(executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'authentication',
          types: ['tools', 'guidelines', 'knowledge'],
          scope: { type: 'project', id: 'project-123', inherit: true },
          limit: 20,
          useFts5: true,
        }),
        mockContext.queryDeps
      );
    });

    it('should use global scope when no project', async () => {
      const depsWithoutProject = { ...mockDeps, projectId: undefined };

      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      await dispatch(intent, depsWithoutProject);

      expect(executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'global', inherit: true },
        }),
        expect.anything()
      );
    });

    it('should return not_found when no results', async () => {
      (executeQueryPipeline as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'nonexistent',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('not_found');
      expect(result.message).toContain('No results found');
      expect(result._highlights).toContain('No memories match');
    });

    it('should return error when no query provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: undefined,
        content: undefined,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('error');
      expect(result.message).toBe('No search query provided');
    });

    it('should use content as query if query not provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        content: 'fallback query',
      };

      await dispatch(intent, mockDeps);

      expect(executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'fallback query',
        }),
        expect.anything()
      );
    });

    it('should extract name/title from nested objects', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      // Check that names/titles were extracted from nested objects
      expect(result.results?.[0]?.name).toBe('Guideline 1');
      expect(result.results?.[1]?.title).toBe('Knowledge 1');
      expect(result.results?.[2]?.name).toBe('Tool 1');
    });

    it('should build type breakdown in highlights', async () => {
      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      // Should show type counts in highlights
      expect(result._highlights).toContain('1 guideline');
      expect(result._highlights).toContain('1 knowledge');
      expect(result._highlights).toContain('1 tool');
    });
  });

  describe('session_start intent', () => {
    it('should start a new session', async () => {
      const intent: IntentDetectionResult = {
        intent: 'session_start',
        confidence: 0.9,
        sessionName: 'Debug authentication',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('session_start');
      expect(result.status).toBe('success');
      expect(result.session?.id).toBe('session-123');
      expect(result.session?.status).toBe('active');
      expect(result.message).toContain('Debug authentication');

      expect(mockContext.repos.sessions.create).toHaveBeenCalledWith({
        projectId: 'project-123',
        name: 'Debug authentication',
        agentId: 'agent-789',
      });
    });

    it('should use default session name when not provided', async () => {
      const intent: IntentDetectionResult = {
        intent: 'session_start',
        confidence: 0.9,
      };

      await dispatch(intent, mockDeps);

      expect(mockContext.repos.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Work session',
        })
      );
    });

    it('should return error when no project context', async () => {
      const depsWithoutProject = { ...mockDeps, projectId: undefined };

      const intent: IntentDetectionResult = {
        intent: 'session_start',
        confidence: 0.9,
      };

      const result = await dispatch(intent, depsWithoutProject);

      expect(result.action).toBe('session_start');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No project context');
    });
  });

  describe('session_end intent', () => {
    it('should end an active session', async () => {
      const intent: IntentDetectionResult = {
        intent: 'session_end',
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('session_end');
      expect(result.status).toBe('success');
      expect(result.session?.status).toBe('completed');
      expect(result.message).toBe('Session ended successfully');

      expect(mockContext.repos.sessions.end).toHaveBeenCalledWith('session-456', 'completed');
    });

    it('should return error when no active session', async () => {
      const depsWithoutSession = { ...mockDeps, sessionId: undefined };

      const intent: IntentDetectionResult = {
        intent: 'session_end',
        confidence: 0.9,
      };

      const result = await dispatch(intent, depsWithoutSession);

      expect(result.action).toBe('session_end');
      expect(result.status).toBe('error');
      expect(result.message).toBe('No active session to end');
    });

    it('should return error when session end fails', async () => {
      (mockContext.repos.sessions.end as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const intent: IntentDetectionResult = {
        intent: 'session_end',
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('session_end');
      expect(result.status).toBe('error');
      expect(result.message).toBe('Failed to end session');
    });
  });

  describe('list intent', () => {
    it('should list guidelines by default', async () => {
      const intent: IntentDetectionResult = {
        intent: 'list',
        confidence: 0.9,
        entryType: 'guideline',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('list');
      expect(result.status).toBe('success');
      expect(result.results?.length).toBeGreaterThan(0);

      expect(mockContext.repos.guidelines.list).toHaveBeenCalledWith(
        { scopeType: 'project', scopeId: 'project-123' },
        { limit: 20 }
      );
    });

    it('should list knowledge entries', async () => {
      const intent: IntentDetectionResult = {
        intent: 'list',
        confidence: 0.9,
        entryType: 'knowledge',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('list');
      expect(mockContext.repos.knowledge.list).toHaveBeenCalled();
    });

    it('should list tools', async () => {
      const intent: IntentDetectionResult = {
        intent: 'list',
        confidence: 0.9,
        entryType: 'tool',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('list');
      expect(mockContext.repos.tools.list).toHaveBeenCalled();
    });

    it('should list all types when no entry type specified', async () => {
      const intent: IntentDetectionResult = {
        intent: 'list',
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('list');
      // When no entryType, defaults to guideline but also lists others
      expect(mockContext.repos.guidelines.list).toHaveBeenCalled();
      expect(mockContext.repos.knowledge.list).toHaveBeenCalled();
      expect(mockContext.repos.tools.list).toHaveBeenCalled();
    });

    it('should use global scope when no project', async () => {
      const depsWithoutProject = { ...mockDeps, projectId: undefined };

      const intent: IntentDetectionResult = {
        intent: 'list',
        confidence: 0.9,
      };

      await dispatch(intent, depsWithoutProject);

      expect(mockContext.repos.guidelines.list).toHaveBeenCalledWith(
        { scopeType: 'global', scopeId: undefined },
        expect.anything()
      );
    });
  });

  describe('forget intent', () => {
    it('should return guidance for forget action', async () => {
      const intent: IntentDetectionResult = {
        intent: 'forget',
        confidence: 0.9,
        target: 'old rule',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('forget');
      expect(result.status).toBe('success');
      expect(result.message).toContain('To forget "old rule"');
      expect(result.message).toContain('memory_* tools');
      expect(result.message).toContain('deactivate');
    });

    it('should use query as fallback target', async () => {
      const intent: IntentDetectionResult = {
        intent: 'forget',
        confidence: 0.9,
        query: 'authentication guideline',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.message).toContain('authentication guideline');
    });

    it('should return error when no target specified', async () => {
      const intent: IntentDetectionResult = {
        intent: 'forget',
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('forget');
      expect(result.status).toBe('error');
      expect(result.message).toBe('Specify what to forget');
    });

    it('should include context in forget response', async () => {
      const intent: IntentDetectionResult = {
        intent: 'forget',
        confidence: 0.9,
        target: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result._context).toEqual({
        projectId: 'project-123',
        sessionId: 'session-456',
        agentId: 'agent-789',
      });
    });
  });

  describe('update intent', () => {
    it('should return guidance for update action', async () => {
      const intent: IntentDetectionResult = {
        intent: 'update',
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('update');
      expect(result.status).toBe('error');
      expect(result.message).toContain('To update an entry');
      expect(result.message).toContain('search for it');
      expect(result.message).toContain('memory_* tool');
    });
  });

  describe('edge cases', () => {
    it('should handle default case for unrecognized intent', async () => {
      const intent: IntentDetectionResult = {
        intent: 'unrecognized_intent' as any,
        confidence: 0.9,
      };

      const result = await dispatch(intent, mockDeps);

      expect(result.action).toBe('error');
      expect(result.status).toBe('error');
    });

    it('should handle confidence exactly at 0.5 threshold', async () => {
      const intent: IntentDetectionResult = {
        intent: 'store',
        confidence: 0.5,
        content: 'Test content',
      };

      const result = await dispatch(intent, mockDeps);

      // At exactly 0.5, it should NOT be low confidence (< 0.5 check)
      expect(result.status).not.toBe('low_confidence');
    });

    it('should handle empty results array in type breakdown', async () => {
      (executeQueryPipeline as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result._highlights).toBeDefined();
      expect(result.results).toEqual([]);
    });

    it('should handle many results with ellipsis in highlights', async () => {
      (executeQueryPipeline as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [
          { type: 'guideline', id: 'g1', guideline: { name: 'G1' }, score: 0.9 },
          { type: 'guideline', id: 'g2', guideline: { name: 'G2' }, score: 0.8 },
          { type: 'guideline', id: 'g3', guideline: { name: 'G3' }, score: 0.7 },
          { type: 'guideline', id: 'g4', guideline: { name: 'G4' }, score: 0.6 },
          { type: 'guideline', id: 'g5', guideline: { name: 'G5' }, score: 0.5 },
          { type: 'guideline', id: 'g6', guideline: { name: 'G6' }, score: 0.4 },
        ],
      });

      const intent: IntentDetectionResult = {
        intent: 'retrieve',
        confidence: 0.9,
        query: 'test',
      };

      const result = await dispatch(intent, mockDeps);

      expect(result._highlights).toContain('...');
    });
  });
});
