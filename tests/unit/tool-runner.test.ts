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
      config: {} as any,
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
  });
});
