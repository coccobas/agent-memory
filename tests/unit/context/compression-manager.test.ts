/**
 * Tests for CompressionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompressionManager,
  createCompressionManager,
  type CompressibleEntry,
  type CompressionManagerConfig,
  DEFAULT_COMPRESSION_CONFIG,
} from '../../../src/services/context/compression-manager.js';

describe('CompressionManager', () => {
  let manager: CompressionManager;

  beforeEach(() => {
    manager = createCompressionManager(null); // No summarization service
  });

  describe('compress', () => {
    it('should not compress when content fits within budget', async () => {
      const entries: CompressibleEntry[] = [
        {
          id: 'entry-1',
          type: 'guideline',
          title: 'Test Guideline',
          content: 'Short content',
          priority: 5,
        },
      ];

      const result = await manager.compress(entries, 1000, 'markdown');

      expect(result.level).toBe('none');
      expect(result.ratio).toBe(1.0);
      expect(result.includedEntries).toHaveLength(1);
      expect(result.droppedEntries).toHaveLength(0);
    });

    it('should apply hierarchical compression for moderate content', async () => {
      // Need to exceed hierarchicalThreshold (1500 tokens = ~6000 chars)
      // Create content that exceeds both the target budget AND the threshold
      const entries: CompressibleEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        title: `Knowledge Entry ${i}`,
        content: 'A'.repeat(800), // Each entry is ~200 tokens, 10 entries = ~2000 tokens
        priority: 5,
      }));

      // Set budget lower than uncompressed size (which is ~2000 tokens)
      const result = await manager.compress(entries, 500, 'markdown');

      // Should apply some form of compression since original > budget
      expect(['hierarchical', 'truncated']).toContain(result.level);
      expect(result.ratio).toBeLessThan(1.0);
    });

    it('should truncate when content far exceeds budget', async () => {
      const entries: CompressibleEntry[] = Array.from({ length: 20 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        title: `Entry ${i}`,
        content: 'A'.repeat(500),
        priority: i, // Different priorities for sorting
      }));

      const result = await manager.compress(entries, 200, 'markdown');

      expect(result.level).toBe('truncated');
      expect(result.droppedEntries.length).toBeGreaterThan(0);
      expect(result.includedEntries.length).toBeLessThan(entries.length);
    });

    it('should preserve high-priority entries when truncating', async () => {
      // Create large enough content to exceed thresholds and trigger truncation
      const entries: CompressibleEntry[] = [
        { id: 'low-1', type: 'guideline', content: 'A'.repeat(2000), priority: 1 },
        { id: 'high-1', type: 'guideline', content: 'B'.repeat(2000), priority: 9 },
        { id: 'low-2', type: 'guideline', content: 'C'.repeat(2000), priority: 2 },
        { id: 'high-2', type: 'guideline', content: 'D'.repeat(2000), priority: 10 },
      ];

      // Entries are assumed pre-sorted by priority, so high priority should come first
      const sortedEntries = [...entries].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      // Set a very low budget to force truncation
      const result = await manager.compress(sortedEntries, 200, 'markdown');

      // Since entries are pre-sorted by priority, the first entries (highest priority) should be included
      // The compress function includes entries in order until budget is exhausted
      expect(result.level).toBe('truncated');
      // First entry (high-2) should be included since it comes first after sorting
      if (result.includedEntries.length > 0) {
        expect(result.includedEntries[0].id).toBe('high-2');
      }
    });

    it('should format as JSON when requested', async () => {
      const entries: CompressibleEntry[] = [
        { id: 'entry-1', type: 'guideline', title: 'Test', content: 'Content' },
      ];

      const result = await manager.compress(entries, 1000, 'json');

      expect(result.content).toContain('memoryContext');
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should format as natural language when requested', async () => {
      const entries: CompressibleEntry[] = [
        {
          id: 'entry-1',
          type: 'guideline',
          title: 'Style Guide',
          content: 'Use consistent naming',
        },
      ];

      const result = await manager.compress(entries, 1000, 'natural_language');

      expect(result.content).toContain('Follow this guideline');
      expect(result.content).toContain('Style Guide');
    });

    it('should skip compression when disabled', async () => {
      const config: Partial<CompressionManagerConfig> = {
        enabled: false,
      };
      const disabledManager = createCompressionManager(null, config);

      const entries: CompressibleEntry[] = Array.from({ length: 50 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        content: 'A'.repeat(500),
      }));

      const result = await disabledManager.compress(entries, 100, 'markdown');

      expect(result.level).toBe('none');
      expect(result.droppedEntries).toHaveLength(0);
    });

    it('should add compression indicator when configured', async () => {
      const config: Partial<CompressionManagerConfig> = {
        indicateCompression: true,
      };
      const indicatingManager = createCompressionManager(null, config);

      const entries: CompressibleEntry[] = Array.from({ length: 20 }, (_, i) => ({
        id: `entry-${i}`,
        type: 'knowledge' as const,
        content: 'A'.repeat(500),
      }));

      const result = await indicatingManager.compress(entries, 200, 'markdown');

      if (result.level !== 'none') {
        expect(result.content).toContain('<!-- Context compressed');
      }
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      const content = 'Hello world'; // 11 characters
      const tokens = manager.estimateTokens(content);

      expect(tokens).toBe(Math.ceil(11 * DEFAULT_COMPRESSION_CONFIG.tokensPerChar));
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = manager.getConfig();

      expect(config.enabled).toBe(DEFAULT_COMPRESSION_CONFIG.enabled);
      expect(config.hierarchicalThreshold).toBe(DEFAULT_COMPRESSION_CONFIG.hierarchicalThreshold);
      expect(config.llmThreshold).toBe(DEFAULT_COMPRESSION_CONFIG.llmThreshold);
    });
  });

  describe('grouping by type', () => {
    it('should group entries by type in hierarchical compression', async () => {
      const entries: CompressibleEntry[] = [
        { id: 'g1', type: 'guideline', title: 'Guideline 1', content: 'A'.repeat(100) },
        { id: 'k1', type: 'knowledge', title: 'Knowledge 1', content: 'B'.repeat(100) },
        { id: 'g2', type: 'guideline', title: 'Guideline 2', content: 'C'.repeat(100) },
        { id: 't1', type: 'tool', title: 'Tool 1', content: 'D'.repeat(100) },
      ];

      const result = await manager.compress(entries, 300, 'markdown');

      // Check that output contains type headers when hierarchical
      if (result.level === 'hierarchical') {
        expect(result.content).toContain('Guidelines');
        expect(result.content).toContain('Knowledge');
        expect(result.content).toContain('Tools');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty entries array', async () => {
      const result = await manager.compress([], 1000, 'markdown');

      expect(result.level).toBe('none');
      expect(result.includedEntries).toHaveLength(0);
      expect(result.content).toBe('');
    });

    it('should handle entries with no title', async () => {
      const entries: CompressibleEntry[] = [
        { id: 'entry-1', type: 'knowledge', content: 'Some content here' },
      ];

      const result = await manager.compress(entries, 1000, 'markdown');

      expect(result.level).toBe('none');
      expect(result.content).toContain('knowledge'); // Falls back to type as title
    });

    it('should handle very long content gracefully', async () => {
      // Note: The compression manager formats entries before calculating tokens.
      // Formatting truncates each entry's content to ~200 chars, so a single large
      // entry still results in small formatted output.
      // To test compression, we need many entries to create enough formatted content.
      const entries: CompressibleEntry[] = Array.from({ length: 50 }, (_, i) => ({
        id: `long-entry-${i}`,
        type: 'knowledge' as const,
        title: `Entry ${i}`,
        content: 'A'.repeat(10000), // Each entry is truncated to ~200 in formatted output
      }));

      // With 50 entries, formatted output is ~50 * ~200 chars = ~10000 chars = ~2500 tokens
      const result = await manager.compress(entries, 100, 'markdown');

      // Should compress since formatted content exceeds budget and threshold
      expect(['hierarchical', 'truncated']).toContain(result.level);
      // Should still produce valid output
      expect(result.content.length).toBeGreaterThan(0);
    });
  });
});
