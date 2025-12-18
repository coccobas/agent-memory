import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';

// Test database setup (use in-memory DB to avoid disk I/O issues)
const TEST_DB_PATH = ':memory:';
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

// Mock the connection module
const mockGetDb = () => db;

// We need to directly test the repository logic, so we'll create inline versions
import { v4 as uuidv4 } from 'uuid';

function generateId(): string {
  return uuidv4();
}

describe('Database Schema', () => {
  beforeAll(() => {
    // Ensure data directory exists
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }

    // Clean up any existing test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }

    // Create test database
    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // Run all migrations
    const migrations = [
      '0000_lying_the_hand.sql',
      '0001_add_file_locks.sql',
      '0002_add_embeddings_tracking.sql',
      '0003_add_fts5_tables.sql',
      '0004_add_permissions.sql',
      '0005_add_task_decomposition.sql',
      '0006_add_audit_log.sql',
      '0007_add_execution_tracking.sql',
      '0008_add_agent_votes.sql',
      '0009_add_conversation_history.sql',
      '0010_add_verification_rules.sql',
    ];
    for (const migrationFile of migrations) {
      const migrationPath = join(process.cwd(), 'src/db/migrations', migrationFile);
      if (existsSync(migrationPath)) {
        const migrationSql = readFileSync(migrationPath, 'utf-8');
        const statements = migrationSql.split('--> statement-breakpoint');
        for (const statement of statements) {
          const trimmed = statement.trim();
          if (trimmed) {
            sqlite.exec(trimmed);
          }
        }
      }
    }
  });

  afterAll(() => {
    sqlite.close();

    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  describe('Organizations', () => {
    it('should create an organization', () => {
      const id = generateId();
      db.insert(schema.organizations)
        .values({
          id,
          name: 'Test Org',
          metadata: { description: 'A test organization' },
        })
        .run();

      const org = db
        .select()
        .from(schema.organizations)
        .where(require('drizzle-orm').eq(schema.organizations.id, id))
        .get();

      expect(org).toBeDefined();
      expect(org?.name).toBe('Test Org');
      expect(org?.metadata).toEqual({ description: 'A test organization' });
    });
  });

  describe('Projects', () => {
    it('should create a project', () => {
      const orgId = generateId();
      const projectId = generateId();

      // Create org first
      db.insert(schema.organizations)
        .values({
          id: orgId,
          name: 'Project Test Org',
        })
        .run();

      // Create project
      db.insert(schema.projects)
        .values({
          id: projectId,
          orgId,
          name: 'Test Project',
          description: 'A test project',
          rootPath: '/test/path',
        })
        .run();

      const project = db
        .select()
        .from(schema.projects)
        .where(require('drizzle-orm').eq(schema.projects.id, projectId))
        .get();

      expect(project).toBeDefined();
      expect(project?.name).toBe('Test Project');
      expect(project?.orgId).toBe(orgId);
    });
  });

  describe('Tools', () => {
    it('should create a tool with version', () => {
      const toolId = generateId();
      const versionId = generateId();

      // Create tool
      db.insert(schema.tools)
        .values({
          id: toolId,
          scopeType: 'global',
          name: 'test_tool',
          category: 'cli',
          currentVersionId: versionId,
          isActive: true,
        })
        .run();

      // Create version
      db.insert(schema.toolVersions)
        .values({
          id: versionId,
          toolId,
          versionNum: 1,
          description: 'A test tool',
          parameters: { input: { type: 'string' } },
          examples: [{ input: 'test', output: 'result' }],
          constraints: 'Must be used carefully',
          changeReason: 'Initial version',
        })
        .run();

      const tool = db
        .select()
        .from(schema.tools)
        .where(require('drizzle-orm').eq(schema.tools.id, toolId))
        .get();

      const version = db
        .select()
        .from(schema.toolVersions)
        .where(require('drizzle-orm').eq(schema.toolVersions.id, versionId))
        .get();

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('test_tool');
      expect(tool?.scopeType).toBe('global');

      expect(version).toBeDefined();
      expect(version?.description).toBe('A test tool');
      expect(version?.versionNum).toBe(1);
    });

    it('should create multiple versions of a tool', () => {
      const toolId = generateId();
      const version1Id = generateId();
      const version2Id = generateId();

      // Create tool
      db.insert(schema.tools)
        .values({
          id: toolId,
          scopeType: 'global',
          name: 'versioned_tool',
          category: 'mcp',
          currentVersionId: version1Id,
          isActive: true,
        })
        .run();

      // Create version 1
      db.insert(schema.toolVersions)
        .values({
          id: version1Id,
          toolId,
          versionNum: 1,
          description: 'Version 1',
          changeReason: 'Initial',
        })
        .run();

      // Create version 2
      db.insert(schema.toolVersions)
        .values({
          id: version2Id,
          toolId,
          versionNum: 2,
          description: 'Version 2',
          changeReason: 'Updated description',
        })
        .run();

      // Update tool to point to version 2
      db.update(schema.tools)
        .set({ currentVersionId: version2Id })
        .where(require('drizzle-orm').eq(schema.tools.id, toolId))
        .run();

      const versions = db
        .select()
        .from(schema.toolVersions)
        .where(require('drizzle-orm').eq(schema.toolVersions.toolId, toolId))
        .orderBy(require('drizzle-orm').desc(schema.toolVersions.versionNum))
        .all();

      expect(versions).toHaveLength(2);
      expect(versions[0]?.versionNum).toBe(2);
      expect(versions[1]?.versionNum).toBe(1);
    });
  });

  describe('Guidelines', () => {
    it('should create a guideline with priority', () => {
      const guidelineId = generateId();
      const versionId = generateId();

      db.insert(schema.guidelines)
        .values({
          id: guidelineId,
          scopeType: 'global',
          name: 'security_guideline',
          category: 'security',
          priority: 100,
          currentVersionId: versionId,
          isActive: true,
        })
        .run();

      db.insert(schema.guidelineVersions)
        .values({
          id: versionId,
          guidelineId,
          versionNum: 1,
          content: 'Never hardcode secrets',
          rationale: 'Security best practice',
          examples: { bad: ['const KEY = "abc"'], good: ['const KEY = process.env.KEY'] },
          changeReason: 'Initial version',
        })
        .run();

      const guideline = db
        .select()
        .from(schema.guidelines)
        .where(require('drizzle-orm').eq(schema.guidelines.id, guidelineId))
        .get();

      expect(guideline).toBeDefined();
      expect(guideline?.priority).toBe(100);
      expect(guideline?.category).toBe('security');
    });
  });

  describe('Tags', () => {
    it('should create and attach tags', () => {
      const tagId = generateId();
      const toolId = generateId();
      const entryTagId = generateId();

      // Create tag
      db.insert(schema.tags)
        .values({
          id: tagId,
          name: 'test_tag',
          category: 'custom',
          isPredefined: false,
          description: 'A test tag',
        })
        .run();

      // Create a tool to attach the tag to
      db.insert(schema.tools)
        .values({
          id: toolId,
          scopeType: 'global',
          name: 'tagged_tool',
          isActive: true,
        })
        .run();

      // Attach tag
      db.insert(schema.entryTags)
        .values({
          id: entryTagId,
          entryType: 'tool',
          entryId: toolId,
          tagId,
        })
        .run();

      const entryTag = db
        .select()
        .from(schema.entryTags)
        .where(require('drizzle-orm').eq(schema.entryTags.id, entryTagId))
        .get();

      expect(entryTag).toBeDefined();
      expect(entryTag?.entryType).toBe('tool');
      expect(entryTag?.tagId).toBe(tagId);
    });
  });

  describe('Entry Relations', () => {
    it('should create relations between entries', () => {
      const toolId = generateId();
      const guidelineId = generateId();
      const relationId = generateId();

      // Create tool
      db.insert(schema.tools)
        .values({
          id: toolId,
          scopeType: 'global',
          name: 'sql_tool',
          isActive: true,
        })
        .run();

      // Create guideline
      db.insert(schema.guidelines)
        .values({
          id: guidelineId,
          scopeType: 'global',
          name: 'sql_safety',
          isActive: true,
        })
        .run();

      // Create relation
      db.insert(schema.entryRelations)
        .values({
          id: relationId,
          sourceType: 'guideline',
          sourceId: guidelineId,
          targetType: 'tool',
          targetId: toolId,
          relationType: 'applies_to',
        })
        .run();

      const relation = db
        .select()
        .from(schema.entryRelations)
        .where(require('drizzle-orm').eq(schema.entryRelations.id, relationId))
        .get();

      expect(relation).toBeDefined();
      expect(relation?.relationType).toBe('applies_to');
      expect(relation?.sourceType).toBe('guideline');
      expect(relation?.targetType).toBe('tool');
    });
  });

  describe('Sessions', () => {
    it('should create and manage sessions', () => {
      const orgId = generateId();
      const projectId = generateId();
      const sessionId = generateId();

      // Create org and project
      db.insert(schema.organizations)
        .values({
          id: orgId,
          name: 'Session Test Org',
        })
        .run();

      db.insert(schema.projects)
        .values({
          id: projectId,
          orgId,
          name: 'Session Test Project',
        })
        .run();

      // Create session
      db.insert(schema.sessions)
        .values({
          id: sessionId,
          projectId,
          name: 'Dev Session',
          purpose: 'Working on feature X',
          agentId: 'claude-code',
          status: 'active',
          metadata: { mode: 'working_period' },
        })
        .run();

      const session = db
        .select()
        .from(schema.sessions)
        .where(require('drizzle-orm').eq(schema.sessions.id, sessionId))
        .get();

      expect(session).toBeDefined();
      expect(session?.status).toBe('active');
      expect(session?.agentId).toBe('claude-code');
      expect(session?.metadata).toEqual({ mode: 'working_period' });
    });
  });
});
