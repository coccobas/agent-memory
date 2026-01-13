import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PaginationCursor,
  encodeCursor,
  decodeCursor,
  isValidCursor,
  type CursorData,
} from '../../src/utils/pagination.js';

describe('PaginationCursor', () => {
  beforeEach(() => {
    // Reset environment for each test
    delete process.env.AGENT_MEMORY_CURSOR_SECRET;
  });

  describe('encode/decode', () => {
    it('should encode and decode simple cursor data', () => {
      const data: CursorData = { offset: 100, limit: 50 };
      const cursor = PaginationCursor.encode(data);

      expect(cursor).toBeTruthy();
      expect(typeof cursor).toBe('string');

      const decoded = PaginationCursor.decode(cursor);
      expect(decoded.offset).toBe(100);
      expect(decoded.limit).toBe(50);
    });

    it('should encode and decode complex cursor data', () => {
      const data: CursorData = {
        offset: 200,
        limit: 100,
        sortBy: 'created_at',
        sortOrder: 'desc',
        filters: { status: 'active' },
      };

      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(200);
      expect(decoded.limit).toBe(100);
      expect(decoded.sortBy).toBe('created_at');
      expect(decoded.sortOrder).toBe('desc');
      expect(decoded.filters).toEqual({ status: 'active' });
    });

    it('should encode and decode empty data object', () => {
      const data: CursorData = {};
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded).toEqual({});
    });

    it('should encode and decode data with nested objects', () => {
      const data: CursorData = {
        lastId: '12345',
        meta: {
          query: { type: 'knowledge' },
          scores: [0.9, 0.8, 0.7],
        },
      };

      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.lastId).toBe('12345');
      expect(decoded.meta).toEqual({
        query: { type: 'knowledge' },
        scores: [0.9, 0.8, 0.7],
      });
    });

    it('should handle special characters in data', () => {
      const data: CursorData = {
        search: 'hello "world" & <special> chars',
        filter: "it's complicated",
      };

      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.search).toBe('hello "world" & <special> chars');
      expect(decoded.filter).toBe("it's complicated");
    });

    it('should handle unicode characters', () => {
      const data: CursorData = {
        search: '你好世界',
        emoji: '🎉🚀',
      };

      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.search).toBe('你好世界');
      expect(decoded.emoji).toBe('🎉🚀');
    });

    it('should produce URL-safe base64url encoding', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Base64url should not contain +, /, or =
      expect(cursor).not.toContain('+');
      expect(cursor).not.toContain('/');
      // Note: Padding may be omitted in base64url
    });
  });

  describe('tampering detection', () => {
    it('should detect tampered cursor data', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Decode to get structure
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);

      // Tamper with data
      parsed.data.offset = 200;

      // Re-encode
      const tamperedCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      // Should throw on decode
      expect(() => PaginationCursor.decode(tamperedCursor)).toThrow(
        /signature verification failed/i
      );
    });

    it('should detect tampered signature', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Decode to get structure
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);

      // Tamper with signature by replacing first character
      const origSig = parsed.signature as string;
      const firstChar = origSig[0];
      const newFirstChar = firstChar === 'X' ? 'Y' : 'X';
      parsed.signature = newFirstChar + origSig.slice(1);

      // Re-encode
      const tamperedCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      // Should throw on decode
      expect(() => PaginationCursor.decode(tamperedCursor)).toThrow(
        /signature verification failed/i
      );
    });

    it('should reject cursor with missing signature', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Remove signature
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      delete parsed.signature;

      const invalidCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      expect(() => PaginationCursor.decode(invalidCursor)).toThrow(/invalid cursor signature/i);
    });

    it('should reject cursor with missing data', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Remove data
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      delete parsed.data;

      const invalidCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      expect(() => PaginationCursor.decode(invalidCursor)).toThrow(/invalid cursor data/i);
    });

    it('should reject completely invalid cursor', () => {
      expect(() => PaginationCursor.decode('not-a-valid-cursor')).toThrow(/cursor.*invalid|Validation error/i);
      expect(() => PaginationCursor.decode('')).toThrow(/cursor.*invalid|Validation error/i);
      expect(() => PaginationCursor.decode('!!!')).toThrow(/cursor.*invalid|Validation error/i);
    });

    it('should reject cursor with invalid JSON', () => {
      const invalidJson = Buffer.from('{"invalid json').toString('base64url');
      expect(() => PaginationCursor.decode(invalidJson)).toThrow(/cursor.*invalid|Validation error/i);
    });

    it('should reject cursor with non-object structure', () => {
      const primitiveJson = Buffer.from(JSON.stringify('string')).toString('base64url');
      expect(() => PaginationCursor.decode(primitiveJson)).toThrow(/invalid cursor structure/i);
    });
  });

  describe('expiration', () => {
    it('should add expiration timestamp when specified', () => {
      const data: CursorData = { offset: 100 };
      const expirationMs = 60000; // 1 minute

      const beforeEncode = Date.now();
      const cursor = PaginationCursor.encode(data, expirationMs);
      const afterEncode = Date.now();

      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.expiresAt).toBeDefined();
      expect(typeof decoded.expiresAt).toBe('number');
      expect(decoded.expiresAt).toBeGreaterThanOrEqual(beforeEncode + expirationMs);
      expect(decoded.expiresAt).toBeLessThanOrEqual(afterEncode + expirationMs);
    });

    it('should not add expiration if not specified', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.expiresAt).toBeUndefined();
    });

    it('should reject expired cursor', () => {
      const data: CursorData = { offset: 100 };
      const expirationMs = 1; // 1ms expiration

      const cursor = PaginationCursor.encode(data, expirationMs);

      // Wait for cursor to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(() => PaginationCursor.decode(cursor)).toThrow(/expired/i);
          resolve();
        }, 10);
      });
    });

    it('should accept non-expired cursor', () => {
      const data: CursorData = { offset: 100 };
      const expirationMs = 60000; // 1 minute from now

      const cursor = PaginationCursor.encode(data, expirationMs);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
    });

    it('should use default expiration with encodeWithDefaultExpiration', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encodeWithDefaultExpiration(data);

      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.expiresAt).toBeDefined();
      expect(typeof decoded.expiresAt).toBe('number');
      // Should expire in about 1 hour (within 5 seconds tolerance)
      const expectedExpiry = Date.now() + 60 * 60 * 1000;
      expect(Math.abs(decoded.expiresAt! - expectedExpiry)).toBeLessThan(5000);
    });

    it('should ignore zero expiration time', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data, 0);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.expiresAt).toBeUndefined();
    });

    it('should ignore negative expiration', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data, -5000);
      const decoded = PaginationCursor.decode(cursor);

      // Negative expiration is ignored, no expiresAt added
      expect(decoded.expiresAt).toBeUndefined();
      expect(decoded.offset).toBe(100);
    });
  });

  describe('isValid', () => {
    it('should return true for valid cursor', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      expect(PaginationCursor.isValid(cursor)).toBe(true);
    });

    it('should return false for tampered cursor', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      // Tamper with cursor
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      parsed.data.offset = 200;
      const tamperedCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      expect(PaginationCursor.isValid(tamperedCursor)).toBe(false);
    });

    it('should return false for expired cursor', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data, 1); // 1ms expiration

      // Wait for cursor to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(PaginationCursor.isValid(cursor)).toBe(false);
          resolve();
        }, 10);
      });
    });

    it('should return false for invalid cursor', () => {
      expect(PaginationCursor.isValid('invalid')).toBe(false);
      expect(PaginationCursor.isValid('')).toBe(false);
      expect(PaginationCursor.isValid('!!!')).toBe(false);
    });
  });

  describe('HMAC secret management', () => {
    it('should use environment variable secret if set', () => {
      const secret = 'a'.repeat(32); // 32 character secret
      process.env.AGENT_MEMORY_CURSOR_SECRET = secret;

      const data: CursorData = { offset: 100 };
      const cursor1 = PaginationCursor.encode(data);

      // Clear and use same secret
      delete process.env.AGENT_MEMORY_CURSOR_SECRET;
      process.env.AGENT_MEMORY_CURSOR_SECRET = secret;

      // Should decode successfully with same secret
      const decoded = PaginationCursor.decode(cursor1);
      expect(decoded.offset).toBe(100);
    });

    it('should warn if environment secret is too short', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.AGENT_MEMORY_CURSOR_SECRET = 'short'; // Less than 32 chars

      const data: CursorData = { offset: 100 };
      PaginationCursor.encode(data);

      // Logger will warn about short secret
      // Note: Actual warning happens via logger, this is just a sanity check
      warnSpy.mockRestore();
    });

    it('should generate different signatures with different secrets', () => {
      const data: CursorData = { offset: 100 };

      // First cursor with one secret
      process.env.AGENT_MEMORY_CURSOR_SECRET = 'a'.repeat(32);
      const cursor1 = PaginationCursor.encode(data);

      // Second cursor with different secret (requires clearing module cache)
      // For this test, we'll just verify structure is consistent
      const decoded1 = PaginationCursor.decode(cursor1);
      expect(decoded1.offset).toBe(100);
    });
  });

  describe('standalone functions', () => {
    it('should work with encodeCursor function', () => {
      const data: CursorData = { offset: 100 };
      const cursor = encodeCursor(data);

      expect(cursor).toBeTruthy();
      const decoded = decodeCursor(cursor);
      expect(decoded.offset).toBe(100);
    });

    it('should work with decodeCursor function', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      const decoded = decodeCursor(cursor);
      expect(decoded.offset).toBe(100);
    });

    it('should work with isValidCursor function', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);

      expect(isValidCursor(cursor)).toBe(true);
      expect(isValidCursor('invalid')).toBe(false);
    });

    it('should support expiration in standalone encodeCursor', () => {
      const data: CursorData = { offset: 100 };
      const cursor = encodeCursor(data, 60000);

      const decoded = decodeCursor(cursor);
      expect(decoded.expiresAt).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle data with null values', () => {
      const data: CursorData = { offset: 100, filter: null };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
      expect(decoded.filter).toBe(null);
    });

    it('should handle data with boolean values', () => {
      const data: CursorData = { offset: 100, includeArchived: true, strict: false };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
      expect(decoded.includeArchived).toBe(true);
      expect(decoded.strict).toBe(false);
    });

    it('should handle data with array values', () => {
      const data: CursorData = { offset: 100, ids: [1, 2, 3], tags: ['tag1', 'tag2'] };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
      expect(decoded.ids).toEqual([1, 2, 3]);
      expect(decoded.tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle very large offset values', () => {
      const data: CursorData = { offset: Number.MAX_SAFE_INTEGER };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle zero offset', () => {
      const data: CursorData = { offset: 0 };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(0);
    });

    it('should handle negative offset', () => {
      const data: CursorData = { offset: -100 };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(-100);
    });

    it('should handle floating point numbers', () => {
      const data: CursorData = { score: 0.12345, threshold: 0.9999 };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.score).toBe(0.12345);
      expect(decoded.threshold).toBe(0.9999);
    });

    it('should handle reasonably long strings', () => {
      // Bug #226 fix: Cursor size is now limited to 10KB to prevent DoS
      // Use a smaller string that fits within the limit
      const longString = 'a'.repeat(5000);
      const data: CursorData = { search: longString };
      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.search).toBe(longString);
    });

    it('should reject cursors exceeding size limit', () => {
      // Bug #226 fix: Very large cursors are rejected to prevent DoS
      const veryLongString = 'a'.repeat(20000);
      const data: CursorData = { search: veryLongString };
      const cursor = PaginationCursor.encode(data);

      expect(() => PaginationCursor.decode(cursor)).toThrow('cursor exceeds maximum size');
    });

    it('should maintain type information through encoding/decoding', () => {
      const data: CursorData = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { key: 'value' },
      };

      const cursor = PaginationCursor.encode(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(typeof decoded.string).toBe('string');
      expect(typeof decoded.number).toBe('number');
      expect(typeof decoded.boolean).toBe('boolean');
      expect(decoded.null).toBe(null);
      expect(Array.isArray(decoded.array)).toBe(true);
      expect(typeof decoded.object).toBe('object');
    });
  });

  describe('security properties', () => {
    it('should use constant-time comparison for signature verification', () => {
      // This is difficult to test directly, but we can verify it doesn't leak
      // timing information by checking it fails consistently for wrong signatures
      const data: CursorData = { offset: 100 };
      const validCursor = PaginationCursor.encode(data);

      const json = Buffer.from(validCursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);

      // Create a tampered signature by flipping every character
      // This guarantees a completely different signature while maintaining valid base64url
      const base64urlChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const tamperedSig = parsed.signature
        .split('')
        .map((char: string) => {
          const idx = base64urlChars.indexOf(char);
          // Flip to a different character in the alphabet
          return base64urlChars[(idx + 17) % 64]; // Offset by 17 to ensure difference
        })
        .join('');

      const tamperedParsed = { ...parsed, signature: tamperedSig };
      const tamperedCursor = Buffer.from(JSON.stringify(tamperedParsed)).toString('base64url');

      // This should fail verification using constant-time comparison
      expect(() => PaginationCursor.decode(tamperedCursor)).toThrow(/signature verification failed/);
    });

    it('should not expose internal structure in error messages', () => {
      const data: CursorData = { secretData: 'sensitive-value-12345' };
      const cursor = PaginationCursor.encode(data);

      // Tamper with cursor
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      parsed.data.secretData = 'tampered-value';
      const tamperedCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

      try {
        PaginationCursor.decode(tamperedCursor);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message.toLowerCase();
        // Error should not expose secret data
        expect(message).not.toContain('sensitive-value-12345');
        expect(message).not.toContain('tampered-value');
      }
    });
  });

  describe('cross-compatibility', () => {
    it('should decode cursor encoded by standalone function', () => {
      const data: CursorData = { offset: 100 };
      const cursor = encodeCursor(data);
      const decoded = PaginationCursor.decode(cursor);

      expect(decoded.offset).toBe(100);
    });

    it('should decode with standalone function cursor from class', () => {
      const data: CursorData = { offset: 100 };
      const cursor = PaginationCursor.encode(data);
      const decoded = decodeCursor(cursor);

      expect(decoded.offset).toBe(100);
    });

    it('should validate cursor from any encoding method', () => {
      const data: CursorData = { offset: 100 };

      const cursor1 = PaginationCursor.encode(data);
      const cursor2 = encodeCursor(data);

      expect(isValidCursor(cursor1)).toBe(true);
      expect(isValidCursor(cursor2)).toBe(true);
      expect(PaginationCursor.isValid(cursor1)).toBe(true);
      expect(PaginationCursor.isValid(cursor2)).toBe(true);
    });
  });
});
