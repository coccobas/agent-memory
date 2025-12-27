/**
 * Usage examples for HMAC-signed pagination cursors
 *
 * This example demonstrates how to use the PaginationCursor utility
 * to secure paginated API endpoints against cursor tampering.
 *
 * HIGH-018: Prevent cursor tampering in paginated APIs
 */

import { createValidationError } from '../core/errors.js';
import { PaginationCursor, type CursorData } from './pagination.js';

// =============================================================================
// BASIC USAGE
// =============================================================================

/**
 * Example 1: Simple offset-based pagination
 */
function exampleOffsetPagination() {
  // Encode cursor for next page
  const cursorData: CursorData = {
    offset: 100,
    limit: 50,
  };

  const cursor = PaginationCursor.encode(cursorData);
  console.log('Next page cursor:', cursor);
  // Returns: "eyJkYXRhIjp7Im9mZnNldCI6MTAwLCJsaW1pdCI6NTB9LCJzaWd..."

  // Later, decode cursor from client request
  try {
    const decoded = PaginationCursor.decode(cursor);
    console.log('Offset:', decoded.offset); // 100
    console.log('Limit:', decoded.limit); // 50
  } catch (error) {
    console.error('Invalid or tampered cursor:', error);
  }
}

/**
 * Example 2: Cursor-based pagination with last ID
 */
function exampleCursorPagination() {
  const cursorData: CursorData = {
    lastId: 'uuid-12345',
    direction: 'forward',
    limit: 25,
  };

  const cursor = PaginationCursor.encode(cursorData);

  // Decode and use in query
  const decoded = PaginationCursor.decode(cursor);
  // SELECT * FROM items WHERE id > 'uuid-12345' LIMIT 25
}

/**
 * Example 3: Pagination with filters and sorting
 */
function exampleComplexPagination() {
  const cursorData: CursorData = {
    offset: 50,
    limit: 20,
    sortBy: 'created_at',
    sortOrder: 'desc',
    filters: {
      status: 'active',
      category: 'knowledge',
    },
  };

  const cursor = PaginationCursor.encode(cursorData);

  // This cursor cannot be tampered with - any changes to filters,
  // offset, or sorting will fail signature verification
}

// =============================================================================
// EXPIRATION
// =============================================================================

/**
 * Example 4: Cursor with expiration (recommended for security)
 */
