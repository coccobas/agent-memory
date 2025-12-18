/**
 * Integration tests for verification handlers
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestGuideline, createTestProject, createTestSession } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-verification-integration.db';
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

// Import handlers after mock setup
const { verificationHandlers } = await import('../../src/mcp/handlers/verification.handler.js');

describe('verification.handler (integration)', () => {
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

  describe('preCheck', () => {
    it('should return allowed when no violations', () => {
      const result = verificationHandlers.preCheck({
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
        db,
        'no-file-writes',
        'global',
        undefined,
        'security',
        95,
        'Never write files directly'
      );

      // Add verification rules
      sqlite.exec(`UPDATE guideline_versions SET verification_rules = '{"forbiddenActions": ["file_write"]}' WHERE id = '${version.id}'`);

      const result = verificationHandlers.preCheck({
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
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      const { version } = createTestGuideline(
        db,
        'project-rule',
        'project',
        project.id,
        'security',
        95,
        'Project-specific rule'
      );

      sqlite.exec(`UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["forbidden_word"]}' WHERE id = '${version.id}'`);

      const result = verificationHandlers.preCheck({
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
        verificationHandlers.preCheck({});
      }).toThrow();
    });
  });

  describe('postCheck', () => {
    it('should log action and return result', () => {
      const result = verificationHandlers.postCheck({
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
      const result = verificationHandlers.postCheck({
        content: 'Some agent response content',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('post_check');
    });

    it('should report violations for audit purposes', () => {
      const { version } = createTestGuideline(
        db,
        'no-secrets',
        'global',
        undefined,
        'security',
        95,
        'Never expose secrets'
      );

      sqlite.exec(`UPDATE guideline_versions SET verification_rules = '{"contentPatterns": ["password\\\\s*="]}' WHERE id = '${version.id}'`);

      const result = verificationHandlers.postCheck({
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
        verificationHandlers.postCheck({});
      }).toThrow();
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge all critical guidelines', () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      createTestGuideline(db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.acknowledge({
        sessionId: session.id,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('acknowledge');
      expect(result.acknowledged).toBe(2);
      expect(result.allAcknowledged).toBe(true);
      expect(result.missingAcknowledgments).toHaveLength(0);
    });

    it('should acknowledge specific guidelines', () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      const { guideline: g1 } = createTestGuideline(db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.acknowledge({
        sessionId: session.id,
        guidelineIds: [g1.id],
      });

      expect(result.success).toBe(true);
      expect(result.acknowledged).toBe(1);
      expect(result.allAcknowledged).toBe(false);
      expect(result.missingAcknowledgments).toContain('critical-2');
    });

    it('should include agentId in acknowledgment', () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      createTestGuideline(db, 'critical-1', 'global', undefined, 'security', 95, 'Content');

      const result = verificationHandlers.acknowledge({
        sessionId: session.id,
        agentId: 'test-agent-123',
      });

      expect(result.success).toBe(true);

      // Verify agentId was stored
      const acks = sqlite.prepare('SELECT * FROM session_guideline_acknowledgments WHERE session_id = ?').all(session.id) as any[];
      expect(acks[0].acknowledged_by).toBe('test-agent-123');
    });

    it('should throw error for missing sessionId', () => {
      expect(() => {
        verificationHandlers.acknowledge({});
      }).toThrow();
    });
  });

  describe('status', () => {
    it('should return verification status for session', () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      createTestGuideline(db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      const result = verificationHandlers.status({
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
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      const { guideline: g1 } = createTestGuideline(db, 'critical-1', 'global', undefined, 'security', 95, 'Content 1');
      createTestGuideline(db, 'critical-2', 'global', undefined, 'security', 92, 'Content 2');

      // Acknowledge one guideline
      verificationHandlers.acknowledge({
        sessionId: session.id,
        guidelineIds: [g1.id],
      });

      const result = verificationHandlers.status({
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
        verificationHandlers.status({});
      }).toThrow();
    });
  });
});
