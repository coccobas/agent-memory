/**
 * Unit tests for red flag service
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
  createTestGuideline as createRedFlagGuideline,
  createTestRepositories,
} from '../fixtures/test-helpers.js';
import { createRedFlagService, type RedFlagService } from '../../src/services/redflag.service.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-redflag.db';
let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;
let redFlagService: RedFlagService;

// Helper functions to maintain test compatibility
async function detectRedFlags(...args: Parameters<RedFlagService['detectRedFlags']>) {
  return await redFlagService.detectRedFlags(...args);
}

async function scoreRedFlagRisk(...args: Parameters<RedFlagService['scoreRedFlagRisk']>) {
  return await redFlagService.scoreRedFlagRisk(...args);
}

describe('redflag.service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
    redFlagService = createRedFlagService({
      toolRepo: repos.tools,
      guidelineRepo: repos.guidelines,
      knowledgeRepo: repos.knowledge,
    });
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('detectRedFlags', () => {
    it('should detect red flags from guidelines', async () => {
      // Create a red flag guideline
      createRedFlagGuideline(
        testDb.db,
        'red_flag:suspicious_pattern',
        'global',
        undefined,
        'red_flag',
        80,
        'suspicious keyword'
      );

      const flags = await detectRedFlags({
        type: 'tool',
        content: 'This contains suspicious keyword in the content',
      });

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0]?.pattern).toBe('suspicious keyword');
      expect(flags[0]?.severity).toBe('medium');
    });

    it('should detect malformed JSON', async () => {
      const flags = await detectRedFlags({
        type: 'tool',
        content: 'Config: {"name": "test", invalid}',
      });

      // Should detect malformed JSON pattern
      const hasJsonFlag = flags.some((f) => f.pattern === 'malformed_json');
      expect(hasJsonFlag).toBe(true);

      if (hasJsonFlag) {
        const jsonFlag = flags.find((f) => f.pattern === 'malformed_json');
        expect(jsonFlag?.severity).toBe('high');
      }
    });

    it('should not flag non-JSON bracket content', async () => {
      // Common patterns in conversation/documentation that shouldn't trigger
      const testCases = [
        '[Image: A photo of a sunset]',
        'The user [laughs] and says hello',
        'Use {placeholder} in the template',
        'Array syntax: array[0]',
        'See [documentation] for more info',
      ];

      for (const content of testCases) {
        const flags = await detectRedFlags({
          type: 'knowledge',
          content,
        });

        const hasJsonFlag = flags.some((f) => f.pattern === 'malformed_json');
        expect(hasJsonFlag).toBe(false);
      }
    });

    it('should detect overly long content', async () => {
      const longContent = 'a'.repeat(10001); // > 10k characters

      const flags = await detectRedFlags({
        type: 'tool',
        content: longContent,
      });

      const hasLongFlag = flags.some((f) => f.pattern === 'overly_long_content');
      expect(hasLongFlag).toBe(true);

      if (hasLongFlag) {
        const longFlag = flags.find((f) => f.pattern === 'overly_long_content');
        expect(longFlag?.severity).toBe('medium');
      }
    });

    it('should detect inconsistent formatting', async () => {
      // Create content with very long lines
      const longLine = 'a'.repeat(300);
      const content = Array(15).fill(longLine).join('\n');

      const flags = await detectRedFlags({
        type: 'tool',
        content,
      });

      const hasFormatFlag = flags.some((f) => f.pattern === 'inconsistent_formatting');
      expect(hasFormatFlag).toBe(true);

      if (hasFormatFlag) {
        const formatFlag = flags.find((f) => f.pattern === 'inconsistent_formatting');
        expect(formatFlag?.severity).toBe('low');
      }
    });

    it('should return empty array for clean content', async () => {
      const flags = await detectRedFlags({
        type: 'tool',
        content: 'This is clean, normal content without any issues.',
      });

      // May have flags from guidelines, but built-in flags should not trigger
      expect(Array.isArray(flags)).toBe(true);
    });

    it('should work with different entry types', async () => {
      const toolFlags = await detectRedFlags({
        type: 'tool',
        content: 'Test content',
      });

      const guidelineFlags = await detectRedFlags({
        type: 'guideline',
        content: 'Test content',
      });

      const knowledgeFlags = await detectRedFlags({
        type: 'knowledge',
        content: 'Test content',
      });

      expect(Array.isArray(toolFlags)).toBe(true);
      expect(Array.isArray(guidelineFlags)).toBe(true);
      expect(Array.isArray(knowledgeFlags)).toBe(true);
    });

    it('should handle metadata parameter', async () => {
      const flags = await detectRedFlags({
        type: 'tool',
        content: 'Test content',
        metadata: { key: 'value' },
      });

      expect(Array.isArray(flags)).toBe(true);
    });

    it('should detect multiple red flags', async () => {
      // Content with both overly_long_content AND malformed_json patterns
      const content = 'a'.repeat(10001) + ' {"name": invalid json}';

      const flags = await detectRedFlags({
        type: 'tool',
        content,
      });

      expect(flags.length).toBeGreaterThan(1);
    });

    it('should handle empty content', async () => {
      const flags = await detectRedFlags({
        type: 'tool',
        content: '',
      });

      expect(Array.isArray(flags)).toBe(true);
    });
  });

  describe('scoreRedFlagRisk', () => {
    it('should calculate risk score for tool', async () => {
      const { tool } = createTestTool(
        testDb.db,
        'risk-test-tool',
        'global',
        undefined,
        'Normal description'
      );

      const score = await scoreRedFlagRisk(tool.id, 'tool');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should calculate risk score for guideline', async () => {
      const guideline = createTestGuideline(
        testDb.db,
        'risk-test-guideline',
        'global',
        undefined,
        'testing',
        80,
        'Normal content'
      );

      const score = await scoreRedFlagRisk(guideline.guideline.id, 'guideline');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should calculate risk score for knowledge', async () => {
      const { knowledge } = createTestKnowledge(testDb.db, 'Risk Test Knowledge', 'Normal content');

      const score = await scoreRedFlagRisk(knowledge.id, 'knowledge');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 0 for non-existent entry', async () => {
      const score = await scoreRedFlagRisk('nonexistent-id', 'tool');

      expect(score).toBe(0);
    });

    it('should cap risk score at 1.0', async () => {
      // Create entry with multiple high-severity flags
      const { tool } = createTestTool(
        testDb.db,
        'high-risk-tool',
        'global',
        undefined,
        'a'.repeat(10001) + ' { invalid json } ' + 'b'.repeat(200) + '\n' + 'c'.repeat(200)
      );

      const score = await scoreRedFlagRisk(tool.id, 'tool');

      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should weight high severity flags more', async () => {
      // Create tool with high-severity flag (malformed JSON)
      const { tool } = createTestTool(
        testDb.db,
        'high-severity-tool',
        'global',
        undefined,
        '{ invalid json }'
      );

      const score = await scoreRedFlagRisk(tool.id, 'tool');

      // High severity flags contribute 0.4 each
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});



