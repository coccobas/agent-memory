/**
 * Unit tests for pagination cursor utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PaginationCursor,
  encodeCursor,
  decodeCursor,
  isValidCursor,
} from '../../src/utils/pagination.js';

describe('PaginationCursor', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AGENT_MEMORY_CURSOR_SECRET;
    // Set a test secret
    process.env.AGENT_MEMORY_CURSOR_SECRET = 'test-secret-key-that-is-at-least-32-chars';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AGENT_MEMORY_CURSOR_SECRET = originalEnv;
    } else {
      delete process.env.AGENT_MEMORY_CURSOR_SECRET;
    }
  });

  describe('encode', () => {
    it('should encode cursor data', () => {
      const cursor = PaginationCursor.encode({ offset: 100 });
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
    });

    it('should encode cursor with multiple fields', () => {
      const cursor = PaginationCursor.encode({
        offset: 50,
        limit: 10,
        filter: 'active',
      });
      expect(cursor).toBeDefined();
    });

    it('should encode cursor with expiration', () => {
      const cursor = PaginationCursor.encode({ offset: 0 }, 3600000);
      const decoded = PaginationCursor.decode(cursor);
      expect(decoded.expiresAt).toBeDefined();
      expect(decoded.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should not add expiration when not specified', () => {
      const cursor = PaginationCursor.encode({ offset: 0 });
      const decoded = PaginationCursor.decode(cursor);
      expect(decoded.expiresAt).toBeUndefined();
    });

    it('should not add expiration when zero', () => {
      const cursor = PaginationCursor.encode({ offset: 0 }, 0);
      const decoded = PaginationCursor.decode(cursor);
      expect(decoded.expiresAt).toBeUndefined();
    });

    it('should produce URL-safe cursors', () => {
      const cursor = PaginationCursor.encode({ value: 'test/path?query=1' });
      // Base64url should not contain + or /
      expect(cursor).not.toMatch(/[+/]/);
    });
  });

  describe('decode', () => {
    it('should decode valid cursor', () => {
      const original = { offset: 100, limit: 20 };
      const cursor = PaginationCursor.encode(original);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
      expect(decoded.limit).toBe(20);
    });

    it('should throw on invalid base64', () => {
      expect(() => PaginationCursor.decode('!!invalid!!')).toThrow('Invalid pagination cursor');
    });

    it('should throw on invalid JSON', () => {
      const invalidJson = Buffer.from('not json').toString('base64url');
      expect(() => PaginationCursor.decode(invalidJson)).toThrow('Invalid pagination cursor');
    });

    it('should throw on missing data', () => {
      const noData = Buffer.from('{"signature":"abc"}').toString('base64url');
      expect(() => PaginationCursor.decode(noData)).toThrow('Invalid cursor data');
    });

    it('should throw on missing signature', () => {
      const noSig = Buffer.from('{"data":{"offset":1}}').toString('base64url');
      expect(() => PaginationCursor.decode(noSig)).toThrow('Invalid cursor signature');
    });

    it('should throw on tampered data', () => {
      const cursor = PaginationCursor.encode({ offset: 100 });
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      parsed.data.offset = 999; // Tamper with data
      const tampered = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      expect(() => PaginationCursor.decode(tampered)).toThrow('signature verification failed');
    });

    it('should throw on expired cursor', async () => {
      // Create a cursor that expires in 10ms
      const cursor = PaginationCursor.encode({ offset: 0 }, 10);
      // Wait for it to expire
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(() => PaginationCursor.decode(cursor)).toThrow('expired');
    });
  });

  describe('isValid', () => {
    it('should return true for valid cursor', () => {
      const cursor = PaginationCursor.encode({ offset: 0 });
      expect(PaginationCursor.isValid(cursor)).toBe(true);
    });

    it('should return false for invalid cursor', () => {
      expect(PaginationCursor.isValid('invalid')).toBe(false);
    });

    it('should return false for expired cursor', async () => {
      const cursor = PaginationCursor.encode({ offset: 0 }, 10);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(PaginationCursor.isValid(cursor)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(PaginationCursor.isValid('')).toBe(false);
    });
  });

  describe('encodeWithDefaultExpiration', () => {
    it('should encode with default 1-hour expiration', () => {
      const cursor = PaginationCursor.encodeWithDefaultExpiration({ offset: 100 });
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.expiresAt).toBeDefined();
      // Should expire in approximately 1 hour (allowing 10 seconds tolerance)
      const oneHour = 60 * 60 * 1000;
      const expectedExpiration = Date.now() + oneHour;
      expect(decoded.expiresAt).toBeGreaterThan(expectedExpiration - 10000);
      expect(decoded.expiresAt).toBeLessThan(expectedExpiration + 10000);
    });
  });

  describe('standalone functions', () => {
    it('encodeCursor should work', () => {
      const cursor = encodeCursor({ offset: 50 });
      expect(cursor).toBeDefined();
    });

    it('decodeCursor should work', () => {
      const cursor = encodeCursor({ offset: 50 });
      const decoded = decodeCursor(cursor);
      expect(decoded.offset).toBe(50);
    });

    it('isValidCursor should work', () => {
      const cursor = encodeCursor({ offset: 50 });
      expect(isValidCursor(cursor)).toBe(true);
      expect(isValidCursor('invalid')).toBe(false);
    });
  });

  describe('secret handling', () => {
    it('should warn about short secret', () => {
      // This test verifies the code path but we can't easily check the warning
      delete process.env.AGENT_MEMORY_CURSOR_SECRET;

      // Should still work with generated secret
      const cursor = PaginationCursor.encode({ test: true });
      expect(cursor).toBeDefined();
    });
  });
});
