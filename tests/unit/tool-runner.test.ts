import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTool } from '../../src/mcp/tool-runner.js';
import type { AppContext } from '../../src/core/context.js';

// Mock the dependencies
vi.mock('../../src/mcp/descriptors/index.js', () => ({
  GENERATED_HANDLERS: {
    memory_health: vi.fn().mockResolvedValue({ status: 'ok' }),
    memory_project: vi.fn().mockResolvedValue({ projects: [] }),
    failing_tool: vi.fn().mockRejectedValue(new Error('Tool failed')),
    format_error_tool: vi.fn().mockResolvedValue({ value: 'test' }),
  },
}));

vi.mock('../../src/utils/compact-formatter.js', () => ({
  formatOutput: vi.fn((result) => JSON.stringify(result, null, 2)),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/utils/error-mapper.js', () => ({
  mapError: vi.fn((error) => ({
    message: error instanceof Error ? error.message : String(error),
    code: 'E5000',
    details: { originalError: String(error) },
  })),
}));

vi.mock('../../src/mcp/errors.js', () => ({
  createInvalidActionError: vi.fn((scope, action, available) => ({
    code: 'E1002',
    message: `Unknown action '${action}' for ${scope}`,
    details: { available },
  })),
  formatError: vi.fn((error) => error),
}));

