/**
 * HMAC-signed pagination cursor utility
 *
 * Provides tamper-proof pagination cursors for API endpoints.
 * Cursors are base64-encoded JSON with HMAC signatures to prevent manipulation.
 *
 * Security features:
 * - HMAC-SHA256 signature prevents cursor tampering
 * - Optional expiration timestamp
 * - Base64url encoding (URL-safe)
 * - Constant-time signature comparison
 *
 * HIGH-018: Prevent cursor tampering in paginated APIs
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createValidationError } from '../core/errors.js';
import { logger } from './logger.js';

/**
 * Data contained within a pagination cursor
 */
export interface CursorData {
  /** Cursor payload (e.g., offset, last ID, etc.) */
  [key: string]: unknown;
  /** Optional expiration timestamp (Unix milliseconds) */
  expiresAt?: number;
}

/**
 * Internal cursor structure with signature
 */
interface SignedCursor {
  data: CursorData;
  signature: string;
}

/**
 * Default cursor expiration time (1 hour)
 */
const DEFAULT_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Get HMAC secret from environment or generate a fallback
 * WARNING: Using generated secret means cursors won't survive server restarts
 */
let hmacSecret: string | undefined;

function getHmacSecret(): string {
  if (hmacSecret) {
    return hmacSecret;
  }

  // Try environment variable first
  const envSecret = process.env.AGENT_MEMORY_CURSOR_SECRET;
  if (envSecret && envSecret.length >= 32) {
    hmacSecret = envSecret;
    return hmacSecret;
  }

  // Warn if using generated secret (won't persist across restarts)
  if (envSecret && envSecret.length < 32) {
    logger.warn('AGENT_MEMORY_CURSOR_SECRET is too short (minimum 32 characters), generating random secret');
  } else if (!envSecret) {
    logger.warn(
      'AGENT_MEMORY_CURSOR_SECRET not set, generating random secret. ' +
      'Pagination cursors will not survive server restarts. ' +
      'Set AGENT_MEMORY_CURSOR_SECRET to a 32+ character secret for production.'
    );
  }

  // Generate random secret (insecure for multi-instance deployments)
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  hmacSecret = Buffer.from(randomBytes).toString('base64');
  return hmacSecret;
}

/**
 * Create HMAC signature for cursor data
 */
function createSignature(data: CursorData): string {
  const secret = getHmacSecret();
  const payload = JSON.stringify(data);
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('base64url');
}

/**
 * Verify HMAC signature for cursor data
 * Uses constant-time comparison to prevent timing attacks
 */
function verifySignature(data: CursorData, signature: string): boolean {
  const expectedSignature = createSignature(data);

  // Constant-time comparison to prevent timing attacks
  try {
    const expected = Buffer.from(expectedSignature, 'base64url');
    const actual = Buffer.from(signature, 'base64url');

    // Lengths must match for timing-safe comparison
    if (expected.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  } catch {
    // Invalid base64url encoding
    return false;
  }
}

/**
 * Pagination cursor utility class
 */
export class PaginationCursor {
  /**
   * Encode cursor data with HMAC signature
   *
   * @param data - Cursor data to encode
   * @param expirationMs - Optional expiration time in milliseconds (default: 1 hour)
   * @returns Base64url-encoded signed cursor
   *
   * @example
   * ```ts
   * const cursor = PaginationCursor.encode({ offset: 100, limit: 50 });
   * // Returns: "eyJkYXRhIjp7Im9mZnNldCI6MTAwLCJsaW1pdCI6NTB9LCJzaWduYXR1cmUiOi..."
   * ```
   */
  static encode(data: CursorData, expirationMs?: number): string {
    // Add expiration timestamp if specified
    const cursorData: CursorData = { ...data };
    if (expirationMs !== undefined && expirationMs > 0) {
      cursorData.expiresAt = Date.now() + expirationMs;
    }

    // Create signature
    const signature = createSignature(cursorData);

    // Create signed cursor object
    const signedCursor: SignedCursor = {
      data: cursorData,
      signature,
    };

    // Encode as base64url (URL-safe)
    const json = JSON.stringify(signedCursor);
    return Buffer.from(json).toString('base64url');
  }

  /**
   * Decode and verify cursor
   *
   * @param cursor - Base64url-encoded signed cursor
   * @returns Decoded cursor data
   * @throws Error if cursor is invalid, tampered, or expired
   *
   * @example
   * ```ts
   * try {
   *   const data = PaginationCursor.decode(cursor);
   *   console.log('Offset:', data.offset);
   * } catch (error) {
   *   console.error('Invalid cursor:', error.message);
   * }
   * ```
   */
  static decode(cursor: string): CursorData {
    try {
      // Decode base64url
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const signedCursor = JSON.parse(json) as SignedCursor;

      // Validate structure
      if (!signedCursor || typeof signedCursor !== 'object') {
        throw createValidationError('cursor', 'invalid cursor structure');
      }

      if (!signedCursor.data || typeof signedCursor.data !== 'object') {
        throw createValidationError('cursor.data', 'invalid cursor data');
      }

      if (!signedCursor.signature || typeof signedCursor.signature !== 'string') {
        throw createValidationError('cursor.signature', 'invalid cursor signature');
      }

      // Verify signature
      if (!verifySignature(signedCursor.data, signedCursor.signature)) {
        throw createValidationError('cursor', 'signature verification failed (possible tampering)');
      }

      // Check expiration
      const expiresAt = signedCursor.data.expiresAt;
      if (typeof expiresAt === 'number' && expiresAt > 0) {
        if (Date.now() > expiresAt) {
          throw createValidationError('cursor', 'cursor has expired');
        }
      }

      return signedCursor.data;
    } catch (error) {
      if (error instanceof Error) {
        throw createValidationError('cursor', error.message);
      }
      throw createValidationError('cursor', 'unknown error');
    }
  }

  /**
   * Check if cursor is valid without decoding
   *
   * @param cursor - Base64url-encoded signed cursor
   * @returns true if cursor is valid and not expired
   *
   * @example
   * ```ts
   * if (PaginationCursor.isValid(cursor)) {
   *   // Safe to use cursor
   * } else {
   *   // Handle invalid cursor
   * }
   * ```
   */
  static isValid(cursor: string): boolean {
    try {
      this.decode(cursor);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create cursor with default 1-hour expiration
   *
   * @param data - Cursor data to encode
   * @returns Base64url-encoded signed cursor with 1-hour expiration
   */
  static encodeWithDefaultExpiration(data: CursorData): string {
    return this.encode(data, DEFAULT_EXPIRATION_MS);
  }
}

/**
 * Standalone encode function for compatibility
 */
export function encodeCursor(data: CursorData, expirationMs?: number): string {
  return PaginationCursor.encode(data, expirationMs);
}

/**
 * Standalone decode function for compatibility
 */
export function decodeCursor(cursor: string): CursorData {
  return PaginationCursor.decode(cursor);
}

/**
 * Standalone validation function for compatibility
 */
export function isValidCursor(cursor: string): boolean {
  return PaginationCursor.isValid(cursor);
}
