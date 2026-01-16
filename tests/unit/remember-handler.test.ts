/**
 * Unit tests for remember handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CommandContext } from '../../src/commands/hook/command-registry.js';

// Mock the dependencies before importing the handler
vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn(),
}));

vi.mock('../../src/core/factory/repositories.js', () => ({
  createRepositories: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/services/unified-memory/index.js', () => ({
  createUnifiedMemoryService: vi.fn(),
}));

import { handleRemember } from '../../src/commands/hook/handlers/remember.handler.js';
import { createRepositories } from '../../src/core/factory/repositories.js';
import { createUnifiedMemoryService } from '../../src/services/unified-memory/index.js';

describe('handleRemember', () => {
  let mockGuidelines: { create: ReturnType<typeof vi.fn> };
  let mockKnowledge: { create: ReturnType<typeof vi.fn> };
  let mockTools: { create: ReturnType<typeof vi.fn> };
  let mockAnalyze: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGuidelines = {
      create: vi.fn().mockResolvedValue({ id: 'guideline-123' }),
    };

    mockKnowledge = {
      create: vi.fn().mockResolvedValue({ id: 'knowledge-123' }),
    };

    mockTools = {
      create: vi.fn().mockResolvedValue({ id: 'tool-123' }),
    };

    vi.mocked(createRepositories).mockReturnValue({
      guidelines: mockGuidelines,
      knowledge: mockKnowledge,
      tools: mockTools,
    } as any);

    mockAnalyze = vi.fn().mockReturnValue({
      entryType: 'knowledge',
      category: 'fact',
      title: 'Test title',
    });

    vi.mocked(createUnifiedMemoryService).mockReturnValue({
      analyze: mockAnalyze,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createContext = (overrides: Partial<CommandContext> = {}): CommandContext =>
    ({
      sessionId: 'session-123',
      projectId: 'project-123',
      args: ['We use TypeScript strict mode'],
      ...overrides,
    }) as CommandContext;

  it('should return error when text is empty', async () => {
    const ctx = createContext({ args: [] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(2); // blocked() returns exit code 2
    expect(result.stderr.join('')).toContain('Usage: !am remember');
  });

  it('should return error when text is whitespace only', async () => {
    const ctx = createContext({ args: ['   ', '  '] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join('')).toContain('Usage: !am remember');
  });

  it('should return error when projectId is missing', async () => {
    const ctx = createContext({ projectId: undefined });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join('')).toContain('No project context');
  });

  it('should store as knowledge entry by default', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'knowledge',
      category: 'fact',
      title: 'Test title',
    });

    const ctx = createContext({ args: ['We use TypeScript strict mode'] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockKnowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: 'project',
        scopeId: 'project-123',
        title: 'Test title',
        content: 'We use TypeScript strict mode',
        category: 'fact',
        createdBy: 'claude-code',
      })
    );
    expect(result.stderr.join('')).toContain('knowledge');
  });

  it('should store as guideline when detected', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'guideline',
      category: 'code_style',
      title: 'TypeScript strict mode',
    });

    const ctx = createContext({ args: ['Always', 'use', 'TypeScript', 'strict', 'mode'] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockGuidelines.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: 'project',
        scopeId: 'project-123',
        name: 'TypeScript strict mode',
        content: 'Always use TypeScript strict mode',
        category: 'code_style',
        createdBy: 'claude-code',
      })
    );
    expect(result.stderr.join('')).toContain('guideline');
  });

  it('should store as tool when detected', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'tool',
      category: 'cli',
      title: 'npm test command',
    });

    const ctx = createContext({ args: ['npm test runs all tests'] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockTools.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: 'project',
        scopeId: 'project-123',
        name: 'npm test command',
        description: 'npm test runs all tests',
        category: 'cli',
        createdBy: 'claude-code',
      })
    );
    expect(result.stderr.join('')).toContain('tool');
  });

  it('should use content substring as title when not detected', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'knowledge',
      category: null,
      title: null,
    });

    const longText =
      'This is a very long piece of text that exceeds fifty characters and should be truncated';
    const ctx = createContext({ args: [longText] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockKnowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: longText.substring(0, 50),
      })
    );
  });

  it('should use default category for knowledge when not detected', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'knowledge',
      category: null,
      title: 'Test',
    });

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockKnowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'fact',
      })
    );
  });

  it('should use default category for guideline when not detected', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'guideline',
      category: null,
      title: 'Test',
    });

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockGuidelines.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'code_style',
      })
    );
  });

  it('should handle database errors gracefully', async () => {
    mockKnowledge.create.mockRejectedValue(new Error('Database error'));

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(2); // blocked() returns exit code 2
    expect(result.stderr.join('')).toContain('Failed to store');
    expect(result.stderr.join('')).toContain('Database error');
  });

  it('should handle non-Error exceptions', async () => {
    mockKnowledge.create.mockRejectedValue('String error');

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.join('')).toContain('Failed to store');
    expect(result.stderr.join('')).toContain('Unknown error');
  });

  it('should truncate long titles in output message', async () => {
    mockAnalyze.mockReturnValue({
      entryType: 'knowledge',
      category: 'fact',
      title: 'This is a very long title that exceeds forty characters limit',
    });

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.join('')).toContain('...');
  });

  it('should include entry ID in output', async () => {
    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.join('')).toContain('knowledg'); // First 8 chars of 'knowledge-123'
  });

  it('should join multiple args with spaces', async () => {
    const ctx = createContext({ args: ['First', 'Second', 'Third'] });

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockKnowledge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'First Second Third',
      })
    );
  });

  it('should fallback to knowledge when entryType is null', async () => {
    mockAnalyze.mockReturnValue({
      entryType: null,
      category: null,
      title: null,
    });

    const ctx = createContext();

    const result = await handleRemember(ctx);

    expect(result.exitCode).toBe(0);
    expect(mockKnowledge.create).toHaveBeenCalled();
  });
});
