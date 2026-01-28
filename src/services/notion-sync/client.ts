/**
 * Notion API Client Wrapper
 *
 * Provides a rate-limited, circuit-breaker-protected client for Notion API.
 * Features:
 * - Rate limiting: 3 requests per second (Notion's limit)
 * - Circuit breaker: Opens after 5 consecutive failures
 * - Retry logic: Exponential backoff with max 3 retries
 * - Pagination: Cursor-based pagination support
 */

import { Client, isNotionClientError, APIErrorCode } from '@notionhq/client';
import type {
  QueryDataSourceResponse,
  PageObjectResponse,
  PartialPageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  createServiceUnavailableError,
  RateLimitError,
  RetryExhaustedError,
} from '../../core/errors.js';

const logger = createComponentLogger('notion-client');

// =============================================================================
// CONSTANTS
// =============================================================================

/** Notion API rate limit: 3 requests per second */
const RATE_LIMIT_REQUESTS = 3;
/** Rate limit window in milliseconds */
const RATE_LIMIT_WINDOW_MS = 1000;
/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 3;
/** Initial retry delay in milliseconds (doubles each retry) */
const INITIAL_RETRY_DELAY_MS = 1000;
/** Default page size for database queries */
const DEFAULT_PAGE_SIZE = 100;
/** Circuit breaker failure threshold */
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
/** Circuit breaker reset timeout in milliseconds (1 minute) */
const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60000;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Rate limiter state using token bucket algorithm.
 */
interface RateLimiter {
  /** Available tokens for requests */
  tokens: number;
  /** Timestamp of last token refill */
  lastRefill: number;
}

/**
 * Simplified page result from Notion database query.
 */
export interface NotionPage {
  /** Page UUID */
  id: string;
  /** Page properties (varies by database schema) */
  properties: Record<string, unknown>;
  /** ISO timestamp of last edit */
  lastEditedTime: string;
}

/**
 * Paginated query result.
 */
export interface NotionQueryResult {
  /** Array of page results */
  results: NotionPage[];
  /** Whether more pages are available */
  hasMore: boolean;
  /** Cursor for next page (null if no more pages) */
  nextCursor: string | null;
}

/**
 * Client status information.
 */
export interface NotionClientStatus {
  /** Whether circuit breaker is open (blocking requests) */
  isOpen: boolean;
  /** Current consecutive failure count */
  failures: number;
}

// =============================================================================
// NOTION CLIENT
// =============================================================================

/**
 * Notion API client wrapper with rate limiting and circuit breaker protection.
 *
 * @example
 * ```typescript
 * const client = new NotionClient(process.env.NOTION_API_KEY!);
 *
 * // Query a database with pagination
 * const result = await client.queryDatabase('database-id');
 * console.log(result.results);
 *
 * // Query all pages (handles pagination automatically)
 * const allPages = await client.queryAllPages('database-id');
 * ```
 */
export class NotionClient {
  private client: Client;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  /**
   * Create a new Notion client.
   *
   * @param apiKey - Notion integration API key
   * @throws AgentMemoryError if API key is missing
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      throw createServiceUnavailableError('Notion', 'API key is required');
    }

    this.client = new Client({ auth: apiKey });
    this.circuitBreaker = new CircuitBreaker({
      name: 'notion-api',
      failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      resetTimeoutMs: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
      successThreshold: 2,
      isFailure: (error: Error) => {
        // Don't count client errors (4xx) as circuit breaker failures
        // Only count server errors and network issues
        if (isNotionClientError(error)) {
          const code = error.code;
          // Rate limit and server errors should trip the breaker
          return (
            code === APIErrorCode.RateLimited ||
            code === APIErrorCode.ServiceUnavailable ||
            code === APIErrorCode.InternalServerError
          );
        }
        // Network errors should trip the breaker
        return true;
      },
    });
    this.rateLimiter = {
      tokens: RATE_LIMIT_REQUESTS,
      lastRefill: Date.now(),
    };

    logger.debug('Notion client initialized');
  }

  /**
   * Wait for a rate limit token before making a request.
   * Uses token bucket algorithm to enforce 3 requests/second.
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    // Refill tokens based on elapsed time
    if (elapsed >= RATE_LIMIT_WINDOW_MS) {
      this.rateLimiter.tokens = RATE_LIMIT_REQUESTS;
      this.rateLimiter.lastRefill = now;
    }

    if (this.rateLimiter.tokens <= 0) {
      const waitTime = RATE_LIMIT_WINDOW_MS - elapsed;
      logger.debug({ waitTime }, 'Rate limiting: waiting for token');
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.rateLimiter.tokens = RATE_LIMIT_REQUESTS;
      this.rateLimiter.lastRefill = Date.now();
    }

    this.rateLimiter.tokens--;
  }

  /**
   * Execute a request with retry logic and exponential backoff.
   *
   * @param operation - Async operation to execute
   * @param retryCount - Current retry attempt (internal use)
   * @returns Result of the operation
   * @throws RetryExhaustedError if all retries fail
   */
  private async executeWithRetry<T>(operation: () => Promise<T>, retryCount = 0): Promise<T> {
    try {
      await this.waitForRateLimit();
      return await operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (isNotionClientError(error)) {
        // Handle rate limit (429)
        if (error.code === APIErrorCode.RateLimited) {
          // Parse Retry-After header if available
          const retryAfterHeader = (error as { headers?: Record<string, string> }).headers?.[
            'retry-after'
          ];
          const retryAfter = retryAfterHeader
            ? parseInt(retryAfterHeader, 10) * 1000
            : INITIAL_RETRY_DELAY_MS;

          logger.warn({ retryAfter, retryCount }, 'Rate limited by Notion API');

          if (retryCount < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            return this.executeWithRetry(operation, retryCount + 1);
          }

          throw new RateLimitError(retryAfter);
        }

        // Retry on server errors (503, 500)
        if (
          (error.code === APIErrorCode.ServiceUnavailable ||
            error.code === APIErrorCode.InternalServerError) &&
          retryCount < MAX_RETRIES
        ) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
          logger.warn({ delay, retryCount, code: error.code }, 'Notion API error, retrying');
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.executeWithRetry(operation, retryCount + 1);
        }
      }

      // Check for network/timeout errors that should be retried
      const errorMessage = err.message.toLowerCase();
      const isNetworkError =
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('socket');

      if (isNetworkError && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        logger.warn({ delay, retryCount, error: err.message }, 'Network error, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retryCount + 1);
      }

      // If we've exhausted retries, throw RetryExhaustedError
      if (retryCount >= MAX_RETRIES) {
        throw new RetryExhaustedError('notion-query', retryCount + 1, err);
      }

      throw error;
    }
  }

