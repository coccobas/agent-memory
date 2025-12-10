import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-memory-query.db';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js',
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

// Import after mocking connection
import {
  resolveScopeChain,
  executeMemoryQuery,
} from '../../src/services/query.service.js';

describe('query.service', () => {
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

    // Run migrations manually by reading the SQL file
    const migrationPath = join(process.cwd(), 'src/db/migrations/0000_lying_the_hand.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    const statements = migrationSql.split('--> statement-breakpoint');
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  });

  afterAll(() => {
    sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  it('resolves scope inheritance chain for session → project → org → global', () => {
    // Create org, project, session
    const orgId = 'org-test';
    const projectId = 'proj-test';
    const sessionId = 'sess-test';

    db.insert(schema.organizations).values({
      id: orgId,
      name: 'Test Org',
    }).run();

    db.insert(schema.projects).values({
      id: projectId,
      orgId,
      name: 'Test Project',
    }).run();

    db.insert(schema.sessions).values({
      id: sessionId,
      projectId,
      name: 'Test Session',
      status: 'active',
    }).run();

    const chain = resolveScopeChain({
      type: 'session',
      id: sessionId,
      inherit: true,
    });

    // Expect order: session, project, org, global
    expect(chain).toHaveLength(4);
    expect(chain[0]).toEqual({ scopeType: 'session', scopeId: sessionId });
    expect(chain[1]).toEqual({ scopeType: 'project', scopeId: projectId });
    expect(chain[2]).toEqual({ scopeType: 'org', scopeId: orgId });
    expect(chain[3]).toEqual({ scopeType: 'global', scopeId: null });
  });

  it('returns guidelines ranked and filtered by scope and tags', () => {
    const projectId = 'proj-query';
    const sessionId = 'sess-query';

    db.insert(schema.projects).values({
      id: projectId,
      name: 'Query Project',
    }).run();

    db.insert(schema.sessions).values({
      id: sessionId,
      projectId,
      name: 'Query Session',
      status: 'active',
    }).run();

    // Global guideline
    db.insert(schema.guidelines).values({
      id: 'guide-global',
      scopeType: 'global',
      name: 'global_guideline',
      priority: 50,
      isActive: true,
    }).run();

    db.insert(schema.guidelineVersions).values({
      id: 'gv-global-1',
      guidelineId: 'guide-global',
      versionNum: 1,
      content: 'Global content',
    }).run();

    // Project guideline with higher priority
    db.insert(schema.guidelines).values({
      id: 'guide-project',
      scopeType: 'project',
      scopeId: projectId,
      name: 'project_guideline',
      category: 'security',
      priority: 90,
      isActive: true,
    }).run();

    db.insert(schema.guidelineVersions).values({
      id: 'gv-project-1',
      guidelineId: 'guide-project',
      versionNum: 1,
      content: 'Project-specific content about authentication',
    }).run();

    // Tag the project guideline as security
    db.insert(schema.tags).values({
      id: 'tag-security',
      name: 'security',
      category: 'domain',
      isPredefined: false,
    }).run();

    db.insert(schema.entryTags).values({
      id: 'et-guide-project-security',
      entryType: 'guideline',
      entryId: 'guide-project',
      tagId: 'tag-security',
    }).run();

    const result = executeMemoryQuery({
      types: ['guidelines'],
      scope: { type: 'session', id: sessionId, inherit: true },
      tags: { include: ['security'] },
      search: 'authentication',
      includeVersions: false,
      compact: true,
    });

    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first.type).toBe('guideline');
    expect(first.scopeType).toBe('project');
    expect(first.scopeId).toBe(projectId);
  });
});


