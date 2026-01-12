import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock modules before imports
vi.mock('../../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock('../../../src/services/verification.service.js', () => ({
  verifyAction: vi.fn(() => ({
    allowed: true,
    blocked: false,
    violations: [],
    warnings: [],
    requiresConfirmation: false,
  })),
}));

const mockGetContext = vi.fn();
vi.mock('../../../src/services/memory-injection.service.js', () => ({
  getMemoryInjectionService: vi.fn(() => ({
    getContext: mockGetContext,
  })),
}));

import { runPreToolUseCommand } from '../../../src/commands/hook/pretooluse-command.js';
import { getMemoryInjectionService } from '../../../src/services/memory-injection.service.js';

describe('PreToolUse context injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: '',
      entries: [],
      detectedIntent: 'explore',
      processingTimeMs: 0,
      message: 'No context',
    });
  });

  it('should inject context when enabled and context is available', async () => {
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: '# Guidelines\n- Use TypeScript strict mode',
      entries: [
        { type: 'guideline', id: 'g1', title: 'TypeScript Strict', content: '...', relevanceScore: 0.9 },
      ],
      detectedIntent: 'code',
      processingTimeMs: 15,
      message: 'Injected 1 entry',
    });

    const result = await runPreToolUseCommand({
      projectId: 'proj-123',
      input: {
        session_id: 'sess-123',
        tool_name: 'Edit',
        tool_input: { file_path: '/src/app.ts' },
      },
      config: {
        injectContext: true,
        contextToStdout: true,
        contextToStderr: true,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('# Guidelines\n- Use TypeScript strict mode');
    expect(result.stderr).toContain('[agent-memory] Injected: 1 guideline');
  });

  it('should not inject context when disabled', async () => {
    const result = await runPreToolUseCommand({
      input: {
        tool_name: 'Edit',
        tool_input: { file_path: '/src/app.ts' },
      },
      config: {
        injectContext: false,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toEqual([]);
    expect(mockGetContext).not.toHaveBeenCalled();
  });

  it('should output to stdout only when contextToStderr is false', async () => {
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: 'Some context',
      entries: [{ type: 'knowledge', id: 'k1', title: 'Info', content: '...', relevanceScore: 0.8 }],
      detectedIntent: 'explore',
      processingTimeMs: 10,
      message: 'OK',
    });

    const result = await runPreToolUseCommand({
      input: {
        tool_name: 'Write',
        tool_input: { file_path: '/src/new.ts' },
      },
      config: {
        injectContext: true,
        contextToStdout: true,
        contextToStderr: false,
      },
    });

    expect(result.stdout).toContain('Some context');
    expect(result.stderr).toEqual([]);
  });

  it('should output to stderr only when contextToStdout is false', async () => {
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: 'Hidden context',
      entries: [{ type: 'tool', id: 't1', title: 'CLI', content: '...', relevanceScore: 0.7 }],
      detectedIntent: 'explore',
      processingTimeMs: 5,
      message: 'OK',
    });

    const result = await runPreToolUseCommand({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      },
      config: {
        injectContext: true,
        contextToStdout: false,
        contextToStderr: true,
      },
    });

    expect(result.stdout).toEqual([]);
    expect(result.stderr).toContain('[agent-memory] Injected: 1 tool');
  });

  it('should handle multiple entry types in summary', async () => {
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: 'Mixed context',
      entries: [
        { type: 'guideline', id: 'g1', title: 'Rule', content: '...', relevanceScore: 0.9 },
        { type: 'guideline', id: 'g2', title: 'Rule2', content: '...', relevanceScore: 0.8 },
        { type: 'knowledge', id: 'k1', title: 'Info', content: '...', relevanceScore: 0.7 },
      ],
      detectedIntent: 'code',
      processingTimeMs: 20,
      message: 'OK',
    });

    const result = await runPreToolUseCommand({
      input: {
        tool_name: 'Edit',
        tool_input: { file_path: '/src/app.ts' },
      },
      config: {
        injectContext: true,
        contextToStderr: true,
      },
    });

    expect(result.stderr[0]).toContain('2 guidelines');
    expect(result.stderr[0]).toContain('1 knowledge');
  });

  it('should continue when injection fails (non-blocking)', async () => {
    mockGetContext.mockRejectedValue(new Error('Database error'));

    const result = await runPreToolUseCommand({
      input: {
        tool_name: 'Write',
        tool_input: { file_path: '/src/new.ts' },
      },
      config: {
        injectContext: true,
      },
    });

    // Should still return exit code 0 (injection failure is non-blocking)
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEqual([]);
    expect(result.stderr).toEqual([]);
  });

  it('should map tool names correctly to injectable types', async () => {
    mockGetContext.mockResolvedValue({
      success: true,
      injectedContext: '',
      entries: [],
      detectedIntent: 'explore',
      processingTimeMs: 0,
      message: 'OK',
    });

    // Test Edit
    await runPreToolUseCommand({
      input: { tool_name: 'Edit', tool_input: {} },
      config: { injectContext: true },
    });
    expect(mockGetContext).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'Edit' }));

    // Test Bash
    vi.clearAllMocks();
    await runPreToolUseCommand({
      input: { tool_name: 'Bash', tool_input: {} },
      config: { injectContext: true },
    });
    expect(mockGetContext).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'Bash' }));

    // Test unknown
    vi.clearAllMocks();
    await runPreToolUseCommand({
      input: { tool_name: 'CustomTool', tool_input: {} },
      config: { injectContext: true },
    });
    expect(mockGetContext).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'other' }));
  });
});
