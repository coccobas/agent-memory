/**
 * Unit tests for correlation utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCorrelationId,
  getCorrelationId,
  getCorrelationContext,
  withCorrelationId,
  withNewCorrelationId,
  withCorrelationIdAsync,
  withNewCorrelationIdAsync,
  getCorrelationElapsedMs,
  addCorrelationMetadata,
  withChildCorrelationId,
  withChildCorrelationIdAsync,
  getCorrelationLogFields,
  correlationLoggerMixin,
  type CorrelationContext,
} from '../../src/utils/correlation.js';

describe('Correlation ID Generation', () => {
  describe('generateCorrelationId', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct format', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^cor_[a-z0-9]+_[a-f0-9]{12}$/);
    });

    it('should generate valid alphanumeric IDs', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });
});

describe('Correlation Context - Sync Operations', () => {
  describe('withCorrelationId', () => {
    it('should set correlation ID in context', () => {
      withCorrelationId('test-id-123', () => {
        const id = getCorrelationId();
        expect(id).toBe('test-id-123');
      });
    });

    it('should return function result', () => {
      const result = withCorrelationId('test-id', () => {
        return 'test-result';
      });
      expect(result).toBe('test-result');
    });

    it('should clear context after function completes', () => {
      withCorrelationId('test-id', () => {
        expect(getCorrelationId()).toBe('test-id');
      });
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should support nested contexts', () => {
      withCorrelationId('outer-id', () => {
        expect(getCorrelationId()).toBe('outer-id');

        withCorrelationId('inner-id', () => {
          expect(getCorrelationId()).toBe('inner-id');
        });

        expect(getCorrelationId()).toBe('outer-id');
      });
    });

    it('should set parent ID when provided', () => {
      withCorrelationId('test-id', () => {}, { parentId: 'parent-id' });
      // Parent ID should be in context but not accessible after closure
    });

    it('should set metadata when provided', () => {
      withCorrelationId('test-id', () => {
        const context = getCorrelationContext();
        expect(context?.metadata).toEqual({ key: 'value' });
      }, { metadata: { key: 'value' } });
    });

    it('should throw on invalid correlation ID format', () => {
      expect(() => {
        withCorrelationId('invalid id!', () => {});
      }).toThrow('must contain only alphanumeric');
    });

    it('should throw on empty correlation ID', () => {
      expect(() => {
        withCorrelationId('', () => {});
      }).toThrow('must be a non-empty string');
    });

    it('should throw on too long correlation ID', () => {
      const longId = 'a'.repeat(129);
      expect(() => {
        withCorrelationId(longId, () => {});
      }).toThrow('exceeds maximum length');
    });

    it('should throw on invalid parent ID', () => {
      expect(() => {
        withCorrelationId('valid-id', () => {}, { parentId: 'invalid parent!' });
      }).toThrow('must contain only alphanumeric');
    });

    it('should throw on non-serializable metadata', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => {
        withCorrelationId('test-id', () => {}, { metadata: circular });
      }).toThrow('must be JSON-serializable');
    });

    it('should throw on metadata exceeding size limit', () => {
      const largeMetadata = { data: 'x'.repeat(5000) };

      expect(() => {
        withCorrelationId('test-id', () => {}, { metadata: largeMetadata });
      }).toThrow('exceeds maximum size');
    });
  });

  describe('withNewCorrelationId', () => {
    it('should generate and set new correlation ID', () => {
      withNewCorrelationId(() => {
        const id = getCorrelationId();
        expect(id).toBeTruthy();
        expect(id).toMatch(/^cor_/);
      });
    });

    it('should generate different IDs each time', () => {
      let id1: string | undefined;
      let id2: string | undefined;

      withNewCorrelationId(() => {
        id1 = getCorrelationId();
      });

      withNewCorrelationId(() => {
        id2 = getCorrelationId();
      });

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should return function result', () => {
      const result = withNewCorrelationId(() => 42);
      expect(result).toBe(42);
    });
  });

  describe('withChildCorrelationId', () => {
    it('should create child context with parent reference', () => {
      withCorrelationId('parent-id', () => {
        withChildCorrelationId(() => {
          const context = getCorrelationContext();
          expect(context?.parentId).toBe('parent-id');
          expect(context?.correlationId).not.toBe('parent-id');
        });
      });
    });

    it('should generate unique child ID', () => {
      withCorrelationId('parent-id', () => {
        withChildCorrelationId(() => {
          const childId = getCorrelationId();
          expect(childId).toBeTruthy();
          expect(childId).toMatch(/^cor_/);
          expect(childId).not.toBe('parent-id');
        });
      });
    });

    it('should work without parent context', () => {
      withChildCorrelationId(() => {
        const context = getCorrelationContext();
        expect(context?.correlationId).toBeTruthy();
        expect(context?.parentId).toBeUndefined();
      });
    });

    it('should support child metadata', () => {
      withChildCorrelationId(() => {
        const context = getCorrelationContext();
        expect(context?.metadata).toEqual({ child: true });
      }, { metadata: { child: true } });
    });
  });
});

describe('Correlation Context - Async Operations', () => {
  describe('withCorrelationIdAsync', () => {
    it('should set correlation ID in async context', async () => {
      await withCorrelationIdAsync('async-id', async () => {
        const id = getCorrelationId();
        expect(id).toBe('async-id');
      });
    });

    it('should maintain context across awaits', async () => {
      await withCorrelationIdAsync('test-id', async () => {
        expect(getCorrelationId()).toBe('test-id');

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(getCorrelationId()).toBe('test-id');
      });
    });

    it('should return promise result', async () => {
      const result = await withCorrelationIdAsync('test-id', async () => {
        return 'async-result';
      });
      expect(result).toBe('async-result');
    });

    it('should clear context after async function completes', async () => {
      await withCorrelationIdAsync('test-id', async () => {
        expect(getCorrelationId()).toBe('test-id');
      });
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should support async nested contexts', async () => {
      await withCorrelationIdAsync('outer-id', async () => {
        expect(getCorrelationId()).toBe('outer-id');

        await withCorrelationIdAsync('inner-id', async () => {
          expect(getCorrelationId()).toBe('inner-id');
        });

        expect(getCorrelationId()).toBe('outer-id');
      });
    });

    it('should validate correlation ID', async () => {
      await expect(async () => {
        await withCorrelationIdAsync('invalid id!', async () => {});
      }).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('withNewCorrelationIdAsync', () => {
    it('should generate new ID for async context', async () => {
      await withNewCorrelationIdAsync(async () => {
        const id = getCorrelationId();
        expect(id).toBeTruthy();
        expect(id).toMatch(/^cor_/);
      });
    });

    it('should maintain context across async operations', async () => {
      await withNewCorrelationIdAsync(async () => {
        const id1 = getCorrelationId();
        await new Promise(resolve => setTimeout(resolve, 10));
        const id2 = getCorrelationId();
        expect(id1).toBe(id2);
      });
    });
  });

  describe('withChildCorrelationIdAsync', () => {
    it('should create async child context', async () => {
      await withCorrelationIdAsync('parent-id', async () => {
        await withChildCorrelationIdAsync(async () => {
          const context = getCorrelationContext();
          expect(context?.parentId).toBe('parent-id');
          expect(context?.correlationId).not.toBe('parent-id');
        });
      });
    });

    it('should maintain child context across awaits', async () => {
      await withCorrelationIdAsync('parent-id', async () => {
        await withChildCorrelationIdAsync(async () => {
          const context1 = getCorrelationContext();
          await new Promise(resolve => setTimeout(resolve, 10));
          const context2 = getCorrelationContext();
          expect(context1?.correlationId).toBe(context2?.correlationId);
          expect(context2?.parentId).toBe('parent-id');
        });
      });
    });
  });
});

describe('Correlation Context Accessors', () => {
  describe('getCorrelationId', () => {
    it('should return undefined outside context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return current correlation ID', () => {
      withCorrelationId('test-id', () => {
        expect(getCorrelationId()).toBe('test-id');
      });
    });
  });

  describe('getCorrelationContext', () => {
    it('should return undefined outside context', () => {
      expect(getCorrelationContext()).toBeUndefined();
    });

    it('should return full context object', () => {
      withCorrelationId('test-id', () => {
        const context = getCorrelationContext();
        expect(context).toMatchObject({
          correlationId: 'test-id',
        });
        expect(context?.startTime).toBeGreaterThan(0);
      }, { parentId: 'parent-id', metadata: { key: 'value' } });
    });

    it('should include all context properties', () => {
      withCorrelationId('test-id', () => {
        const context = getCorrelationContext();
        expect(context).toHaveProperty('correlationId');
        expect(context).toHaveProperty('startTime');
        expect(context).toHaveProperty('parentId');
        expect(context).toHaveProperty('metadata');
      }, { parentId: 'parent-id', metadata: { test: true } });
    });
  });

  describe('getCorrelationElapsedMs', () => {
    it('should return 0 outside context', () => {
      expect(getCorrelationElapsedMs()).toBe(0);
    });

    it('should return elapsed time in milliseconds', async () => {
      await withCorrelationIdAsync('test-id', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        const elapsed = getCorrelationElapsedMs();
        expect(elapsed).toBeGreaterThanOrEqual(45);
        expect(elapsed).toBeLessThan(200);
      });
    });

    it('should increase over time', async () => {
      await withCorrelationIdAsync('test-id', async () => {
        const elapsed1 = getCorrelationElapsedMs();
        await new Promise(resolve => setTimeout(resolve, 20));
        const elapsed2 = getCorrelationElapsedMs();
        expect(elapsed2).toBeGreaterThan(elapsed1);
      });
    });
  });

  describe('addCorrelationMetadata', () => {
    it('should add metadata to existing context', () => {
      withCorrelationId('test-id', () => {
        addCorrelationMetadata('key1', 'value1');
        addCorrelationMetadata('key2', 42);

        const context = getCorrelationContext();
        expect(context?.metadata).toEqual({
          key1: 'value1',
          key2: 42,
        });
      });
    });

    it('should not throw outside context', () => {
      expect(() => {
        addCorrelationMetadata('key', 'value');
      }).not.toThrow();
    });

    it('should merge with existing metadata', () => {
      withCorrelationId('test-id', () => {
        addCorrelationMetadata('new', 'data');

        const context = getCorrelationContext();
        expect(context?.metadata).toEqual({
          existing: true,
          new: 'data',
        });
      }, { metadata: { existing: true } });
    });
  });
});

describe('Logging Helpers', () => {
  describe('getCorrelationLogFields', () => {
    it('should return empty object outside context', () => {
      const fields = getCorrelationLogFields();
      expect(fields).toEqual({});
    });

    it('should return correlation ID field', () => {
      withCorrelationId('test-id', () => {
        const fields = getCorrelationLogFields();
        expect(fields).toEqual({
          correlationId: 'test-id',
        });
      });
    });

    it('should include parent ID when present', () => {
      withCorrelationId('test-id', () => {
        const fields = getCorrelationLogFields();
        expect(fields).toEqual({
          correlationId: 'test-id',
          parentCorrelationId: 'parent-id',
        });
      }, { parentId: 'parent-id' });
    });

    it('should not include parent ID when absent', () => {
      withCorrelationId('test-id', () => {
        const fields = getCorrelationLogFields();
        expect(fields).not.toHaveProperty('parentCorrelationId');
      });
    });
  });

  describe('correlationLoggerMixin', () => {
    it('should return same as getCorrelationLogFields', () => {
      withCorrelationId('test-id', () => {
        const mixinFields = correlationLoggerMixin();
        const logFields = getCorrelationLogFields();
        expect(mixinFields).toEqual(logFields);
      }, { parentId: 'parent-id' });
    });

    it('should return empty object outside context', () => {
      const fields = correlationLoggerMixin();
      expect(fields).toEqual({});
    });
  });
});

describe('Error Handling', () => {
  it('should propagate errors from sync function', () => {
    expect(() => {
      withCorrelationId('test-id', () => {
        throw new Error('Test error');
      });
    }).toThrow('Test error');
  });

  it('should propagate errors from async function', async () => {
    await expect(async () => {
      await withCorrelationIdAsync('test-id', async () => {
        throw new Error('Async error');
      });
    }).rejects.toThrow('Async error');
  });

  it('should clear context even after error', () => {
    try {
      withCorrelationId('test-id', () => {
        throw new Error('Test');
      });
    } catch (e) {
      // Expected
    }

    expect(getCorrelationId()).toBeUndefined();
  });

  it('should clear context even after async error', async () => {
    try {
      await withCorrelationIdAsync('test-id', async () => {
        throw new Error('Async test');
      });
    } catch (e) {
      // Expected
    }

    expect(getCorrelationId()).toBeUndefined();
  });
});

describe('Edge Cases', () => {
  it('should handle very long valid correlation IDs', () => {
    const longId = 'a'.repeat(128); // Max length

    withCorrelationId(longId, () => {
      expect(getCorrelationId()).toBe(longId);
    });
  });

  it('should handle special valid characters', () => {
    const id = 'test-id_123-456_789';

    withCorrelationId(id, () => {
      expect(getCorrelationId()).toBe(id);
    });
  });

  it('should handle maximum metadata size', () => {
    const metadata = { data: 'x'.repeat(4000) };

    withCorrelationId('test-id', () => {
      const context = getCorrelationContext();
      expect(context?.metadata).toBeTruthy();
    }, { metadata });
  });

  it('should handle concurrent async contexts', async () => {
    const results = await Promise.all([
      withNewCorrelationIdAsync(async () => {
        const id = getCorrelationId();
        await new Promise(resolve => setTimeout(resolve, 10));
        return id;
      }),
      withNewCorrelationIdAsync(async () => {
        const id = getCorrelationId();
        await new Promise(resolve => setTimeout(resolve, 10));
        return id;
      }),
    ]);

    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeTruthy();
    expect(results[0]).not.toBe(results[1]);
  });
});
