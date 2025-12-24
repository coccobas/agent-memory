/**
 * Unit tests for hook helper modules
 * Tests: review.ts, session.ts, state-file.ts, session-summary.ts, shared.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// state-file.ts tests
// ============================================================================

describe('state-file', () => {
  const TEST_DIR = './data/test-state-file';
  const TEST_STATE_PATH = join(TEST_DIR, '.claude', 'hooks', '.agent-memory-state.json');

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('loadState', () => {
    it('should return empty object when file does not exist', async () => {
      const { loadState } = await import('../../src/commands/hook/state-file.js');
      const state = loadState(TEST_STATE_PATH);
      expect(state).toEqual({});
    });

    it('should load state from existing file', async () => {
      const { loadState } = await import('../../src/commands/hook/state-file.js');
      mkdirSync(join(TEST_DIR, '.claude', 'hooks'), { recursive: true });
      writeFileSync(TEST_STATE_PATH, JSON.stringify({ key: 'value' }));

      const state = loadState(TEST_STATE_PATH);
      expect(state).toEqual({ key: 'value' });
    });

    it('should return empty object on JSON parse error', async () => {
      const { loadState } = await import('../../src/commands/hook/state-file.js');
      mkdirSync(join(TEST_DIR, '.claude', 'hooks'), { recursive: true });
      writeFileSync(TEST_STATE_PATH, 'invalid json');

      const state = loadState(TEST_STATE_PATH);
      expect(state).toEqual({});
    });
  });

  describe('saveState', () => {
    it('should create directory and save state', async () => {
      const { saveState, loadState } = await import('../../src/commands/hook/state-file.js');

      saveState(TEST_STATE_PATH, { newKey: 'newValue' });

      const loaded = loadState(TEST_STATE_PATH);
      expect(loaded).toEqual({ newKey: 'newValue' });
    });

    it('should merge with existing state', async () => {
      const { saveState, loadState } = await import('../../src/commands/hook/state-file.js');
      mkdirSync(join(TEST_DIR, '.claude', 'hooks'), { recursive: true });
      writeFileSync(TEST_STATE_PATH, JSON.stringify({ existing: 'value' }));

      saveState(TEST_STATE_PATH, { newKey: 'newValue' });

      const loaded = loadState(TEST_STATE_PATH);
      expect(loaded).toEqual({ existing: 'value', newKey: 'newValue' });
    });
  });

  describe('review state functions', () => {
    it('should set and check review suspended state', async () => {
      const { setReviewSuspended, isReviewSuspended, getAgentMemoryStatePath } =
        await import('../../src/commands/hook/state-file.js');

      // Mock process.cwd to return test dir
      vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);

      expect(isReviewSuspended('sess-123')).toBe(false);

      setReviewSuspended('sess-123', true);
      expect(isReviewSuspended('sess-123')).toBe(true);

      setReviewSuspended('sess-123', false);
      expect(isReviewSuspended('sess-123')).toBe(false);
    });

    it('should set and check warned review state', async () => {
      const { setWarnedReview, hasWarnedReview } =
        await import('../../src/commands/hook/state-file.js');

      vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);

      expect(hasWarnedReview('sess-456')).toBe(false);

      setWarnedReview('sess-456');
      expect(hasWarnedReview('sess-456')).toBe(true);
    });
  });
});

// ============================================================================
// shared.ts tests
// ============================================================================

describe('shared', () => {
  describe('stringifyUnknown', () => {
    it('should return string values as-is', async () => {
      const { stringifyUnknown } = await import('../../src/commands/hook/shared.js');
      expect(stringifyUnknown('hello')).toBe('hello');
    });

    it('should stringify objects', async () => {
      const { stringifyUnknown } = await import('../../src/commands/hook/shared.js');
      expect(stringifyUnknown({ key: 'value' })).toBe('{"key":"value"}');
    });

    it('should truncate long strings', async () => {
      const { stringifyUnknown } = await import('../../src/commands/hook/shared.js');
      const longString = 'a'.repeat(100);
      const result = stringifyUnknown(longString, 50);
      expect(result.length).toBe(50);
    });

    it('should handle circular references gracefully', async () => {
      const { stringifyUnknown } = await import('../../src/commands/hook/shared.js');
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      // Should not throw, returns String(value)
      const result = stringifyUnknown(circular);
      expect(result).toContain('[object Object]');
    });
  });

  describe('getPromptFromHookInput', () => {
    it('should return prompt field if present', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({ prompt: 'Hello' })).toBe('Hello');
    });

    it('should return user_prompt field if prompt is missing', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({ user_prompt: 'Hello' })).toBe('Hello');
    });

    it('should return text field as fallback', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({ text: 'Hello' })).toBe('Hello');
    });

    it('should return message field as fallback', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({ message: 'Hello' })).toBe('Hello');
    });

    it('should return undefined when no prompt fields present', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({})).toBeUndefined();
    });

    it('should skip empty strings', async () => {
      const { getPromptFromHookInput } = await import('../../src/commands/hook/shared.js');
      expect(getPromptFromHookInput({ prompt: '  ', text: 'valid' })).toBe('valid');
    });
  });

  describe('extractProposedActionFromTool', () => {
    it('should classify Write tool as file_write', async () => {
      const { extractProposedActionFromTool } = await import('../../src/commands/hook/shared.js');
      const result = extractProposedActionFromTool('Write', { file_path: '/path/to/file.ts' });

      expect(result.actionType).toBe('file_write');
      expect(result.filePath).toBe('/path/to/file.ts');
    });

    it('should classify Edit tool as file_write', async () => {
      const { extractProposedActionFromTool } = await import('../../src/commands/hook/shared.js');
      const result = extractProposedActionFromTool('Edit', { filePath: '/path/to/file.ts' });

      expect(result.actionType).toBe('file_write');
      expect(result.filePath).toBe('/path/to/file.ts');
    });

    it('should classify Bash tool as command', async () => {
      const { extractProposedActionFromTool } = await import('../../src/commands/hook/shared.js');
      const result = extractProposedActionFromTool('Bash', { command: 'npm install' });

      expect(result.actionType).toBe('command');
    });

    it('should classify unknown tools as other', async () => {
      const { extractProposedActionFromTool } = await import('../../src/commands/hook/shared.js');
      const result = extractProposedActionFromTool('UnknownTool', { data: 'test' });

      expect(result.actionType).toBe('other');
    });
  });

  describe('extractMessageFromTranscriptEntry', () => {
    it('should extract user message', async () => {
      const { extractMessageFromTranscriptEntry } =
        await import('../../src/commands/hook/shared.js');
      const result = extractMessageFromTranscriptEntry({
        role: 'user',
        content: 'Hello there',
      });

      expect(result).toEqual({ role: 'user', content: 'Hello there' });
    });

    it('should extract assistant message', async () => {
      const { extractMessageFromTranscriptEntry } =
        await import('../../src/commands/hook/shared.js');
      const result = extractMessageFromTranscriptEntry({
        role: 'assistant',
        content: 'Hi!',
      });

      expect(result).toEqual({ role: 'agent', content: 'Hi!' });
    });

    it('should handle content array with text objects', async () => {
      const { extractMessageFromTranscriptEntry } =
        await import('../../src/commands/hook/shared.js');
      const result = extractMessageFromTranscriptEntry({
        role: 'user',
        content: [{ text: 'Part 1' }, { text: 'Part 2' }],
      });

      expect(result?.content).toBe('Part 1\nPart 2');
    });

    it('should return null for invalid entries', async () => {
      const { extractMessageFromTranscriptEntry } =
        await import('../../src/commands/hook/shared.js');

      expect(extractMessageFromTranscriptEntry(null)).toBeNull();
      expect(extractMessageFromTranscriptEntry({})).toBeNull();
      expect(extractMessageFromTranscriptEntry({ role: 'user' })).toBeNull();
    });
  });
});

// ============================================================================
// review.ts tests (with mocked repositories)
// ============================================================================

describe('review', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findCandidateByShortId', () => {
    it('should find candidate by exact shortId', async () => {
      const { findCandidateByShortId } = await import('../../src/commands/hook/review.js');
      const candidates = [
        {
          id: 'abcdef123456',
          shortId: 'abcdef',
          type: 'guideline' as const,
          name: 'test',
          content: 'content',
        },
      ];

      const result = findCandidateByShortId(candidates, 'abcdef');
      expect(result?.id).toBe('abcdef123456');
    });

    it('should find candidate by full id', async () => {
      const { findCandidateByShortId } = await import('../../src/commands/hook/review.js');
      const candidates = [
        {
          id: 'abcdef123456',
          shortId: 'abcdef',
          type: 'guideline' as const,
          name: 'test',
          content: 'content',
        },
      ];

      const result = findCandidateByShortId(candidates, 'abcdef123456');
      expect(result?.id).toBe('abcdef123456');
    });

    it('should find candidate by id prefix', async () => {
      const { findCandidateByShortId } = await import('../../src/commands/hook/review.js');
      const candidates = [
        {
          id: 'abcdef123456',
          shortId: 'abcdef',
          type: 'guideline' as const,
          name: 'test',
          content: 'content',
        },
      ];

      const result = findCandidateByShortId(candidates, 'abcdef1234');
      expect(result?.id).toBe('abcdef123456');
    });

    it('should return undefined when not found', async () => {
      const { findCandidateByShortId } = await import('../../src/commands/hook/review.js');
      const candidates = [
        {
          id: 'abcdef123456',
          shortId: 'abcdef',
          type: 'guideline' as const,
          name: 'test',
          content: 'content',
        },
      ];

      const result = findCandidateByShortId(candidates, 'xyz');
      expect(result).toBeUndefined();
    });
  });

  describe('formatCandidateList', () => {
    it('should format empty list', async () => {
      const { formatCandidateList } = await import('../../src/commands/hook/review.js');
      const lines = formatCandidateList([]);

      expect(lines.join('')).toContain('No candidates to review');
    });

    it('should format candidates with truncated content', async () => {
      const { formatCandidateList } = await import('../../src/commands/hook/review.js');
      const candidates = [
        {
          id: 'abc123',
          shortId: 'abc123',
          type: 'guideline' as const,
          name: 'test-rule',
          content: 'A'.repeat(100),
        },
      ];

      const lines = formatCandidateList(candidates);
      expect(lines.join('\n')).toContain('Review Candidates (1)');
      expect(lines.join('\n')).toContain('[guideline]');
      expect(lines.join('\n')).toContain('test-rule');
      expect(lines.join('\n')).toContain('…'); // truncation indicator
    });
  });

  describe('formatCandidateDetail', () => {
    it('should format candidate detail with full content', async () => {
      const { formatCandidateDetail } = await import('../../src/commands/hook/review.js');
      const candidate = {
        id: 'abc123-full-id',
        shortId: 'abc123',
        type: 'knowledge' as const,
        name: 'API Architecture',
        content: 'This is the content\nWith multiple lines',
      };

      const lines = formatCandidateDetail(candidate);
      expect(lines.join('\n')).toContain('KNOWLEDGE: API Architecture');
      expect(lines.join('\n')).toContain('ID: abc123-full-id');
      expect(lines.join('\n')).toContain('This is the content');
    });

    it('should truncate content beyond 20 lines', async () => {
      const { formatCandidateDetail } = await import('../../src/commands/hook/review.js');
      const candidate = {
        id: 'abc123',
        shortId: 'abc123',
        type: 'guideline' as const,
        name: 'Long Content',
        content: Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n'),
      };

      const lines = formatCandidateDetail(candidate);
      expect(lines.join('\n')).toContain('10 more lines');
    });
  });
});

// ============================================================================
// session-summary.ts tests
// ============================================================================

describe('session-summary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatSessionSummary', () => {
    it('should format summary with all entry types', async () => {
      vi.doMock('../../src/commands/hook/session.js', () => ({
        getSessionSummary: vi.fn(() =>
          Promise.resolve({
            sessionId: 'sess-12345678',
            projectName: 'Test Project',
            guidelines: [{ name: 'rule1', content: 'content1' }],
            knowledge: [{ title: 'fact1', content: 'fact content' }],
            tools: [{ name: 'tool1', description: 'tool desc' }],
            needsReview: 2,
          })
        ),
      }));

      const { formatSessionSummary } = await import('../../src/commands/hook/session-summary.js');
      const lines = await formatSessionSummary('sess-12345678');

      const output = lines.join('\n');
      expect(output).toContain('Session Summary');
      expect(output).toContain('Project: Test Project');
      expect(output).toContain('Guidelines (1)');
      expect(output).toContain('rule1');
      expect(output).toContain('Knowledge (1)');
      expect(output).toContain('fact1');
      expect(output).toContain('Tools (1)');
      expect(output).toContain('tool1');
      expect(output).toContain('2 item(s) need review');
    });

    it('should truncate long lists', async () => {
      vi.doMock('../../src/commands/hook/session.js', () => ({
        getSessionSummary: vi.fn(() =>
          Promise.resolve({
            sessionId: 'sess-12345678',
            guidelines: Array.from({ length: 10 }, (_, i) => ({ name: `rule${i}`, content: 'c' })),
            knowledge: [],
            tools: [],
            needsReview: 0,
          })
        ),
      }));

      const { formatSessionSummary } = await import('../../src/commands/hook/session-summary.js');
      const lines = await formatSessionSummary('sess-12345678');

      const output = lines.join('\n');
      expect(output).toContain('and 5 more');
    });
  });
});
