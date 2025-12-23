/**
 * Integration tests for verification handlers
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
import { verificationHandlers } from '../../src/mcp/handlers/verification.handler.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-verification-integration.db';
let testDb: ReturnType<typeof setupTestDb>;
let context: AppContext;

describe('verification.handler (integration)', () => {
  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up before each test
    testDb.sqlite.exec('DELETE FROM verification_log');
    testDb.sqlite.exec('DELETE FROM session_guideline_acknowledgments');
    testDb.sqlite.exec('DELETE FROM guideline_versions');
    testDb.sqlite.exec('DELETE FROM guidelines');
    testDb.sqlite.exec('DELETE FROM sessions');
    testDb.sqlite.exec('DELETE FROM projects');
  });

  describe('preCheck', () => {
    it('should return allowed when no violations', () => {
      const result = verificationHandlers.preCheck(context, {
        proposedAction: {
          type: 'file_write',
          filePath: '/path/to/file.ts',
          content: 'const x = 1;',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('pre_check');
      expect(result.blocked).toBe(false);
      expect(result.message).toContain('may proceed');
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

      // Add verification rules
      testDb.sqlite.exec(
        `UPDATE guideline_versions SET verification_rules = '{"forbiddenActions": ["file_write"]}' WHERE id = '${version.id}'`
      );

      const result = verificationHandlers.preCheck(context, {
        proposedAction: {
          type: 'file_write',
          filePath: '/path/to/file.ts',
        },
      });

      expect(result.success).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.message).toContain('BLOCKED');
      expect(result.message).toContain('Do NOT proceed');
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

      const result = verificationHandlers.preCheck(context, {
        sessionId: session.id,
        proposedAction: {
          type: 'code_generate',
          content: 'This contains forbidden_word',
        },
      });

      expect(result.blocked).toBe(true);
      expect(result.sessionId).toBe(session.id);
    });

    it('should throw error for missing proposedAction', () => {
      expect(() => {
        verificationHandlers.preCheck(context, {});
      }).toThrow();
    });
  });

  describe('postCheck', () => {
    it('should log action and return result', () => {
      const result = verificationHandlers.postCheck(context, {
        completedAction: {
          type: 'file_write',
          filePath: '/path/to/file.ts',
          content: 'const x = 1;',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('post_check');
      expect(result.message).toContain('logged');
    });

    it('should accept content string as alternative to completedAction', () => {
      const result = verificationHandlers.postCheck(context, {
        content: 'Some agent response content',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('post_check');
    });

    it('should report violations for audit purposes', () => {
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

      const result = verificationHandlers.postCheck(context, {
        completedAction: {
          type: 'code_generate',
          content: 'const password = "secret"',
        },
      });

      // Post-check doesn't block, just logs
      expect(result.success).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('should throw error when neither completedAction nor content provided', () => {
      expect(() => {
        verificationHandlers.postCheck(context, {});
      }).toThrow();
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge all critical guidelines', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      createTestGuideline(testDb.db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(testDb.db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.acknowledge(context, {
        sessionId: session.id,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('acknowledge');
      expect(result.acknowledged).toBe(2);
      expect(result.allAcknowledged).toBe(true);
      expect(result.missingAcknowledgments).toHaveLength(0);
    });

    it('should acknowledge specific guidelines', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      const { guideline: g1 } = createTestGuideline(
        testDb.db,
        'critical-1',
        'global',
        undefined,
        'security',
        95,
        'Content 1'
      );
      createTestGuideline(testDb.db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.acknowledge(context, {
        sessionId: session.id,
        guidelineIds: [g1.id],
      });

      expect(result.success).toBe(true);
      expect(result.acknowledged).toBe(1);
      expect(result.allAcknowledged).toBe(false);
      expect(result.missingAcknowledgments).toContain('critical-2');
    });

    it('should include agentId in acknowledgment', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      createTestGuideline(testDb.db, 'critical-1', 'global', undefined, 'security', 95, 'Content');

      const result = verificationHandlers.acknowledge(context, {
        sessionId: session.id,
        agentId: 'test-agent-123',
      });

      expect(result.success).toBe(true);

      // Verify agentId was stored
      const acks = testDb.sqlite
        .prepare('SELECT * FROM session_guideline_acknowledgments WHERE session_id = ?')
        .all(session.id) as any[];
      expect(acks[0].acknowledged_by).toBe('test-agent-123');
    });

    it('should throw error for missing sessionId', () => {
      expect(() => {
        verificationHandlers.acknowledge(context, {});
      }).toThrow();
    });
  });

  describe('status', () => {
    it('should return verification status for session', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      createTestGuideline(testDb.db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(testDb.db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.status(context, {
        sessionId: session.id,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('status');
      expect(result.criticalGuidelinesCount).toBe(2);
      expect(result.acknowledgedCount).toBe(0);
      expect(result.allAcknowledged).toBe(false);
      expect(result.guidelines).toHaveLength(2);
    });

    it('should show acknowledged status for each guideline', () => {
      const project = createTestProject(testDb.db, 'Test Project');
      const session = createTestSession(testDb.db, project.id, 'Test Session');

      const { guideline: g1 } = createTestGuideline(
        testDb.db,
        'critical-1',
        'global',
        undefined,
        'security',
        95,
        'Content 1'
      );
      createTestGuideline(testDb.db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      // Acknowledge one guideline
      verificationHandlers.acknowledge(context, {
        sessionId: session.id,
        guidelineIds: [g1.id],
      });

      const result = verificationHandlers.status(context, {
        sessionId: session.id,
      });

      expect(result.acknowledgedCount).toBe(1);
      expect(result.allAcknowledged).toBe(false);

      const g1Status = result.guidelines.find((g: any) => g.id === g1.id);
      expect(g1Status.acknowledged).toBe(true);

      const g2Status = result.guidelines.find((g: any) => g.name === 'critical-2');
      expect(g2Status.acknowledged).toBe(false);
    });

    it('should throw error for missing sessionId', () => {
      expect(() => {
        verificationHandlers.status(context, {});
      }).toThrow();
    });
  });
});