  /**
   * Convert Notion API page response to simplified NotionPage.
   */
  private toNotionPage(page: PageObjectResponse | PartialPageObjectResponse): NotionPage {
    return {
      id: page.id,
      properties: 'properties' in page ? (page.properties as Record<string, unknown>) : {},
      lastEditedTime: 'last_edited_time' in page ? page.last_edited_time : '',
    };
  }

  /**
   * Query a Notion database with pagination support.
   *
   * @param databaseId - UUID of the Notion database
   * @param filter - Optional filter object (Notion filter format)
   * @param startCursor - Optional cursor for pagination
   * @returns Paginated query result
   * @throws CircuitBreakerError if circuit is open
   * @throws RetryExhaustedError if all retries fail
   *
   * @example
   * ```typescript
   * // Simple query
   * const result = await client.queryDatabase('db-id');
   *
   * // With filter
   * const result = await client.queryDatabase('db-id', {
   *   property: 'Status',
   *   select: { equals: 'Active' }
   * });
   *
   * // With pagination
   * let cursor: string | undefined;
   * do {
   *   const result = await client.queryDatabase('db-id', undefined, cursor);
   *   processPages(result.results);
   *   cursor = result.nextCursor ?? undefined;
   * } while (cursor);
   * ```
   */
  async queryDatabase(
    databaseId: string,
    filter?: object,
    startCursor?: string
  ): Promise<NotionQueryResult> {
    return this.circuitBreaker.execute(async () => {
      return this.executeWithRetry(async () => {
        logger.debug({ databaseId, hasFilter: !!filter, startCursor }, 'Querying Notion database');

        const queryParams: {
          data_source_id: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter?: any;
          start_cursor?: string;
          page_size: number;
        } = {
          data_source_id: databaseId,
          filter: filter,
          start_cursor: startCursor,
          page_size: DEFAULT_PAGE_SIZE,
        };
        const response: QueryDataSourceResponse = await this.client.dataSources.query(queryParams);

        const results = response.results
          .filter(
            (item): item is PageObjectResponse | PartialPageObjectResponse =>
              'properties' in item || item.object === 'page'
          )
          .map((page) => this.toNotionPage(page));

        logger.debug(
          {
            databaseId,
            resultCount: results.length,
            hasMore: response.has_more,
          },
          'Database query completed'
        );

        return {
          results,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      });
    });
  }

  /**
   * Query all pages from a Notion database (handles pagination automatically).
   *
   * @param databaseId - UUID of the Notion database
   * @param filter - Optional filter object (Notion filter format)
   * @returns Array of all pages matching the query
   * @throws CircuitBreakerError if circuit is open
   * @throws RetryExhaustedError if all retries fail
   *
   * @example
   * ```typescript
   * const allPages = await client.queryAllPages('db-id');
   * console.log(`Found ${allPages.length} pages`);
   * ```
   */
  async queryAllPages(databaseId: string, filter?: object): Promise<NotionPage[]> {
    const allResults: NotionPage[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.queryDatabase(databaseId, filter, cursor);
      allResults.push(...response.results);
      cursor = response.nextCursor ?? undefined;
    } while (cursor);

    logger.debug({ databaseId, totalPages: allResults.length }, 'Fetched all pages from database');

    return allResults;
  }

  /**
   * Get the current status of the client.
   *
   * @returns Status object with circuit breaker state
   */
  getStatus(): NotionClientStatus {
    const stats = this.circuitBreaker.getStats();
    return {
      isOpen: this.circuitBreaker.isOpen(),
      failures: stats.failures,
    };
  }

  /**
   * Force close the circuit breaker (for testing/admin).
   */
  forceCloseCircuit(): void {
    this.circuitBreaker.forceClose();
    logger.info('Circuit breaker force closed');
  }

  /**
   * Force open the circuit breaker (for testing/admin).
   */
  forceOpenCircuit(): void {
    this.circuitBreaker.forceOpen();
    logger.info('Circuit breaker force opened');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Notion client from environment variable.
 *
 * @returns Configured NotionClient instance
 * @throws AgentMemoryError if NOTION_API_KEY is not set
 *
 * @example
 * ```typescript
 * const client = createNotionClient();
 * const pages = await client.queryAllPages('database-id');
 * ```
 */
export function createNotionClient(): NotionClient {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw createServiceUnavailableError(
      'Notion',
      'NOTION_API_KEY environment variable is required'
    );
  }
  return new NotionClient(apiKey);
}
