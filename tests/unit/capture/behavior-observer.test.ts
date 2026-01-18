/**
 * Behavior Observer Service Tests
 *
 * Tests for the behavior observation and pattern detection functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BehaviorObserverService,
  getBehaviorObserverService,
  resetBehaviorObserverService,
} from '../../../src/services/capture/behavior-observer.js';
import type { ToolUseEvent } from '../../../src/services/capture/types.js';

describe('BehaviorObserverService', () => {
  let service: BehaviorObserverService;

  beforeEach(() => {
    resetBehaviorObserverService();
    service = new BehaviorObserverService();
  });

  afterEach(() => {
    resetBehaviorObserverService();
  });

  describe('recordEvent', () => {
    it('should record a tool use event', () => {
      const event = service.recordEvent('session-1', 'Bash', { command: 'npm test' });

      expect(event).not.toBeNull();
      expect(event?.toolName).toBe('Bash');
      expect(event?.sessionId).toBe('session-1');
      expect(event?.sequenceNumber).toBe(1);
    });

    it('should increment sequence numbers', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });
      const event3 = service.recordEvent('session-1', 'Bash', { command: 'npm test' });

      expect(event3?.sequenceNumber).toBe(3);
    });

    it('should maintain separate sequences per session', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Read', { file_path: '/b.ts' });
      const event1 = service.recordEvent('session-2', 'Read', { file_path: '/c.ts' });
      const event2 = service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });

      expect(event1?.sequenceNumber).toBe(1);
      expect(event2?.sequenceNumber).toBe(3);
    });

    it('should return null when disabled', () => {
      service.updateConfig({ enabled: false });
      const event = service.recordEvent('session-1', 'Bash', { command: 'npm test' });

      expect(event).toBeNull();
    });

    it('should respect maxEventsPerSession limit', () => {
      service.updateConfig({ maxEventsPerSession: 3 });

      service.recordEvent('session-1', 'Read', { file_path: '/1.ts' });
      service.recordEvent('session-1', 'Read', { file_path: '/2.ts' });
      service.recordEvent('session-1', 'Read', { file_path: '/3.ts' });
      service.recordEvent('session-1', 'Read', { file_path: '/4.ts' });

      const events = service.getSessionEvents('session-1');
      expect(events.length).toBe(3);
      // Oldest event should be removed
      expect(events[0]?.toolInput.file_path).toBe('/2.ts');
    });
  });

  describe('getSessionEvents', () => {
    it('should return empty array for unknown session', () => {
      const events = service.getSessionEvents('unknown-session');
      expect(events).toEqual([]);
    });

    it('should return recorded events', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });

      const events = service.getSessionEvents('session-1');
      expect(events.length).toBe(2);
      expect(events[0]?.toolName).toBe('Read');
      expect(events[1]?.toolName).toBe('Edit');
    });
  });

  describe('analyzeSession', () => {
    it('should return empty patterns for insufficient events', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });

      const result = service.analyzeSession('session-1');

      expect(result.patterns).toEqual([]);
      expect(result.eventsAnalyzed).toBe(1);
    });

    it('should detect build_then_test pattern', () => {
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Bash', { command: 'npm run build' });
      service.recordEvent('session-1', 'Bash', { command: 'npm test' });

      const result = service.analyzeSession('session-1');

      expect(result.eventsAnalyzed).toBe(3);
      const pattern = result.patterns.find((p) => p.type === 'build_then_test');
      expect(pattern).toBeDefined();
      expect(pattern?.title).toContain('build');
      expect(pattern?.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should detect investigation_success pattern', () => {
      service.recordEvent('session-1', 'Bash', { command: 'npm test' }); // Initial command
      service.recordEvent('session-1', 'Read', { file_path: '/src/service.ts' });
      service.recordEvent('session-1', 'Edit', { file_path: '/src/service.ts' });

      const result = service.analyzeSession('session-1');

      const pattern = result.patterns.find((p) => p.type === 'investigation_success');
      expect(pattern).toBeDefined();
      expect(pattern?.title).toContain('Investigation');
    });

    it('should detect config_discovery pattern', () => {
      service.recordEvent('session-1', 'Bash', { command: 'npm test' });
      service.recordEvent('session-1', 'Read', { file_path: '/project/.env' });
      service.recordEvent('session-1', 'Edit', { file_path: '/project/.env' });

      const result = service.analyzeSession('session-1');

      const pattern = result.patterns.find((p) => p.type === 'config_discovery');
      expect(pattern).toBeDefined();
      expect(pattern?.title).toContain('environment');
    });

    it('should detect stale_code pattern', () => {
      // Test → Build → Test sequence
      service.recordEvent('session-1', 'Read', { file_path: '/src/a.ts' });
      service.recordEvent('session-1', 'Bash', { command: 'npm test' });
      service.recordEvent('session-1', 'Read', { file_path: '/src/b.ts' });
      service.recordEvent('session-1', 'Bash', { command: 'npm run build' });
      service.recordEvent('session-1', 'Bash', { command: 'npm test' });

      const result = service.analyzeSession('session-1');

      const pattern = result.patterns.find((p) => p.type === 'stale_code');
      expect(pattern).toBeDefined();
      expect(pattern?.title).toContain('Rebuild');
    });

    it('should filter patterns below confidence threshold', () => {
      service.updateConfig({ behaviorConfidence: 0.9 });

      // This creates a retry_variant pattern which has 0.7 confidence
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts', old_string: 'a', new_string: 'b' });
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts', old_string: 'b', new_string: 'c' });
      service.recordEvent('session-1', 'Bash', { command: 'echo done' });

      const result = service.analyzeSession('session-1');

      // retry_variant has 0.7 confidence, should be filtered out with 0.9 threshold
      const retryPattern = result.patterns.find((p) => p.type === 'retry_variant');
      expect(retryPattern).toBeUndefined();
    });
  });

  describe('clearSession', () => {
    it('should clear session data', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });

      service.clearSession('session-1');

      const events = service.getSessionEvents('session-1');
      expect(events).toEqual([]);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return count of active sessions', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-2', 'Read', { file_path: '/b.ts' });
      service.recordEvent('session-3', 'Read', { file_path: '/c.ts' });

      expect(service.getActiveSessionCount()).toBe(3);
    });
  });

  describe('getTotalEventCount', () => {
    it('should return total event count across all sessions', () => {
      service.recordEvent('session-1', 'Read', { file_path: '/a.ts' });
      service.recordEvent('session-1', 'Edit', { file_path: '/a.ts' });
      service.recordEvent('session-2', 'Bash', { command: 'npm test' });

      expect(service.getTotalEventCount()).toBe(3);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getBehaviorObserverService();
      const instance2 = getBehaviorObserverService();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getBehaviorObserverService();
      resetBehaviorObserverService();
      const instance2 = getBehaviorObserverService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
