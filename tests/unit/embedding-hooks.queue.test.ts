import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { embedMock, storeEmbeddingMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  storeEmbeddingMock: vi.fn(),
}));

vi.mock('../../src/services/embedding.service.js', () => ({
  getEmbeddingService: () => ({
    isAvailable: () => true,
    embed: embedMock,
  }),
}));

vi.mock('../../src/services/vector.service.js', () => ({
  getVectorService: () => ({
    storeEmbedding: storeEmbeddingMock,
  }),
}));

vi.mock('../../src/db/connection.js', () => {
  const dbStub = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => undefined,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: () => undefined,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        run: () => undefined,
      }),
    }),
  };

  return { getDb: () => dbStub };
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(fn: () => void, timeoutMs = 2000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await sleep(5);
    }
  }
}

describe('Embedding job queue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY = '2';
    embedMock.mockReset();
    storeEmbeddingMock.mockReset();
  });

  afterEach(() => {
    delete process.env.AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY;
    vi.resetModules();
  });

  it('limits concurrency and skips stale jobs for the same entry', async () => {
    let embedInFlight = 0;
    let embedMax = 0;

    embedMock.mockImplementation(async (text: string) => {
      embedInFlight += 1;
      embedMax = Math.max(embedMax, embedInFlight);
      await sleep(30);
      embedInFlight -= 1;
      return { embedding: Array(384).fill(0.1), model: 'm', provider: 'local' as const };
    });

    storeEmbeddingMock.mockImplementation(async () => {
      await sleep(5);
    });

    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();

    const { generateEmbeddingAsync, resetEmbeddingQueueForTests } =
      await import('../../src/db/repositories/embedding-hooks.js');
    resetEmbeddingQueueForTests();

    // Two rapid updates for the same entry; only the last one should be persisted.
    generateEmbeddingAsync({
      entryType: 'tool',
      entryId: 'same',
      versionId: 'v1',
      text: 'old',
    });
    generateEmbeddingAsync({
      entryType: 'tool',
      entryId: 'same',
      versionId: 'v2',
      text: 'new',
    });

    // Plus a few other entries to exercise concurrency.
    for (let i = 0; i < 6; i++) {
      generateEmbeddingAsync({
        entryType: 'tool',
        entryId: `e-${i}`,
        versionId: 'v1',
        text: `t-${i}`,
      });
    }

    await waitUntil(() => expect(storeEmbeddingMock).toHaveBeenCalledTimes(7));

    // Concurrency should be limited to 2.
    expect(embedMax).toBeLessThanOrEqual(2);

    // The stale job should not have been persisted (only v2 should be stored for "same").
    const sameCalls = storeEmbeddingMock.mock.calls.filter((c) => c[1] === 'same');
    expect(sameCalls.length).toBe(1);
    expect(sameCalls[0]?.[2]).toBe('v2');
  });
});