describe('tool-runner', () => {
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      security: {
        validateRequest: vi.fn().mockResolvedValue({ authorized: true }),
      },
      db: {} as any,
      cache: {} as any,
      locks: {} as any,
      events: {} as any,
      rateLimiter: {} as any,
      config: {
        autoContext: {
          enabled: false, // Disabled for unit tests
          defaultAgentId: 'test-agent',
          cacheTTLMs: 5000,
        },
      } as any,
      services: {}, // No contextDetection service in unit tests
      shutdown: vi.fn(),
    } as unknown as AppContext;
  });

  describe('runTool', () => {
    describe('security checks', () => {
      it('should reject unauthorized requests', async () => {
        vi.mocked(mockContext.security.validateRequest).mockResolvedValue({
          authorized: false,
          error: 'Not authorized',
          statusCode: 401,
        });

        const result = await runTool(mockContext, 'memory_health', {});

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('UNAUTHORIZED');
        expect(result.content[0]!.text).toContain('Not authorized');
      });

      it('should handle rate limiting (429)', async () => {
        vi.mocked(mockContext.security.validateRequest).mockResolvedValue({
          authorized: false,
          error: 'Rate limit exceeded',
          statusCode: 429,
          retryAfterMs: 5000,
        });

        const result = await runTool(mockContext, 'memory_health', {});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(parsed.retryAfterMs).toBe(5000);
      });

      it('should handle service unavailable (503)', async () => {
        vi.mocked(mockContext.security.validateRequest).mockResolvedValue({
          authorized: false,
          error: 'Service unavailable',
          statusCode: 503,
        });

        const result = await runTool(mockContext, 'memory_health', {});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.code).toBe('SERVICE_UNAVAILABLE');
      });
    });

    describe('handler execution', () => {
      it('should call handler with context and args', async () => {
        const args = { action: 'list' };
        const result = await runTool(mockContext, 'memory_project', args);

        expect(result.isError).toBeUndefined();
        expect(result.content[0]!.type).toBe('text');
      });

      it('should handle undefined args', async () => {
        const result = await runTool(mockContext, 'memory_health', undefined);

        expect(result.isError).toBeUndefined();
      });

      it('should return error for unknown tool', async () => {
        const result = await runTool(mockContext, 'nonexistent_tool', {});

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('Unknown action');
      });

      it('should handle tool execution errors', async () => {
        const result = await runTool(mockContext, 'failing_tool', {});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.error).toBe('Tool failed');
        expect(parsed.code).toBe('E5000');
      });
    });

    describe('output formatting', () => {
      it('should format successful results', async () => {
        const result = await runTool(mockContext, 'memory_health', {});

        expect(result.isError).toBeUndefined();
        expect(result.content[0]!.text).toContain('status');
      });

      it('should handle format errors gracefully', async () => {
        const { formatOutput } = await import('../../src/utils/compact-formatter.js');
        vi.mocked(formatOutput).mockImplementationOnce(() => {
          throw new Error('Format failed');
        });

        const result = await runTool(mockContext, 'format_error_tool', {});

        // Should fall back to safe JSON serialization
        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.error).toBe('Failed to format result');
      });
    });

    describe('error handling', () => {
      it('should map errors with error mapper', async () => {
        const result = await runTool(mockContext, 'failing_tool', {});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.code).toBeDefined();
        expect(parsed.context).toBeDefined();
      });

      it('should handle non-Error thrown values', async () => {
        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        vi.mocked(GENERATED_HANDLERS.failing_tool).mockRejectedValueOnce('string error');

        const result = await runTool(mockContext, 'failing_tool', {});

        expect(result.isError).toBe(true);
      });
    });

    describe('context enrichment', () => {
      it('should enrich params when auto-context is enabled', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list', projectId: 'proj-123' },
          detected: {
            project: { id: 'proj-123', name: 'Test Project' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        expect(result.isError).toBeUndefined();
        expect(mockEnrichParams).toHaveBeenCalled();
      });

      it('should add _context badge to response when context is detected', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test Project' },
            session: { id: 'sess-123', status: 'active' },
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        expect(result.isError).toBeUndefined();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context).toBeDefined();
        expect(parsed._context._badge).toContain('Project:');
      });

      it('should record session activity when session is detected', async () => {
        const mockRecordActivity = vi.fn();
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: { id: 'sess-456', status: 'active' },
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;
        mockContext.services.sessionTimeout = {
          recordActivity: mockRecordActivity,
        } as any;

        await runTool(mockContext, 'memory_project', { action: 'list' });

        expect(mockRecordActivity).toHaveBeenCalledWith('sess-456');
      });
    });

    describe('auto-session creation', () => {
      beforeEach(() => {
        mockContext.config.autoContext = {
          enabled: true,
          autoSession: true,
          autoSessionName: 'Auto Session',
          defaultAgentId: 'test-agent',
          cacheTTLMs: 5000,
        } as any;
      });

      it('should not create session if auto-session is disabled', async () => {
        mockContext.config.autoContext.autoSession = false;
        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'add', name: 'test' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        await runTool(mockContext, 'memory_guideline', { action: 'add', name: 'test' });

        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should not create session for memory_session tool', async () => {
        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'start' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        // memory_session is not in GENERATED_HANDLERS mock, so we need to add it
        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_session = vi.fn().mockResolvedValue({ id: 'sess-1' });

        await runTool(mockContext, 'memory_session', { action: 'start' });

        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should not create session for read operations', async () => {
        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        await runTool(mockContext, 'memory_project', { action: 'list' });

        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should not create session when session already exists', async () => {
        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'add', name: 'test' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: { id: 'existing-session', status: 'active' },
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        // memory_guideline is not in mock, add it
        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_guideline = vi.fn().mockResolvedValue({ id: 'g-1' });

        await runTool(mockContext, 'memory_guideline', { action: 'add', name: 'test' });

        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should not create session when no project is detected', async () => {
        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'add', name: 'test' },
          detected: {
            project: null,
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_guideline = vi.fn().mockResolvedValue({ id: 'g-1' });

        await runTool(mockContext, 'memory_guideline', { action: 'add', name: 'test' });

        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should create session for write actions', async () => {
        const mockCreate = vi.fn().mockResolvedValue({ id: 'new-session' });
        const mockClearCache = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        // First call: no session, second call: with session (after auto-creation)
        const mockEnrichParams = vi
          .fn()
          .mockResolvedValueOnce({
            enriched: { action: 'add', name: 'test-guideline' },
            detected: {
              project: { id: 'proj-123', name: 'Test', rootPath: '/test' },
              session: null,
              agentId: { value: 'test-agent', source: 'env' },
            },
          })
          .mockResolvedValue({
            enriched: { action: 'add', name: 'test-guideline', sessionId: 'new-session' },
            detected: {
              project: { id: 'proj-123', name: 'Test', rootPath: '/test' },
              session: { id: 'new-session', status: 'active' },
              agentId: { value: 'test-agent', source: 'env' },
            },
          });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: mockClearCache,
        } as any;

        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_guideline = vi.fn().mockResolvedValue({ id: 'g-1' });

        await runTool(mockContext, 'memory_guideline', { action: 'add', name: 'test-guideline' });

        // Verify session was created with correct params
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: 'proj-123',
            purpose: expect.stringContaining('memory_guideline'),
          })
        );
      });

      it('should create session for simple write tools (memory_remember)', async () => {
        const mockCreate = vi.fn().mockResolvedValue({ id: 'new-session' });
        const mockClearCache = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        let callCount = 0;
        const mockEnrichParams = vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            enriched: { text: 'Remember this' },
            detected: {
              project: { id: 'proj-123', name: 'Test', rootPath: '/test' },
              session: callCount === 1 ? null : { id: 'new-session', status: 'active' },
              agentId: { value: 'test-agent', source: 'env' },
            },
          });
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: mockClearCache,
        } as any;

        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_remember = vi.fn().mockResolvedValue({ id: 'k-1' });

        await runTool(mockContext, 'memory_remember', { text: 'Remember this' });

        expect(mockCreate).toHaveBeenCalled();
      });

      it('should handle session creation failure gracefully', async () => {
        const mockCreate = vi.fn().mockRejectedValue(new Error('DB error'));
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'add', name: 'test' },
          detected: {
            project: { id: 'proj-123', name: 'Test', rootPath: '/test' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const { GENERATED_HANDLERS } = await import('../../src/mcp/descriptors/index.js');
        (GENERATED_HANDLERS as any).memory_guideline = vi.fn().mockResolvedValue({ id: 'g-1' });

        // Should not throw, should continue with tool execution
        const result = await runTool(mockContext, 'memory_guideline', {
          action: 'add',
          name: 'test',
        });

        expect(result.isError).toBeUndefined();
      });
    });

    describe('context badge formatting', () => {
      it('should format badge with project only', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test Project' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context._badge).toBe('[Project: Test Project]');
      });

      it('should format badge with active session', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: { id: 'sess-123', status: 'active' },
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context._badge).toContain('● active');
      });

      it('should format badge with paused session', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: { id: 'proj-123', name: 'Test' },
            session: { id: 'sess-123', status: 'paused' },
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context._badge).toContain('○ paused');
      });

      it('should truncate long project names', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: {
              id: 'proj-123',
              name: 'This is a very long project name that exceeds 20 characters',
            },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context._badge).toContain('...');
        expect(parsed._context._badge.length).toBeLessThan(50);
      });

      it('should show not configured when no context', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 'list' },
          detected: {
            project: null,
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const result = await runTool(mockContext, 'memory_project', { action: 'list' });

        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed._context._badge).toBe('[Memory: not configured]');
      });
    });

    describe('action validation', () => {
      it('should handle non-string action values', async () => {
        const mockEnrichParams = vi.fn().mockResolvedValue({
          enriched: { action: 123 }, // Non-string action
          detected: {
            project: { id: 'proj-123', name: 'Test', rootPath: '/test' },
            session: null,
            agentId: { value: 'test-agent', source: 'env' },
          },
        });

        mockContext.config.autoContext.enabled = true;
        mockContext.config.autoContext.autoSession = true;
        mockContext.services.contextDetection = {
          enrichParams: mockEnrichParams,
          clearCache: vi.fn(),
        } as any;

        const mockCreate = vi.fn();
        mockContext.repos = {
          sessions: { create: mockCreate },
        } as any;

        await runTool(mockContext, 'memory_project', { action: 123 });

        // Should not create session because action is not a string
        expect(mockCreate).not.toHaveBeenCalled();
      });
    });
  });
});
