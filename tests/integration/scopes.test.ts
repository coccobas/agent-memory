import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestOrg, createTestProject, createTestSession } from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-scopes.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js',
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { scopeHandlers } from '../../src/mcp/handlers/scopes.handler.js';

describe('Scope Management Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Organizations', () => {
    it('should create an organization', () => {
      const result = scopeHandlers.orgCreate({
        name: 'Test Organization',
        metadata: { description: 'A test org' },
      });

      expect(result.success).toBe(true);
      expect(result.organization).toBeDefined();
      expect(result.organization.name).toBe('Test Organization');
      expect(result.organization.metadata).toEqual({ description: 'A test org' });
    });

    it('should create organization without metadata', () => {
      const result = scopeHandlers.orgCreate({
        name: 'Simple Org',
      });

      expect(result.success).toBe(true);
      expect(result.organization.name).toBe('Simple Org');
    });

    it('should require name', () => {
      expect(() => {
        scopeHandlers.orgCreate({});
      }).toThrow('name is required');
    });

    it('should list organizations with pagination', () => {
      // Create multiple orgs
      scopeHandlers.orgCreate({ name: 'Org 1' });
      scopeHandlers.orgCreate({ name: 'Org 2' });
      scopeHandlers.orgCreate({ name: 'Org 3' });

      const result = scopeHandlers.orgList({ limit: 2, offset: 0 });
      expect(result.organizations.length).toBeLessThanOrEqual(2);
      expect(result.meta.returnedCount).toBeLessThanOrEqual(2);
    });
  });

  describe('Projects', () => {
    let orgId: string;

    beforeAll(() => {
      const org = createTestOrg(db, 'Project Test Org');
      orgId = org.id;
    });

    it('should create a project with org', () => {
      const result = scopeHandlers.projectCreate({
        name: 'Test Project',
        orgId,
        description: 'A test project',
        rootPath: '/test/path',
      });

      expect(result.success).toBe(true);
      expect(result.project).toBeDefined();
      expect(result.project.name).toBe('Test Project');
      expect(result.project.orgId).toBe(orgId);
      expect(result.project.description).toBe('A test project');
      expect(result.project.rootPath).toBe('/test/path');
    });

    it('should create a project without org', () => {
      const result = scopeHandlers.projectCreate({
        name: 'Standalone Project',
      });

      expect(result.success).toBe(true);
      expect(result.project.orgId).toBeNull();
    });

    it('should require name', () => {
      expect(() => {
        scopeHandlers.projectCreate({});
      }).toThrow('name is required');
    });

    it('should get project by ID', () => {
      const project = createTestProject(db, 'Get By ID Project', orgId);
      const result = scopeHandlers.projectGet({ id: project.id });

      expect(result.project).toBeDefined();
      expect(result.project.id).toBe(project.id);
      expect(result.project.name).toBe('Get By ID Project');
    });

    it('should get project by name (case-insensitive)', () => {
      const project = createTestProject(db, 'Case-Sensitive-Test', orgId);

      // Test different case variations
      expect(scopeHandlers.projectGet({ name: 'Case-Sensitive-Test', orgId }).project.id).toBe(project.id);
      expect(scopeHandlers.projectGet({ name: 'case-sensitive-test', orgId }).project.id).toBe(project.id);
      expect(scopeHandlers.projectGet({ name: 'CASE-SENSITIVE-TEST', orgId }).project.id).toBe(project.id);
      expect(scopeHandlers.projectGet({ name: 'CaSe-SeNsItIvE-TeSt', orgId }).project.id).toBe(project.id);
    });

    it('should get project by name without orgId', () => {
      const project = createTestProject(db, 'No Org Project');

      const result = scopeHandlers.projectGet({ name: 'No Org Project' });
      expect(result.project.id).toBe(project.id);
    });

    it('should throw error when project not found', () => {
      expect(() => {
        scopeHandlers.projectGet({ id: 'non-existent-id' });
      }).toThrow('Project not found');
    });

    it('should require id or name', () => {
      expect(() => {
        scopeHandlers.projectGet({});
      }).toThrow('Either id or name is required');
    });

    it('should list projects with orgId filter', () => {
      const result = scopeHandlers.projectList({ orgId, limit: 10 });
      expect(result.projects.length).toBeGreaterThan(0);
      result.projects.forEach((p) => {
        expect(p.orgId).toBe(orgId);
      });
    });

    it('should list all projects', () => {
      const result = scopeHandlers.projectList({ limit: 10 });
      expect(result.projects.length).toBeGreaterThan(0);
    });

    it('should update project', () => {
      const project = createTestProject(db, 'Update Test', orgId);
      const result = scopeHandlers.projectUpdate({
        id: project.id,
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result.success).toBe(true);
      expect(result.project.name).toBe('Updated Name');
      expect(result.project.description).toBe('Updated description');
    });

    it('should require id for update', () => {
      expect(() => {
        scopeHandlers.projectUpdate({});
      }).toThrow('id is required');
    });
  });

  describe('Sessions', () => {
    let projectId: string;

    beforeAll(() => {
      const project = createTestProject(db, 'Session Test Project');
      projectId = project.id;
    });

    it('should create a session', () => {
      const result = scopeHandlers.sessionStart({
        projectId,
        name: 'Test Session',
        purpose: 'Testing sessions',
        agentId: 'test-agent',
        metadata: { mode: 'testing' },
      });

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.name).toBe('Test Session');
      expect(result.session.purpose).toBe('Testing sessions');
      expect(result.session.agentId).toBe('test-agent');
      expect(result.session.status).toBe('active');
      expect(result.session.metadata).toEqual({ mode: 'testing' });
    });

    it('should create session without optional fields', () => {
      const result = scopeHandlers.sessionStart({
        projectId,
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('active');
    });

    it('should end a session', () => {
      const session = createTestSession(db, projectId, 'End Test Session');
      const result = scopeHandlers.sessionEnd({
        id: session.id,
        status: 'completed',
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('completed');
      expect(result.session.endedAt).toBeDefined();
    });

    it('should end session with discarded status', () => {
      const session = createTestSession(db, projectId, 'Discard Test');
      const result = scopeHandlers.sessionEnd({
        id: session.id,
        status: 'discarded',
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('discarded');
    });

    it('should require id for ending session', () => {
      expect(() => {
        scopeHandlers.sessionEnd({});
      }).toThrow('id is required');
    });

    it('should list sessions by projectId', () => {
      createTestSession(db, projectId, 'List Test 1');
      createTestSession(db, projectId, 'List Test 2');

      const result = scopeHandlers.sessionList({ projectId, limit: 10 });
      expect(result.sessions.length).toBeGreaterThan(0);
      result.sessions.forEach((s) => {
        expect(s.projectId).toBe(projectId);
      });
    });

    it('should list sessions by status', () => {
      const activeSession = createTestSession(db, projectId, 'Active Session');
      scopeHandlers.sessionEnd({ id: activeSession.id, status: 'completed' });

      const activeResult = scopeHandlers.sessionList({ status: 'active', limit: 10 });
      const completedResult = scopeHandlers.sessionList({ status: 'completed', limit: 10 });

      expect(activeResult.sessions.every((s) => s.status === 'active')).toBe(true);
      expect(completedResult.sessions.every((s) => s.status === 'completed')).toBe(true);
    });

    it('should list all sessions', () => {
      const result = scopeHandlers.sessionList({ limit: 10 });
      expect(result.sessions.length).toBeGreaterThan(0);
    });
  });
});

