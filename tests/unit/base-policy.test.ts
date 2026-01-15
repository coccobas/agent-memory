import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasePolicy } from '../../src/services/rl/policies/base.policy.js';
import type { PolicyDecision } from '../../src/services/rl/types.js';

// Concrete implementation for testing
class TestPolicy extends BasePolicy<{ value: number }, string> {
  public decideFn: () => Promise<PolicyDecision<string>>;

  constructor(config: { enabled: boolean; modelPath?: string }) {
    super(config);
    this.decideFn = async () => ({ action: 'learned', confidence: 0.95 });
  }

  async decide(state: { value: number }): Promise<PolicyDecision<string>> {
    return this.decideFn();
  }

  getFallback(): (state: { value: number }) => PolicyDecision<string> {
    return (state) => ({
      action: state.value > 50 ? 'high' : 'low',
      confidence: 0.7,
    });
  }
}

describe('BasePolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return true when enabled and modelPath is set', () => {
      const policy = new TestPolicy({ enabled: true, modelPath: '/path/to/model' });
      expect(policy.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const policy = new TestPolicy({ enabled: false, modelPath: '/path/to/model' });
      expect(policy.isEnabled()).toBe(false);
    });

    it('should return false when modelPath is not set', () => {
      const policy = new TestPolicy({ enabled: true });
      expect(policy.isEnabled()).toBe(false);
    });

    it('should return false when both disabled and no modelPath', () => {
      const policy = new TestPolicy({ enabled: false });
      expect(policy.isEnabled()).toBe(false);
    });
  });

  describe('decideWithFallback', () => {
    it('should use fallback when policy is not enabled', async () => {
      const policy = new TestPolicy({ enabled: false });

      const result = await policy.decideWithFallback({ value: 75 });

      expect(result.action).toBe('high');
      expect(result.confidence).toBe(0.7);
    });

    it('should use fallback when modelPath is not set', async () => {
      const policy = new TestPolicy({ enabled: true });

      const result = await policy.decideWithFallback({ value: 25 });

      expect(result.action).toBe('low');
    });

    it('should use learned policy when enabled', async () => {
      const policy = new TestPolicy({ enabled: true, modelPath: '/path/to/model' });

      const result = await policy.decideWithFallback({ value: 50 });

      expect(result.action).toBe('learned');
      expect(result.confidence).toBe(0.95);
    });

    it('should fall back on error', async () => {
      const policy = new TestPolicy({ enabled: true, modelPath: '/path/to/model' });
      policy.decideFn = async () => {
        throw new Error('Model inference failed');
      };

      const result = await policy.decideWithFallback({ value: 75 });

      // Should use fallback action when decide() throws
      expect(result.action).toBe('high');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('updateConfig', () => {
    it('should update enabled flag', () => {
      const policy = new TestPolicy({ enabled: false });

      expect(policy.isEnabled()).toBe(false);

      policy.updateConfig({ enabled: true, modelPath: '/path' });

      expect(policy.isEnabled()).toBe(true);
    });

    it('should update modelPath', () => {
      const policy = new TestPolicy({ enabled: true });

      expect(policy.isEnabled()).toBe(false);

      policy.updateConfig({ modelPath: '/new/path' });

      expect(policy.isEnabled()).toBe(true);
    });

    it('should handle partial updates', () => {
      const policy = new TestPolicy({ enabled: true, modelPath: '/path' });

      expect(policy.isEnabled()).toBe(true);

      policy.updateConfig({ enabled: false });

      expect(policy.isEnabled()).toBe(false);
    });
  });

  describe('getFallback', () => {
    it('should return fallback function', () => {
      const policy = new TestPolicy({ enabled: true });
      const fallback = policy.getFallback();

      expect(typeof fallback).toBe('function');
    });

    it('should make decisions based on state', () => {
      const policy = new TestPolicy({ enabled: true });
      const fallback = policy.getFallback();

      const highResult = fallback({ value: 100 });
      const lowResult = fallback({ value: 10 });

      expect(highResult.action).toBe('high');
      expect(lowResult.action).toBe('low');
    });
  });
});
