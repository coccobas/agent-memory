import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  createTestSession,
  createTestContext,
} from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-scopes.db';
const TEST_ADMIN_KEY = 'test-admin-key-12345';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let ctx: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { scopeHandlers } from '../../src/mcp/handlers/scopes.handler.js';

describe('Scope Management Integration', () => {
  beforeAll(async () => {
    // Set admin key for tests that require admin authentication
    process.env.AGENT_MEMORY_ADMIN_KEY = TEST_ADMIN_KEY;
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Organizations', () => {
    it('should create an organization', async () => {
      const result = await scopeHandlers.orgCreate(ctx, {
        adminKey: TEST_ADMIN_KEY,
        name: 'Test Organization',
        metadata: { description: 'A test org' },
      });

      expect(result.success).toBe(true);
      expect(result.organization).toBeDefined();
      expect(result.organization.name).toBe('Test Organization');
      expect(result.organization.metadata).toEqual({ description: 'A test org' });
    });

    it('should create organization without metadata', async () => {
      const result = await scopeHandlers.orgCreate(ctx, {
        adminKey: TEST_ADMIN_KEY,
        name: 'Simple Org',
      });

      expect(result.success).toBe(true);
      expect(result.organization.name).toBe('Simple Org');
    });

    it('should require name', async () => {
      await expect(scopeHandlers.orgCreate(ctx, { adminKey: TEST_ADMIN_KEY })).rejects.toThrow(
        'name is required'
      );
    });

    it('should list organizations with pagination', async () => {
      // Create multiple orgs
      await scopeHandlers.orgCreate(ctx, { adminKey: TEST_ADMIN_KEY, name: 'Org 1' });
      await scopeHandlers.orgCreate(ctx, { adminKey: TEST_ADMIN_KEY, name: 'Org 2' });
      await scopeHandlers.orgCreate(ctx, { adminKey: TEST_ADMIN_KEY, name: 'Org 3' });

      const result = await scopeHandlers.orgList(ctx, { limit: 2, offset: 0 });
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

    it('should create a project with org', async () => {
      const result = await scopeHandlers.projectCreate(ctx, {
        adminKey: TEST_ADMIN_KEY,
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

    it('should create a project without org', async () => {
      const result = await scopeHandlers.projectCreate(ctx, {
        adminKey: TEST_ADMIN_KEY,
        name: 'Standalone Project',
      });

      expect(result.success).toBe(true);
      expect(result.project.orgId).toBeNull();
    });

    it('should require name', async () => {
      await expect(scopeHandlers.projectCreate(ctx, { adminKey: TEST_ADMIN_KEY })).rejects.toThrow(
        'name is required'
      );
    });

    it('should get project by ID', async () => {
      const project = createTestProject(db, 'Get By ID Project', orgId);
      const result = await scopeHandlers.projectGet(ctx, { id: project.id });

      expect(result.project).toBeDefined();
      expect(result.project.id).toBe(project.id);
      expect(result.project.name).toBe('Get By ID Project');
    });

    it('should get project by name (case-insensitive)', async () => {
      const project = createTestProject(db, 'Case-Sensitive-Test', orgId);

      // Test different case variations
      expect(
        (await scopeHandlers.projectGet(ctx, { name: 'Case-Sensitive-Test', orgId })).project.id
      ).toBe(project.id);
      expect(
        (await scopeHandlers.projectGet(ctx, { name: 'case-sensitive-test', orgId })).project.id
      ).toBe(project.id);
      expect(
        (await scopeHandlers.projectGet(ctx, { name: 'CASE-SENSITIVE-TEST', orgId })).project.id
      ).toBe(project.id);
      expect(
        (await scopeHandlers.projectGet(ctx, { name: 'CaSe-SeNsItIvE-TeSt', orgId })).project.id
      ).toBe(project.id);
    });

    it('should get project by name without orgId', async () => {
      const project = createTestProject(db, 'No Org Project');

      const result = await scopeHandlers.projectGet(ctx, { name: 'No Org Project' });
      expect(result.project.id).toBe(project.id);
    });

    it('should throw error when project not found', async () => {
      await expect(scopeHandlers.projectGet(ctx, { id: 'non-existent-id' })).rejects.toThrow(
        /Project not found/
      );
    });

    it('should require id or name', async () => {
      await expect(scopeHandlers.projectGet(ctx, {})).rejects.toThrow(/id or name/);
    });

    it('should list projects with orgId filter', async () => {
      const result = await scopeHandlers.projectList(ctx, { orgId, limit: 10 });
      expect(result.projects.length).toBeGreaterThan(0);
      result.projects.forEach((p) => {
        expect(p.orgId).toBe(orgId);
      });
    });

    it('should list all projects', async () => {
      const result = await scopeHandlers.projectList(ctx, { limit: 10 });
      expect(result.projects.length).toBeGreaterThan(0);
    });

    it('should update project', async () => {
      const project = createTestProject(db, 'Update Test', orgId);
      const result = await scopeHandlers.projectUpdate(ctx, {
        adminKey: TEST_ADMIN_KEY,
        id: project.id,
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result.success).toBe(true);
      expect(result.project.name).toBe('Updated Name');
      expect(result.project.description).toBe('Updated description');
    });

    it('should require id for update', async () => {
      await expect(scopeHandlers.projectUpdate(ctx, { adminKey: TEST_ADMIN_KEY })).rejects.toThrow(
        'id is required'
      );
    });
  });

  describe('Sessions', () => {
    let projectId: string;

    beforeAll(() => {
      const project = createTestProject(db, 'Session Test Project');
      projectId = project.id;
    });

    it('should create a session', async () => {
      const result = await scopeHandlers.sessionStart(ctx, {
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

    it('should create session without optional fields', async () => {
      const result = await scopeHandlers.sessionStart(ctx, {
        projectId,
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('active');
    });

    it('should end a session', async () => {
      const session = createTestSession(db, projectId, 'End Test Session');
      const result = await scopeHandlers.sessionEnd(ctx, {
        id: session.id,
        status: 'completed',
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('completed');
      expect(result.session.endedAt).toBeDefined();
    });

    it('should end session with discarded status', async () => {
      const session = createTestSession(db, projectId, 'Discard Test');
      const result = await scopeHandlers.sessionEnd(ctx, {
        id: session.id,
        status: 'discarded',
      });

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('discarded');
    });

    it('should require id for ending session', async () => {
      await expect(scopeHandlers.sessionEnd(ctx, {})).rejects.toThrow('id is required');
    });

    it('should list sessions by projectId', async () => {
      createTestSession(db, projectId, 'List Test 1');
      createTestSession(db, projectId, 'List Test 2');

      const result = await scopeHandlers.sessionList(ctx, { projectId, limit: 10 });
      expect(result.sessions.length).toBeGreaterThan(0);
      result.sessions.forEach((s) => {
        expect(s.projectId).toBe(projectId);
      });
    });

    it('should list sessions by status', async () => {
      const activeSession = createTestSession(db, projectId, 'Active Session');
      await scopeHandlers.sessionEnd(ctx, { id: activeSession.id, status: 'completed' });

      const activeResult = await scopeHandlers.sessionList(ctx, { status: 'active', limit: 10 });
      const completedResult = await scopeHandlers.sessionList(ctx, {
        status: 'completed',
        limit: 10,
      });

      expect(activeResult.sessions.every((s) => s.status === 'active')).toBe(true);
      expect(completedResult.sessions.every((s) => s.status === 'completed')).toBe(true);
    });

    it('should list all sessions', async () => {
      const result = await scopeHandlers.sessionList(ctx, { limit: 10 });
      expect(result.sessions.length).toBeGreaterThan(0);
    });
  });
});