function exampleWithExpiration() {
  const cursorData: CursorData = {
    offset: 200,
    limit: 50,
  };

  // Cursor expires in 1 hour (3600000 ms)
  const cursor = PaginationCursor.encode(cursorData, 3600000);

  // Or use default 1-hour expiration
  const cursorWithDefault = PaginationCursor.encodeWithDefaultExpiration(cursorData);

  // Expired cursors will throw when decoded
  setTimeout(() => {
    try {
      PaginationCursor.decode(cursor);
    } catch (error) {
      console.error('Cursor expired'); // After 1 hour
    }
  }, 3600000);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Example 5: Validate cursor before decoding
 */
function exampleValidation() {
  const cursor = 'cursor-from-client-request';

  // Check if cursor is valid without decoding
  if (PaginationCursor.isValid(cursor)) {
    const data = PaginationCursor.decode(cursor);
    // Use data safely
  } else {
    // Return error to client
    throw createValidationError('cursor', 'invalid or expired pagination cursor');
  }
}

// =============================================================================
// API INTEGRATION
// =============================================================================

/**
 * Example 6: REST API endpoint with secure pagination
 */
interface ListItemsRequest {
  cursor?: string;
  limit?: number;
}

interface ListItemsResponse {
  items: unknown[];
  nextCursor?: string;
  hasMore: boolean;
}

function listItemsEndpoint(req: ListItemsRequest): ListItemsResponse {
  // Default pagination params
  let offset = 0;
  let limit = req.limit || 50;

  // If cursor provided, decode and validate
  if (req.cursor) {
    try {
      const cursorData = PaginationCursor.decode(req.cursor);

      // Extract pagination params from cursor
      if (typeof cursorData.offset === 'number') {
        offset = cursorData.offset;
      }
      if (typeof cursorData.limit === 'number') {
        limit = cursorData.limit;
      }
    } catch (error) {
      throw createValidationError('cursor', 'invalid pagination cursor');
    }
  }

  // Fetch items from database
  const items = fetchItemsFromDB(offset, limit);

  // Create cursor for next page
  let nextCursor: string | undefined;
  if (items.length === limit) {
    const nextCursorData: CursorData = {
      offset: offset + limit,
      limit,
    };
    // Use 1-hour expiration for cursors
    nextCursor = PaginationCursor.encode(nextCursorData, 3600000);
  }

  return {
    items,
    nextCursor,
    hasMore: items.length === limit,
  };
}

// Mock database fetch
function fetchItemsFromDB(offset: number, limit: number): unknown[] {
  return []; // Implementation depends on your database
}

// =============================================================================
// SECURITY BEST PRACTICES
// =============================================================================

/**
 * Example 7: Security recommendations
 */
function securityBestPractices() {
  // 1. ALWAYS set AGENT_MEMORY_CURSOR_SECRET environment variable
  //    (minimum 32 characters) for production deployments
  //
  //    export AGENT_MEMORY_CURSOR_SECRET="your-secret-key-min-32-chars"

  // 2. Use expiration for all cursors to limit window of use
  const cursor = PaginationCursor.encode({ offset: 0 }, 3600000); // 1 hour

  // 3. Validate cursors early in request processing
  if (!PaginationCursor.isValid(cursor)) {
    throw createValidationError('cursor', 'invalid cursor');
  }

  // 4. Don't expose cursor internals in error messages
  try {
    PaginationCursor.decode('invalid-cursor');
  } catch (error) {
    // Error message doesn't expose cursor data
    console.log((error as Error).message); // "Invalid pagination cursor: ..."
  }

  // 5. Rotate AGENT_MEMORY_CURSOR_SECRET periodically
  //    Note: This will invalidate all existing cursors

  // 6. Monitor for repeated invalid cursor attempts (possible attack)
}

// =============================================================================
// MIGRATION FROM UNSAFE PAGINATION
// =============================================================================

/**
 * Example 8: Migrating from unsafe offset/limit to secure cursors
 */

// BEFORE: Unsafe - client can manipulate offset
function unsafePagination(offset: number, limit: number) {
  // Client can set offset to any value
  return fetchItemsFromDB(offset, limit);
}

// AFTER: Secure - cursor prevents manipulation
function securePagination(cursor?: string) {
  let offset = 0;
  const limit = 50;

  if (cursor) {
    const data = PaginationCursor.decode(cursor); // Throws if tampered
    offset = (data.offset as number) || 0;
  }

  const items = fetchItemsFromDB(offset, limit);

  const nextCursor = PaginationCursor.encode({
    offset: offset + limit,
    limit,
  });

  return { items, nextCursor };
}

// =============================================================================
// STANDALONE FUNCTIONS
// =============================================================================

/**
 * Example 9: Using standalone functions instead of class methods
 */
import { encodeCursor, decodeCursor, isValidCursor } from './pagination.js';

function standaloneExample() {
  const data: CursorData = { offset: 100 };

  // Encode
  const cursor = encodeCursor(data, 3600000);

  // Validate
  if (isValidCursor(cursor)) {
    // Decode
    const decoded = decodeCursor(cursor);
    console.log('Offset:', decoded.offset);
  }
}

// Export examples for demonstration
export {
  exampleOffsetPagination,
  exampleCursorPagination,
  exampleComplexPagination,
  exampleWithExpiration,
  exampleValidation,
  listItemsEndpoint,
  securityBestPractices,
  securePagination,
  standaloneExample,
};
