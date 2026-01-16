/**
 * Unit tests for entry-utils.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizePagination, attachVersions } from '../../src/db/repositories/entry-utils.js';
import * as baseModule from '../../src/db/repositories/base.js';

// Mock the base module for cursor decoding
vi.mock('../../src/db/repositories/base.js', async () => {
  const actual = await vi.importActual('../../src/db/repositories/base.js');
  return {
    ...actual,
    decodeCursor: vi.fn(),
  };
});

describe('entry-utils', () => {
  const mockDecodeCursor = vi.mocked(baseModule.decodeCursor);

  beforeEach(() => {
    vi.clearAllMocks();
    mockDecodeCursor.mockReturnValue(null);
  });

  describe('normalizePagination', () => {
    it('should use default limit and offset with empty options', () => {
      const result = normalizePagination();
      expect(result.limit).toBe(20); // DEFAULT_LIMIT
      expect(result.offset).toBe(0);
    });

    it('should use provided limit', () => {
      const result = normalizePagination({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    it('should cap limit at MAX_LIMIT', () => {
      const result = normalizePagination({ limit: 10000 });
      expect(result.limit).toBe(100); // MAX_LIMIT
    });

    it('should use provided offset', () => {
      const result = normalizePagination({ offset: 100 });
      expect(result.offset).toBe(100);
    });

    it('should use cursor offset when cursor is valid', () => {
      mockDecodeCursor.mockReturnValue({ offset: 50, query: 'test' });

      const result = normalizePagination({ cursor: 'valid-cursor', offset: 10 });
      expect(result.offset).toBe(50); // Cursor takes precedence
    });

    it('should use provided offset when cursor is invalid', () => {
      mockDecodeCursor.mockReturnValue(null);

      const result = normalizePagination({ cursor: 'invalid', offset: 25 });
      expect(result.offset).toBe(25);
    });

    it('should use default offset when cursor is invalid and no offset', () => {
      mockDecodeCursor.mockReturnValue(null);

      const result = normalizePagination({ cursor: 'invalid' });
      expect(result.offset).toBe(0);
    });

    it('should apply limit cap with cursor', () => {
      mockDecodeCursor.mockReturnValue({ offset: 100, query: '' });

      const result = normalizePagination({ cursor: 'test', limit: 5000 });
      expect(result.limit).toBe(100); // MAX_LIMIT
      expect(result.offset).toBe(100);
    });
  });

  describe('attachVersions', () => {
    it('should attach versions from map to entries', () => {
      const entries = [
        { id: '1', currentVersionId: 'v1' },
        { id: '2', currentVersionId: 'v2' },
      ];
      const versionsMap = new Map([
        ['v1', { id: 'v1', content: 'Version 1' }],
        ['v2', { id: 'v2', content: 'Version 2' }],
      ]);

      const result = attachVersions(entries, versionsMap);

      expect(result[0].currentVersion).toEqual({ id: 'v1', content: 'Version 1' });
      expect(result[1].currentVersion).toEqual({ id: 'v2', content: 'Version 2' });
    });

    it('should handle missing versions', () => {
      const entries = [
        { id: '1', currentVersionId: 'v1' },
        { id: '2', currentVersionId: 'v-missing' },
      ];
      const versionsMap = new Map([['v1', { id: 'v1', content: 'Version 1' }]]);

      const result = attachVersions(entries, versionsMap);

      expect(result[0].currentVersion).toEqual({ id: 'v1', content: 'Version 1' });
      expect(result[1].currentVersion).toBeUndefined();
    });

    it('should handle null currentVersionId', () => {
      const entries = [{ id: '1', currentVersionId: null }];
      const versionsMap = new Map([['v1', { id: 'v1', content: 'Version 1' }]]);

      const result = attachVersions(entries, versionsMap);

      expect(result[0].currentVersion).toBeUndefined();
    });

    it('should handle empty entries array', () => {
      const entries: Array<{ id: string; currentVersionId: string | null }> = [];
      const versionsMap = new Map([['v1', { id: 'v1' }]]);

      const result = attachVersions(entries, versionsMap);

      expect(result).toEqual([]);
    });

    it('should preserve original entry properties', () => {
      const entries = [{ id: '1', currentVersionId: 'v1', name: 'Entry 1', custom: 'data' }];
      const versionsMap = new Map([['v1', { id: 'v1', content: 'Version' }]]);

      const result = attachVersions(entries, versionsMap);

      expect(result[0].id).toBe('1');
      expect(result[0].name).toBe('Entry 1');
      expect(result[0].custom).toBe('data');
      expect(result[0].currentVersion).toBeDefined();
    });

    it('should handle empty versions map', () => {
      const entries = [{ id: '1', currentVersionId: 'v1' }];
      const versionsMap = new Map<string, { id: string }>();

      const result = attachVersions(entries, versionsMap);

      expect(result[0].currentVersion).toBeUndefined();
    });
  });
});
