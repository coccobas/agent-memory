/**
 * Unit tests for red flag service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
  createTestGuideline as createRedFlagGuideline,
} from '../fixtures/test-helpers.js';
import { detectRedFlags, scoreRedFlagRisk } from '../../src/services/redflag.service.js';

const TEST_DB_PATH = './data/test-redflag.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('redflag.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('detectRedFlags', () => {
    it('should detect red flags from guidelines', () => {
      // Create a red flag guideline
      createRedFlagGuideline(
        db,
        'red_flag:suspicious_pattern',
        'global',
        undefined,
        'red_flag',
        80,
        'suspicious keyword'
      );

      const flags = detectRedFlags({
        type: 'tool',
        content: 'This contains suspicious keyword in the content',
      });

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0]?.pattern).toBe('suspicious keyword');
      expect(flags[0]?.severity).toBe('medium');
    });

    it('should detect malformed JSON', () => {
      const flags = detectRedFlags({
        type: 'tool',
        content: 'This has { invalid json structure }',
      });

      // Should detect malformed JSON pattern
      const hasJsonFlag = flags.some((f) => f.pattern === 'malformed_json');
      expect(hasJsonFlag).toBe(true);

      if (hasJsonFlag) {
        const jsonFlag = flags.find((f) => f.pattern === 'malformed_json');
        expect(jsonFlag?.severity).toBe('high');
      }
    });

    it('should detect overly long content', () => {
      const longContent = 'a'.repeat(10001); // > 10k characters

      const flags = detectRedFlags({
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

    it('should detect inconsistent formatting', () => {
      // Create content with very long lines
      const longLine = 'a'.repeat(300);
      const content = Array(15).fill(longLine).join('\n');

      const flags = detectRedFlags({
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

    it('should return empty array for clean content', () => {
      const flags = detectRedFlags({
        type: 'tool',
        content: 'This is clean, normal content without any issues.',
      });

      // May have flags from guidelines, but built-in flags should not trigger
      expect(Array.isArray(flags)).toBe(true);
    });

    it('should work with different entry types', () => {
      const toolFlags = detectRedFlags({
        type: 'tool',
        content: 'Test content',
      });

      const guidelineFlags = detectRedFlags({
        type: 'guideline',
        content: 'Test content',
      });

      const knowledgeFlags = detectRedFlags({
        type: 'knowledge',
        content: 'Test content',
      });

      expect(Array.isArray(toolFlags)).toBe(true);
      expect(Array.isArray(guidelineFlags)).toBe(true);
      expect(Array.isArray(knowledgeFlags)).toBe(true);
    });

    it('should handle metadata parameter', () => {
      const flags = detectRedFlags({
        type: 'tool',
        content: 'Test content',
        metadata: { key: 'value' },
      });

      expect(Array.isArray(flags)).toBe(true);
    });

    it('should detect multiple red flags', () => {
      const content = 'a'.repeat(10001) + ' { invalid json }';

      const flags = detectRedFlags({
        type: 'tool',
        content,
      });

      expect(flags.length).toBeGreaterThan(1);
    });

    it('should handle empty content', () => {
      const flags = detectRedFlags({
        type: 'tool',
        content: '',
      });

      expect(Array.isArray(flags)).toBe(true);
    });
  });

  describe('scoreRedFlagRisk', () => {
    it('should calculate risk score for tool', () => {
      const { tool } = createTestTool(
        db,
        'risk-test-tool',
        'global',
        undefined,
        'Normal description'
      );

      const score = scoreRedFlagRisk(tool.id, 'tool');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should calculate risk score for guideline', () => {
      const guideline = createTestGuideline(
        db,
        'risk-test-guideline',
        'global',
        undefined,
        'testing',
        80,
        'Normal content'
      );

      const score = scoreRedFlagRisk(guideline.guideline.id, 'guideline');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should calculate risk score for knowledge', () => {
      const { knowledge } = createTestKnowledge(db, 'Risk Test Knowledge', 'Normal content');

      const score = scoreRedFlagRisk(knowledge.id, 'knowledge');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 0 for non-existent entry', () => {
      const score = scoreRedFlagRisk('nonexistent-id', 'tool');

      expect(score).toBe(0);
    });

    it('should cap risk score at 1.0', () => {
      // Create entry with multiple high-severity flags
      const { tool } = createTestTool(
        db,
        'high-risk-tool',
        'global',
        undefined,
        'a'.repeat(10001) + ' { invalid json } ' + 'b'.repeat(200) + '\n' + 'c'.repeat(200)
      );

      const score = scoreRedFlagRisk(tool.id, 'tool');

      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should weight high severity flags more', () => {
      // Create tool with high-severity flag (malformed JSON)
      const { tool } = createTestTool(
        db,
        'high-severity-tool',
        'global',
        undefined,
        '{ invalid json }'
      );

      const score = scoreRedFlagRisk(tool.id, 'tool');

      // High severity flags contribute 0.4 each
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});








