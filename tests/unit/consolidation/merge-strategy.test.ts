import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MergeStrategy } from '../../../src/services/consolidation/strategies/merge.strategy.js';
import type { SimilarityGroup } from '../../../src/services/consolidation/types.js';
import type { IExtractionService } from '../../../src/core/context.js';
import * as helpers from '../../../src/services/consolidation/helpers.js';

vi.mock('../../../src/services/consolidation/helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof helpers>();
  return {
    ...actual,
    getEntryDetails: vi.fn(),
    updateEntryContent: vi.fn(),
    batchDeactivateEntries: vi.fn(),
    createConsolidationRelation: vi.fn(),
  };
});

describe('MergeStrategy', () => {
  const mockDb = {} as Parameters<MergeStrategy['execute']>[2];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockGroup = (): SimilarityGroup => ({
    primaryId: 'primary-1',
    entryType: 'guideline',
    members: [
      { id: 'member-1', name: 'Member 1', similarity: 0.9 },
      { id: 'member-2', name: 'Member 2', similarity: 0.85 },
    ],
  });

  describe('without extraction service (heuristic fallback)', () => {
    it('should merge content using heuristic approach', async () => {
      const strategy = new MergeStrategy();
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        {
          id: 'primary-1',
          name: 'Primary',
          content: 'Always use TypeScript strict mode.',
          createdAt: '2024-01-01',
        },
        {
          id: 'member-1',
          name: 'Member 1',
          content: 'Enable strict mode in TypeScript.',
          createdAt: '2024-01-02',
        },
        {
          id: 'member-2',
          name: 'Member 2',
          content: 'Use strict null checks for type safety.',
          createdAt: '2024-01-03',
        },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
      expect(result.entriesMerged).toBe(2);
      expect(result.entriesDeactivated).toBe(2);
      expect(helpers.updateEntryContent).toHaveBeenCalledOnce();
      expect(helpers.batchDeactivateEntries).toHaveBeenCalledWith(
        'guideline',
        ['member-1', 'member-2'],
        mockDb
      );
    });

    it('should handle missing primary entry gracefully', async () => {
      const strategy = new MergeStrategy();
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'member-1', name: 'Member 1', content: 'Content 1', createdAt: '2024-01-02' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('with extraction service (LLM-enhanced)', () => {
    const createMockExtractionService = (
      available: boolean,
      response?: string
    ): IExtractionService => ({
      isAvailable: () => available,
      extract: vi.fn().mockResolvedValue({
        entries: response ? [{ content: response }] : [],
        confidence: 0.8,
        duplicatesFiltered: 0,
      }),
    });

    it('should use LLM to synthesize merged content when available', async () => {
      const mockExtraction = createMockExtractionService(
        true,
        JSON.stringify({
          merged_content:
            'TypeScript strict mode should always be enabled. This includes strict null checks for improved type safety.',
          key_points: ['strict mode', 'null checks', 'type safety'],
        })
      );

      const strategy = new MergeStrategy({ extractionService: mockExtraction });
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        {
          id: 'primary-1',
          name: 'Primary',
          content: 'Always use TypeScript strict mode.',
          createdAt: '2024-01-01',
        },
        {
          id: 'member-1',
          name: 'Member 1',
          content: 'Enable strict mode in TypeScript.',
          createdAt: '2024-01-02',
        },
        {
          id: 'member-2',
          name: 'Member 2',
          content: 'Use strict null checks for type safety.',
          createdAt: '2024-01-03',
        },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
      expect(mockExtraction.extract).toHaveBeenCalledOnce();

      const extractCall = vi.mocked(mockExtraction.extract).mock.calls[0][0];
      expect(extractCall.context).toContain('Always use TypeScript strict mode');
      expect(extractCall.context).toContain('Enable strict mode');
    });

    it('should fall back to heuristics when LLM is unavailable', async () => {
      const mockExtraction = createMockExtractionService(false);

      const strategy = new MergeStrategy({ extractionService: mockExtraction });
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'primary-1', name: 'Primary', content: 'Content A.', createdAt: '2024-01-01' },
        { id: 'member-1', name: 'Member 1', content: 'Content B.', createdAt: '2024-01-02' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
      expect(mockExtraction.extract).not.toHaveBeenCalled();
    });

    it('should fall back to heuristics when LLM returns invalid JSON', async () => {
      const mockExtraction = createMockExtractionService(true, 'Invalid response');

      const strategy = new MergeStrategy({ extractionService: mockExtraction });
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'primary-1', name: 'Primary', content: 'Content A.', createdAt: '2024-01-01' },
        { id: 'member-1', name: 'Member 1', content: 'Content B.', createdAt: '2024-01-02' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
      expect(helpers.updateEntryContent).toHaveBeenCalledOnce();
    });

    it('should fall back to heuristics when LLM throws an error', async () => {
      const mockExtraction: IExtractionService = {
        isAvailable: () => true,
        extract: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
      };

      const strategy = new MergeStrategy({ extractionService: mockExtraction });
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'primary-1', name: 'Primary', content: 'Content A.', createdAt: '2024-01-01' },
        { id: 'member-1', name: 'Member 1', content: 'Content B.', createdAt: '2024-01-02' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty member contents', async () => {
      const strategy = new MergeStrategy();
      const group = createMockGroup();

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'primary-1', name: 'Primary', content: 'Primary content.', createdAt: '2024-01-01' },
        { id: 'member-1', name: 'Member 1', content: '', createdAt: '2024-01-02' },
        { id: 'member-2', name: 'Member 2', content: '', createdAt: '2024-01-03' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
    });

    it('should handle single member group', async () => {
      const strategy = new MergeStrategy();
      const group: SimilarityGroup = {
        primaryId: 'primary-1',
        entryType: 'knowledge',
        members: [{ id: 'member-1', name: 'Member 1', similarity: 0.9 }],
      };

      vi.mocked(helpers.getEntryDetails).mockReturnValue([
        { id: 'primary-1', name: 'Primary', content: 'Primary content.', createdAt: '2024-01-01' },
        { id: 'member-1', name: 'Member 1', content: 'Member content.', createdAt: '2024-01-02' },
      ]);

      const result = await strategy.execute(group, 'test-user', mockDb);

      expect(result.success).toBe(true);
      expect(result.entriesMerged).toBe(1);
    });
  });
});
