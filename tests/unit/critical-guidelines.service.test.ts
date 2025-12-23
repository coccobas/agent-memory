/**
 * Unit tests for critical-guidelines service
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestGuideline,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-critical-guidelines.db';
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
const {
  getCriticalGuidelinesForScope,
  getCriticalGuidelinesForSession,
  CRITICAL_PRIORITY_THRESHOLD,
} = await import('../../src/services/critical-guidelines.service.js');

describe('critical-guidelines.service', () => {
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
    // Clean up guidelines, projects, and sessions before each test
    sqlite.exec('DELETE FROM guideline_versions');
    sqlite.exec('DELETE FROM guidelines');
    sqlite.exec('DELETE FROM sessions');
    sqlite.exec('DELETE FROM projects');
  });

  describe('getCriticalGuidelinesForScope', () => {
    it('should return empty array when no guidelines exist', () => {
      const result = getCriticalGuidelinesForScope(null, null, db);
      expect(result).toHaveLength(0);
    });

    it('should return only guidelines with priority >= 90', () => {
      // Create guidelines with different priorities
      createTestGuideline(
        db,
        'low-priority',
        'global',
        undefined,
        'security',
        50,
        'Low priority content'
      );
      createTestGuideline(
        db,
        'medium-priority',
        'global',
        undefined,
        'security',
        80,
        'Medium priority content'
      );
      createTestGuideline(
        db,
        'critical-priority',
        'global',
        undefined,
        'security',
        90,
        'Critical priority content'
      );
      createTestGuideline(
        db,
        'highest-priority',
        'global',
        undefined,
        'security',
        100,
        'Highest priority content'
      );

      const result = getCriticalGuidelinesForScope(null, null, db);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('highest-priority');
      expect(result[1].name).toBe('critical-priority');
    });

    it('should include guidelines from project scope', () => {
      const project = createTestProject(db, 'Test Project');

      createTestGuideline(
        db,
        'global-critical',
        'global',
        undefined,
        'security',
        95,
        'Global critical'
      );
      createTestGuideline(
        db,
        'project-critical',
        'project',
        project.id,
        'security',
        92,
        'Project critical'
      );

      const result = getCriticalGuidelinesForScope(project.id, null, db);

      expect(result).toHaveLength(2);
      expect(result.some((g) => g.name === 'global-critical')).toBe(true);
      expect(result.some((g) => g.name === 'project-critical')).toBe(true);
    });

    it('should include guidelines from session scope', () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      createTestGuideline(
        db,
        'global-critical',
        'global',
        undefined,
        'security',
        95,
        'Global critical'
      );
      createTestGuideline(
        db,
        'session-critical',
        'session',
        session.id,
        'security',
        91,
        'Session critical'
      );

      const result = getCriticalGuidelinesForScope(project.id, session.id, db);

      expect(result).toHaveLength(2);
      expect(result.some((g) => g.name === 'global-critical')).toBe(true);
      expect(result.some((g) => g.name === 'session-critical')).toBe(true);
    });

    it('should sort by priority descending', () => {
      createTestGuideline(db, 'priority-90', 'global', undefined, 'security', 90, 'Content');
      createTestGuideline(db, 'priority-95', 'global', undefined, 'security', 95, 'Content');
      createTestGuideline(db, 'priority-100', 'global', undefined, 'security', 100, 'Content');

      const result = getCriticalGuidelinesForScope(null, null, db);

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe(100);
      expect(result[1].priority).toBe(95);
      expect(result[2].priority).toBe(90);
    });

    it('should not return inactive guidelines', () => {
      const { guideline } = createTestGuideline(
        db,
        'inactive-critical',
        'global',
        undefined,
        'security',
        95,
        'Content'
      );

      // Deactivate the guideline
      sqlite.exec(`UPDATE guidelines SET is_active = 0 WHERE id = '${guideline.id}'`);

      const result = getCriticalGuidelinesForScope(null, null, db);

      expect(result).toHaveLength(0);
    });

    it('should include guideline content, rationale, and examples', () => {
      const { guideline, version } = createTestGuideline(
        db,
        'detailed-guideline',
        'global',
        undefined,
        'security',
        95,
        'Test content'
      );

      // Update version with rationale and examples
      sqlite.exec(
        `UPDATE guideline_versions SET rationale = 'Test rationale', examples = '{"bad": ["bad1"], "good": ["good1"]}' WHERE id = '${version.id}'`
      );

      const result = getCriticalGuidelinesForScope(null, null, db);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Test content');
      expect(result[0].rationale).toBe('Test rationale');
      expect(result[0].examples).toEqual({ bad: ['bad1'], good: ['good1'] });
    });
  });

  describe('getCriticalGuidelinesForSession', () => {
    it('should return formatted result with count and message', () => {
      createTestGuideline(db, 'critical-guideline', 'global', undefined, 'security', 95, 'Content');

      const result = getCriticalGuidelinesForSession(null, null, db);

      expect(result.count).toBe(1);
      expect(result.guidelines).toHaveLength(1);
      expect(result.acknowledgmentRequired).toBe(true);
      expect(result.message).toContain('CRITICAL');
      expect(result.message).toContain('1 guideline');
    });

    it('should return no message when no critical guidelines exist', () => {
      createTestGuideline(db, 'low-priority', 'global', undefined, 'security', 50, 'Content');

      const result = getCriticalGuidelinesForSession(null, null, db);

      expect(result.count).toBe(0);
      expect(result.guidelines).toHaveLength(0);
      expect(result.acknowledgmentRequired).toBe(false);
      expect(result.message).toBeNull();
    });
  });

  describe('CRITICAL_PRIORITY_THRESHOLD', () => {
    it('should be 90', () => {
      expect(CRITICAL_PRIORITY_THRESHOLD).toBe(90);
    });
  });
});
