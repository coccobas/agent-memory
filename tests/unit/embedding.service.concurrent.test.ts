import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { pipelineMock } = vi.hoisted(() => ({
  pipelineMock: vi.fn(),
}));

vi.mock('@xenova/transformers', () => ({
  pipeline: pipelineMock,
}));

describe('EmbeddingService concurrency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = 'local';
    delete process.env.AGENT_MEMORY_OPENAI_API_KEY;

    pipelineMock.mockImplementation(async () => {
      return async () => ({ data: new Float32Array(384).fill(0.5) });
    });
  });

  afterEach(() => {
    delete process.env.AGENT_MEMORY_EMBEDDING_PROVIDER;
    delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
    vi.resetModules();
  });

  it('loads the local pipeline only once under concurrency', async () => {
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();

    const { resetEmbeddingService, getEmbeddingService } =
      await import('../../src/services/embedding.service.js');

    resetEmbeddingService();
    const service = getEmbeddingService();

    await Promise.all(Array.from({ length: 20 }, () => service.embed('hello world')));

    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });
});
