/**
 * Integration tests for verification service
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestGuideline,
  createTestProject,
  createTestSession,
  createTestContext,
} from '../fixtures/test-helpers.js';
import { VerificationService } from '../../src/services/verification.service.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-verification-integration.db';
let testDb: ReturnType<typeof setupTestDb>;
let context: AppContext;
let verificationService: VerificationService;

describe('verification.service (integration)', () => {
  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
    verificationService = new VerificationService(context.db);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    testDb.sqlite.exec('DELETE FROM verification_log');
    testDb.sqlite.exec('DELETE FROM guideline_versions');
    testDb.sqlite.exec('DELETE FROM guidelines');
    testDb.sqlite.exec('DELETE FROM sessions');
    testDb.sqlite.exec('DELETE FROM projects');
  });

  describe('verifyAction', () => {
    it('should return allowed when no violations', () => {
      const result = verificationService.verifyAction(null, null, {
        type: 'file_write',
        filePath: '/path/to/file.ts',
        content: 'const x = 1;',
      });

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should return blocked when violation detected', () => {
      const { version } = createTestGuideline(
        testDb.db,
        'no-file-writes',
        'global',
        undefined,
        'security',
        95,
        'Never write files directly'
      );

      testDb.sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"forbiddenActions": ["file_write"]}' WHERE id = '${version.id}'`
      );

      const result = verificationService.verifyAction(null, null, {
        type: 'file_write',
        filePath: '/path/to/file.ts',
      });

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].guidelineName).toBe('no-file-writes');
    });

    it('should work with sessionId for scope resolution', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      const { version } = createTestGuideline(
        testDb.db,
        'project-rule',
        'project',
        project.id,
        'security',
        95,
        'Project-specific rule'
      );

      testDb.sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["forbidden_word"]}' WHERE id = '${version.id}'`
      );

      const result = verificationService.verifyAction(session.id, project.id, {
        type: 'code_generate',
        content: 'This contains forbidden_word',
      });

      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
    });
  });

  describe('logCompletedAction', () => {
    it('should log action and return result', () => {
      const result = verificationService.logCompletedAction(
        null,
        {
          type: 'file_write',
          filePath: '/path/to/file.ts',
          content: 'const x = 1;',
        },
        'test-agent'
      );

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should log violations for audit purposes', () => {
      const { version } = createTestGuideline(
        testDb.db,
        'no-secrets',
        'global',
        undefined,
        'security',
        95,
        'Never expose secrets'
      );

      testDb.sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["password\\\\s*="]}' WHERE id = '${version.id}'`
      );

      const result = verificationService.logCompletedAction(
        null,
        {
          type: 'code_generate',
          content: 'const password = "secret"',
        },
        'test-agent'
      );

      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });
});
