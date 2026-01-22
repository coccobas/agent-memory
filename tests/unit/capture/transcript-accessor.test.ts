import { describe, it, expect, beforeEach } from 'vitest';
import {
  CaptureStateManager,
  resetCaptureStateManager,
} from '../../../src/services/capture/state.js';
import type { TurnData } from '../../../src/services/capture/types.js';

function createTurn(
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: Partial<TurnData>
): TurnData {
  return {
    role,
    content,
    tokenCount: content.length,
    ...options,
  };
}

describe('CaptureStateManager.getRecentTranscript', () => {
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = new CaptureStateManager();
  });

  describe('basic functionality', () => {
    it('should return empty array for non-existent session', () => {
      const result = stateManager.getRecentTranscript('nonexistent-session');

      expect(result).toEqual([]);
    });

    it('should return empty array for session with no turns', () => {
      stateManager.getOrCreateSession('session-1');

      const result = stateManager.getRecentTranscript('session-1');

      expect(result).toEqual([]);
    });

    it('should return all turns when fewer than default limit', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'Hello'));
      stateManager.addTurn('session-1', createTurn('assistant', 'Hi there'));

      const result = stateManager.getRecentTranscript('session-1');

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi there');
    });
  });

  describe('lastN option', () => {
    it('should return only the last N turns', () => {
      stateManager.getOrCreateSession('session-1');
      for (let i = 1; i <= 20; i++) {
        stateManager.addTurn('session-1', createTurn('user', `Message ${i}`));
      }

      const result = stateManager.getRecentTranscript('session-1', { lastN: 5 });

      expect(result).toHaveLength(5);
      expect(result[0].content).toBe('Message 16');
      expect(result[4].content).toBe('Message 20');
    });

    it('should return all turns if lastN exceeds transcript length', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'Only message'));

      const result = stateManager.getRecentTranscript('session-1', { lastN: 100 });

      expect(result).toHaveLength(1);
    });

    it('should default to last 10 turns', () => {
      stateManager.getOrCreateSession('session-1');
      for (let i = 1; i <= 15; i++) {
        stateManager.addTurn('session-1', createTurn('user', `Message ${i}`));
      }

      const result = stateManager.getRecentTranscript('session-1');

      expect(result).toHaveLength(10);
      expect(result[0].content).toBe('Message 6');
    });
  });

  describe('maxTokens option', () => {
    it('should limit by approximate token count', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'Short', { tokenCount: 100 }));
      stateManager.addTurn('session-1', createTurn('assistant', 'Also short', { tokenCount: 100 }));
      stateManager.addTurn(
        'session-1',
        createTurn('user', 'Very long message here', { tokenCount: 500 })
      );
      stateManager.addTurn(
        'session-1',
        createTurn('assistant', 'Final response', { tokenCount: 200 })
      );

      const result = stateManager.getRecentTranscript('session-1', { maxTokens: 300 });

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should always include at least one turn even if it exceeds maxTokens', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn(
        'session-1',
        createTurn('user', 'Very long message', { tokenCount: 2000 })
      );

      const result = stateManager.getRecentTranscript('session-1', { maxTokens: 100 });

      expect(result).toHaveLength(1);
    });

    it('should use lastN and maxTokens together, respecting whichever is smaller', () => {
      stateManager.getOrCreateSession('session-1');
      for (let i = 1; i <= 10; i++) {
        stateManager.addTurn('session-1', createTurn('user', `Message ${i}`, { tokenCount: 50 }));
      }

      const result = stateManager.getRecentTranscript('session-1', { lastN: 10, maxTokens: 150 });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should default to 1000 token limit', () => {
      stateManager.getOrCreateSession('session-1');
      for (let i = 1; i <= 50; i++) {
        stateManager.addTurn('session-1', createTurn('user', `Message ${i}`, { tokenCount: 100 }));
      }

      const result = stateManager.getRecentTranscript('session-1');

      const totalTokens = result.reduce((sum, t) => sum + (t.tokenCount ?? 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(1000);
    });
  });

  describe('format option', () => {
    it('should return raw TurnData array by default', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'Hello'));

      const result = stateManager.getRecentTranscript('session-1');

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toHaveProperty('role');
      expect(result[0]).toHaveProperty('content');
    });

    it('should return raw format when specified', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'Hello'));

      const result = stateManager.getRecentTranscript('session-1', { format: 'raw' });

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toHaveProperty('role');
    });
  });

  describe('edge cases', () => {
    it('should handle turns without tokenCount', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'No token count'));

      const result = stateManager.getRecentTranscript('session-1', { maxTokens: 100 });

      expect(result).toHaveLength(1);
    });

    it('should handle mixed turns with and without tokenCount', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'With count', { tokenCount: 50 }));
      stateManager.addTurn('session-1', { role: 'assistant', content: 'Without count' });
      stateManager.addTurn('session-1', createTurn('user', 'With count again', { tokenCount: 50 }));

      const result = stateManager.getRecentTranscript('session-1', { maxTokens: 200 });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve turn order (oldest first in result)', () => {
      stateManager.getOrCreateSession('session-1');
      stateManager.addTurn('session-1', createTurn('user', 'First'));
      stateManager.addTurn('session-1', createTurn('assistant', 'Second'));
      stateManager.addTurn('session-1', createTurn('user', 'Third'));

      const result = stateManager.getRecentTranscript('session-1', { lastN: 3 });

      expect(result[0].content).toBe('First');
      expect(result[1].content).toBe('Second');
      expect(result[2].content).toBe('Third');
    });
  });
});

describe('CaptureStateManager.formatTranscriptAsText', () => {
  let stateManager: CaptureStateManager;

  beforeEach(() => {
    resetCaptureStateManager();
    stateManager = new CaptureStateManager();
  });

  it('should format transcript as readable text', () => {
    stateManager.getOrCreateSession('session-1');
    stateManager.addTurn('session-1', createTurn('user', 'Hello'));
    stateManager.addTurn('session-1', createTurn('assistant', 'Hi there'));

    const result = stateManager.formatTranscriptAsText('session-1');

    expect(result).toContain('user:');
    expect(result).toContain('Hello');
    expect(result).toContain('assistant:');
    expect(result).toContain('Hi there');
  });

  it('should return empty string for non-existent session', () => {
    const result = stateManager.formatTranscriptAsText('nonexistent');

    expect(result).toBe('');
  });

  it('should respect lastN option', () => {
    stateManager.getOrCreateSession('session-1');
    for (let i = 1; i <= 20; i++) {
      stateManager.addTurn('session-1', createTurn('user', `Message ${i}`));
    }

    const result = stateManager.formatTranscriptAsText('session-1', { lastN: 3 });

    expect(result).not.toContain('Message 17');
    expect(result).toContain('Message 18');
    expect(result).toContain('Message 19');
    expect(result).toContain('Message 20');
  });

  it('should separate turns with newlines', () => {
    stateManager.getOrCreateSession('session-1');
    stateManager.addTurn('session-1', createTurn('user', 'Hello'));
    stateManager.addTurn('session-1', createTurn('assistant', 'Hi'));

    const result = stateManager.formatTranscriptAsText('session-1');

    expect(result.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});
