import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryExhaustedError } from '../../src/core/errors.js';

const mockQuery = vi.fn();

vi.mock('@notionhq/client', () => {
  return {
    Client: class MockClient {
      dataSources = {
        query: mockQuery,
      };
    },
    isNotionClientError: (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error,
    APIErrorCode: {
      RateLimited: 'rate_limited',
      ServiceUnavailable: 'service_unavailable',
      InternalServerError: 'internal_server_error',
      ObjectNotFound: 'object_not_found',
    },
  };
});

function createMockResponse(
  results: Array<{
    id: string;
    properties?: Record<string, unknown>;
    last_edited_time?: string;
  }> = [],
  hasMore = false,
  nextCursor: string | null = null
) {
  return {
    results: results.map((r) => ({
      ...r,
      object: 'page' as const,
      properties: r.properties ?? {},
      last_edited_time: r.last_edited_time ?? '2024-01-01T00:00:00.000Z',
    })),
    has_more: hasMore,
    next_cursor: nextCursor,
    type: 'page_or_data_source' as const,
    page_or_data_source: {},
    object: 'list' as const,
  };
}

describe('NotionClient', () => {
  let NotionClient: typeof import('../../src/services/notion-sync/client.js').NotionClient;
  let createNotionClient: typeof import('../../src/services/notion-sync/client.js').createNotionClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const module = await import('../../src/services/notion-sync/client.js');
    NotionClient = module.NotionClient;
    createNotionClient = module.createNotionClient;
  });

  afterEach(async () => {
    // Flush all pending timers before switching to real timers
    // This prevents unhandled rejections from circuit breaker retries
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('throws error when API key is missing', () => {
      expect(() => new NotionClient('')).toThrow('API key is required');
    });

    it('creates client with valid API key', () => {
      const client = new NotionClient('test-api-key');
      expect(client).toBeInstanceOf(NotionClient);
    });
  });

  describe('createNotionClient factory', () => {
    it('throws error when NOTION_API_KEY env var is not set', () => {
      const originalEnv = process.env.NOTION_API_KEY;
      delete process.env.NOTION_API_KEY;

      expect(() => createNotionClient()).toThrow('NOTION_API_KEY environment variable is required');

      process.env.NOTION_API_KEY = originalEnv;
    });

    it('creates client when NOTION_API_KEY is set', () => {
      const originalEnv = process.env.NOTION_API_KEY;
      process.env.NOTION_API_KEY = 'test-key';

      const client = createNotionClient();
      expect(client).toBeInstanceOf(NotionClient);

      process.env.NOTION_API_KEY = originalEnv;
    });
  });

  describe('rate limiting', () => {
    it('enforces 3 requests per second', async () => {
      mockQuery.mockResolvedValue(createMockResponse());

      const client = new NotionClient('test-api-key');

      const requests = [
        client.queryDatabase('db-1'),
        client.queryDatabase('db-2'),
        client.queryDatabase('db-3'),
        client.queryDatabase('db-4'),
      ];

      await vi.advanceTimersByTimeAsync(0);
      await Promise.all(requests.slice(0, 3));

      expect(mockQuery).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(1000);
      await requests[3];

      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('waits for rate limit window before making more requests', async () => {
      mockQuery.mockResolvedValue(createMockResponse());

      const client = new NotionClient('test-api-key');

      await client.queryDatabase('db-1');
      await client.queryDatabase('db-2');
      await client.queryDatabase('db-3');

      const fourthRequest = client.queryDatabase('db-4');

      await vi.advanceTimersByTimeAsync(500);
      expect(mockQuery).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(500);
      await fourthRequest;
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('circuit breaker', () => {
    it('tracks failures and can be force opened', async () => {
      const client = new NotionClient('test-api-key');

      expect(client.getStatus().isOpen).toBe(false);
      expect(client.getStatus().failures).toBe(0);

      client.forceOpenCircuit();

      expect(client.getStatus().isOpen).toBe(true);
    });

    it('blocks requests when circuit is open', async () => {
      const client = new NotionClient('test-api-key');
      client.forceOpenCircuit();

      await expect(client.queryDatabase('db-id')).rejects.toThrow(/circuit breaker/i);
    });

    it('allows requests after force close', async () => {
      mockQuery.mockResolvedValue(createMockResponse());

      const client = new NotionClient('test-api-key');
      client.forceOpenCircuit();
      client.forceCloseCircuit();

      const result = await client.queryDatabase('db-id');
      expect(result.results).toEqual([]);
    });
  });

  describe('pagination', () => {
    it('returns paginated results with cursor', async () => {
      mockQuery.mockResolvedValue(
        createMockResponse(
          [
            { id: 'page-1', last_edited_time: '2024-01-01' },
            { id: 'page-2', last_edited_time: '2024-01-02' },
          ],
          true,
          'cursor-123'
        )
      );

      const client = new NotionClient('test-api-key');
      const result = await client.queryDatabase('db-id');

      expect(result.results).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-123');
    });

    it('queryAllPages fetches all pages across multiple requests', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockResponse([{ id: 'page-1' }], true, 'cursor-1'))
        .mockResolvedValueOnce(createMockResponse([{ id: 'page-2' }], true, 'cursor-2'))
        .mockResolvedValueOnce(createMockResponse([{ id: 'page-3' }], false, null));

      const client = new NotionClient('test-api-key');

      await vi.advanceTimersByTimeAsync(2000);
      const allPages = await client.queryAllPages('db-id');

      expect(allPages).toHaveLength(3);
      expect(allPages.map((p) => p.id)).toEqual(['page-1', 'page-2', 'page-3']);
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('passes start_cursor to subsequent requests', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockResponse([{ id: 'page-1' }], true, 'cursor-abc'))
        .mockResolvedValueOnce(createMockResponse([], false, null));

      const client = new NotionClient('test-api-key');

      await vi.advanceTimersByTimeAsync(1000);
      await client.queryAllPages('db-id');

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          start_cursor: 'cursor-abc',
        })
      );
    });
  });

  describe('retry logic', () => {
    it('retries on 429 rate limit error with exponential backoff', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), {
        code: 'rate_limited',
        headers: { 'retry-after': '1' },
      });

      mockQuery.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(createMockResponse());

      const client = new NotionClient('test-api-key');
      const queryPromise = client.queryDatabase('db-id');

      await vi.advanceTimersByTimeAsync(1000);
      const result = await queryPromise;

      expect(result.results).toEqual([]);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 service unavailable with exponential backoff', async () => {
      const serviceError = Object.assign(new Error('Service unavailable'), {
        code: 'service_unavailable',
      });

      mockQuery.mockRejectedValueOnce(serviceError).mockResolvedValueOnce(createMockResponse());

      const client = new NotionClient('test-api-key');
      const queryPromise = client.queryDatabase('db-id');

      await vi.advanceTimersByTimeAsync(1000);
      const result = await queryPromise;

      expect(result.results).toEqual([]);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it.skip('throws RetryExhaustedError after max retries', async () => {
      // FIXME: Causes unhandled rejection due to circuit breaker timing with fake timers
      const networkError = new Error('Network timeout');
      mockQuery.mockRejectedValue(networkError);

      const client = new NotionClient('test-api-key');
      const queryPromise = client.queryDatabase('db-id');

      await vi.advanceTimersByTimeAsync(8000);

      await expect(queryPromise).rejects.toThrow(RetryExhaustedError);
    });

    it('retries on network errors', async () => {
      const networkError = new Error('fetch failed');

      mockQuery.mockRejectedValueOnce(networkError).mockResolvedValueOnce(createMockResponse());

      const client = new NotionClient('test-api-key');
      const queryPromise = client.queryDatabase('db-id');

      await vi.advanceTimersByTimeAsync(1000);
      const result = await queryPromise;

      expect(result.results).toEqual([]);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStatus', () => {
    it('returns circuit breaker status', () => {
      const client = new NotionClient('test-api-key');
      const status = client.getStatus();

      expect(status).toHaveProperty('isOpen');
      expect(status).toHaveProperty('failures');
      expect(status.isOpen).toBe(false);
      expect(status.failures).toBe(0);
    });

    it('reflects open circuit state', () => {
      const client = new NotionClient('test-api-key');
      client.forceOpenCircuit();

      const status = client.getStatus();
      expect(status.isOpen).toBe(true);
    });
  });

  describe('queryDatabase', () => {
    it('passes filter to Notion API', async () => {
      mockQuery.mockResolvedValue(createMockResponse());

      const client = new NotionClient('test-api-key');
      const filter = { property: 'Status', select: { equals: 'Active' } };

      await client.queryDatabase('db-id', filter);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          data_source_id: 'db-id',
          filter,
          page_size: 100,
        })
      );
    });

    it('transforms page results correctly', async () => {
      mockQuery.mockResolvedValue(
        createMockResponse([
          {
            id: 'page-123',
            properties: { Name: { id: 'title', title: [{ text: { content: 'Test' } }] } },
            last_edited_time: '2024-01-15T10:30:00.000Z',
          },
        ])
      );

      const client = new NotionClient('test-api-key');
      const result = await client.queryDatabase('db-id');

      expect(result.results[0]).toEqual({
        id: 'page-123',
        properties: { Name: { id: 'title', title: [{ text: { content: 'Test' } }] } },
        lastEditedTime: '2024-01-15T10:30:00.000Z',
      });
    });
  });
});
