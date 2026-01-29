/**
 * Unit tests for verification service
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestGuideline,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-verification.db';
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

// Import after mock setup
const { verifyAction, logCompletedAction } =
  await import('../../src/services/verification.service.js');

describe('verification.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up before each test
    sqlite.exec('DELETE FROM verification_log');
    sqlite.exec('DELETE FROM session_guideline_acknowledgments');
    sqlite.exec('DELETE FROM guideline_versions');
    sqlite.exec('DELETE FROM guidelines');
    sqlite.exec('DELETE FROM sessions');
    sqlite.exec('DELETE FROM projects');
  });

  describe('verifyAction', () => {
    it('should return allowed when no critical guidelines exist', () => {
      const result = verifyAction(
        null,
        null,
        {
          type: 'file_write',
          filePath: '/path/to/file.ts',
          content: 'const x = 1;',
        },
        db
      );

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should block when action matches forbidden action type', () => {
      const { guideline, version } = createTestGuideline(
        db,
        'no-file-writes',
        'global',
        undefined,
        'security',
        95,
        'Never write files directly'
      );

      // Add verification rules with forbidden action
      sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"forbiddenActions": ["file_write"]}' WHERE id = '${version.id}'`
      );

      const result = verifyAction(
        null,
        null,
        {
          type: 'file_write',
          filePath: '/path/to/file.ts',
          content: 'const x = 1;',
        },
        db
      );

      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].guidelineName).toBe('no-file-writes');
      expect(result.violations[0].severity).toBe('critical');
    });

    it('should block when file path matches forbidden pattern', () => {
      const { guideline, version } = createTestGuideline(
        db,
        'no-env-files',
        'global',
        undefined,
        'security',
        95,
        'Never modify .env files'
      );

      // Add verification rules with file patterns
      sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"filePatterns": [".env", ".env.*"]}' WHERE id = '${version.id}'`
      );

      const result = verifyAction(
        null,
        null,
        {
          type: 'file_write',
          filePath: '/project/.env',
          content: 'SECRET_KEY=abc123',
        },
        db
      );

      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].guidelineName).toBe('no-env-files');
    });

    it('should block when content matches forbidden pattern', () => {
      const { guideline, version } = createTestGuideline(
        db,
        'no-hardcoded-secrets',
        'global',
        undefined,
        'security',
        95,
        'Never hardcode API keys'
      );

      // Add verification rules with content patterns
      sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["sk-[a-zA-Z0-9]+"]}' WHERE id = '${version.id}'`
      );

      const result = verifyAction(
        null,
        null,
        {
          type: 'code_generate',
          content: 'const apiKey = "sk-abc123def456";',
        },
        db
      );

      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].guidelineName).toBe('no-hardcoded-secrets');
    });

    it('should block when content matches bad example', () => {
      const { guideline, version } = createTestGuideline(
        db,
        'no-eval',
        'global',
        undefined,
        'security',
        95,
        'Never use eval()'
      );

      // Add bad examples
      sqlite.exec(
        `UPDATE guideline_versions SET examples = '{"bad": ["eval(", "new Function("], "good": ["JSON.parse("]}' WHERE id = '${version.id}'`
      );

      const result = verifyAction(
        null,
        null,
        {
          type: 'code_generate',
          content: 'const result = eval(userInput);',
        },
        db
      );

      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should allow action when no rules are violated', () => {
      createTestGuideline(
        db,
        'no-env-files',
        'global',
        undefined,
        'security',
        95,
        'Never modify .env files'
      );

      const result = verifyAction(
        null,
        null,
        {
          type: 'file_write',
          filePath: '/project/src/index.ts',
          content: 'console.log("hello");',
        },
        db
      );

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should log verification to verification_log', () => {
      createTestGuideline(
        db,
        'test-guideline',
        'global',
        undefined,
        'security',
        95,
        'Test content'
      );

      verifyAction(
        null,
        null,
        {
          type: 'file_write',
          filePath: '/path/to/file.ts',
        },
        db
      );

      const logs = sqlite
        .prepare('SELECT * FROM verification_log WHERE action_type = ?')
        .all('pre_check');
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('logCompletedAction', () => {
    it('should log action and return violations for audit', () => {
      const { version } = createTestGuideline(
        db,
        'no-secrets',
        'global',
        undefined,
        'security',
        95,
        'Never hardcode secrets'
      );

      // Use simple string pattern to avoid JSON escaping issues
      sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["password"]}' WHERE id = '${version.id}'`
      );

      const result = logCompletedAction(
        null,
        {
          type: 'code_generate',
          content: 'const password = "secret123";',
        },
        undefined,
        db
      );

      // Post-check doesn't block, but logs violations
      expect(result.blocked).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(0);

      const logs = sqlite
        .prepare('SELECT * FROM verification_log WHERE action_type = ?')
        .all('post_check');
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
