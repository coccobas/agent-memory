import { describe, expect, it } from 'vitest';
import { parseHookStdin, isValidHookEvent, normalizeEventName } from '../../../src/v2/hooks/cli.js';

describe('hook-cli', () => {
  describe('parseHookStdin', () => {
    it('parses valid JSON', () => {
      const result = parseHookStdin('{"sessionId": "sess-1"}');
      expect(result).toEqual({ sessionId: 'sess-1' });
    });

    it('returns null for invalid JSON', () => {
      const result = parseHookStdin('not json');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = parseHookStdin('');
      expect(result).toBeNull();
    });
  });

  describe('normalizeEventName', () => {
    it('maps Claude Code native format to canonical', () => {
      expect(normalizeEventName('posttooluse')).toBe('post-tool-use');
      expect(normalizeEventName('pretooluse')).toBe('pre-tool-use');
      expect(normalizeEventName('userpromptsubmit')).toBe('user-prompt-submit');
    });

    it('passes through already-canonical names', () => {
      expect(normalizeEventName('session-start')).toBe('session-start');
      expect(normalizeEventName('session-end')).toBe('session-end');
      expect(normalizeEventName('post-tool-use')).toBe('post-tool-use');
      expect(normalizeEventName('stop')).toBe('stop');
    });

    it('returns unknown names unchanged', () => {
      expect(normalizeEventName('unknown')).toBe('unknown');
      expect(normalizeEventName('')).toBe('');
    });
  });

  describe('isValidHookEvent', () => {
    it('accepts canonical event names', () => {
      expect(isValidHookEvent('session-start')).toBe(true);
      expect(isValidHookEvent('session-end')).toBe(true);
      expect(isValidHookEvent('post-tool-use')).toBe(true);
    });

    it('accepts Claude Code native format via normalization', () => {
      expect(isValidHookEvent('posttooluse')).toBe(true);
    });

    it('rejects events without v2 handlers', () => {
      expect(isValidHookEvent('pretooluse')).toBe(false);
      expect(isValidHookEvent('pre-tool-use')).toBe(false);
      expect(isValidHookEvent('userpromptsubmit')).toBe(false);
      expect(isValidHookEvent('user-prompt-submit')).toBe(false);
      expect(isValidHookEvent('stop')).toBe(false);
    });

    it('rejects unknown event names', () => {
      expect(isValidHookEvent('unknown')).toBe(false);
      expect(isValidHookEvent('')).toBe(false);
    });
  });
});
