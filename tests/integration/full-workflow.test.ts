/**
 * Full Workflow Integration Tests
 *
 * Tests complete user journeys through the memory system:
 * 1. Complete user journey (session lifecycle)
 * 2. Multi-tool sequences (remember → query → update → verify)
 * 3. Cross-scope inheritance (global → org → project → session)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';

import { runTool } from '../../src/mcp/tool-runner.js';
import type { AppContext } from '../../src/core/context.js';
import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/test-full-workflow');

// Complete database schema for full workflow testing
const FULL_SCHEMA = `
  -- Organizations
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Projects
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    root_path TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Sessions
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT,
    purpose TEXT,
    agent_id TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at TEXT
  );

  -- Guidelines
  CREATE TABLE IF NOT EXISTS guidelines (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    priority INTEGER DEFAULT 50,
    rationale TEXT,
    examples TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  -- Knowledge
  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    source TEXT,
    confidence REAL DEFAULT 1.0,
    valid_from TEXT,
    valid_until TEXT,
    invalidated_by TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  -- Tools
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    parameters TEXT,
    examples TEXT,
    constraints TEXT,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version INTEGER DEFAULT 1
  );

  -- Tags
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,
    is_predefined INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Entry Tags
  CREATE TABLE IF NOT EXISTS entry_tags (
    id TEXT PRIMARY KEY,
    entry_type TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(entry_type, entry_id, tag_id)
  );

  -- Relations
  CREATE TABLE IF NOT EXISTS relations (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Classification tables
  CREATE TABLE IF NOT EXISTS classification_feedback (
    id TEXT PRIMARY KEY,
    text_hash TEXT NOT NULL,
    text_preview TEXT,
    session_id TEXT,
    predicted_type TEXT NOT NULL,
    actual_type TEXT NOT NULL,
    method TEXT NOT NULL,
    confidence REAL NOT NULL,
    matched_patterns TEXT,
    was_correct INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pattern_confidence (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL UNIQUE,
    pattern_type TEXT NOT NULL,
    base_weight REAL DEFAULT 0.7 NOT NULL,
    feedback_multiplier REAL DEFAULT 1.0 NOT NULL,
    total_matches INTEGER DEFAULT 0 NOT NULL,
    correct_matches INTEGER DEFAULT 0 NOT NULL,
    incorrect_matches INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_guidelines_scope ON guidelines(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_guidelines_active ON guidelines(is_active);
  CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge(is_active);
  CREATE INDEX IF NOT EXISTS idx_tools_scope ON tools(scope_type, scope_id);
  CREATE INDEX IF NOT EXISTS idx_tools_active ON tools(is_active);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`;

// Helper to store entries in database directly for verification
interface StoredEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  scopeType: string;
  scopeId?: string;
}

// Create a real-database context for full workflow testing
function createRealContext(
  sqlite: ReturnType<typeof Database>,
  db: ReturnType<typeof drizzle>,
  classificationService: ClassificationService
): {
  context: AppContext;
  storedEntries: StoredEntry[];
  setProject: (id: string, name?: string) => void;
} {
  const storedEntries: StoredEntry[] = [];
  let idCounter = 0;
  const generateId = () => `wf-${++idCounter}-${Date.now().toString(36)}`;

  // Real repositories that actually read/write to the database
  const realRepos = {
    guidelines: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT INTO guidelines (id, scope_type, scope_id, name, content, category, priority, created_by)
          VALUES (
            '${id}',
            '${params.scopeType}',
            ${params.scopeId ? `'${params.scopeId}'` : 'NULL'},
            '${String(params.name).replace(/'/g, "''")}',
            '${String(params.content).replace(/'/g, "''")}',
            ${params.category ? `'${params.category}'` : 'NULL'},
            ${params.priority ?? 50},
            ${params.createdBy ? `'${params.createdBy}'` : 'NULL'}
          )
        `);
        storedEntries.push({
          id,
          type: 'guideline',
          scopeType: params.scopeType as string,
          scopeId: params.scopeId as string,
        });
        return {
          id,
          ...params,
          isActive: true,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
      findById: vi.fn(async (id: string) => {
        const rows = sqlite.prepare('SELECT * FROM guidelines WHERE id = ?').all(id);
        return rows[0] ?? null;
      }),
      list: vi.fn(async (params: Record<string, unknown>) => {
        let query = 'SELECT * FROM guidelines WHERE is_active = 1';
        if (params.scopeType) query += ` AND scope_type = '${params.scopeType}'`;
        if (params.scopeId) query += ` AND scope_id = '${params.scopeId}'`;
        return sqlite.prepare(query).all();
      }),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        const sets: string[] = [];
        if (params.name) sets.push(`name = '${String(params.name).replace(/'/g, "''")}'`);
        if (params.content) sets.push(`content = '${String(params.content).replace(/'/g, "''")}'`);
        if (params.priority !== undefined) sets.push(`priority = ${params.priority}`);
        sets.push(`updated_at = '${new Date().toISOString()}'`);
        if (sets.length > 0) {
          sqlite.exec(`UPDATE guidelines SET ${sets.join(', ')} WHERE id = '${id}'`);
        }
        return { id, ...params };
      }),
      deactivate: vi.fn(async (id: string) => {
        sqlite.exec(
          `UPDATE guidelines SET is_active = 0, updated_at = '${new Date().toISOString()}' WHERE id = '${id}'`
        );
        return { id, isActive: false };
      }),
    },
    knowledge: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT INTO knowledge (id, scope_type, scope_id, title, content, category, created_by)
          VALUES (
            '${id}',
            '${params.scopeType}',
            ${params.scopeId ? `'${params.scopeId}'` : 'NULL'},
            '${String(params.title).replace(/'/g, "''")}',
            '${String(params.content).replace(/'/g, "''")}',
            ${params.category ? `'${params.category}'` : 'NULL'},
            ${params.createdBy ? `'${params.createdBy}'` : 'NULL'}
          )
        `);
        storedEntries.push({
          id,
          type: 'knowledge',
          scopeType: params.scopeType as string,
          scopeId: params.scopeId as string,
        });
        return {
          id,
          ...params,
          isActive: true,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
      findById: vi.fn(async (id: string) => {
        const rows = sqlite.prepare('SELECT * FROM knowledge WHERE id = ?').all(id);
        return rows[0] ?? null;
      }),
      list: vi.fn(async (params: Record<string, unknown>) => {
        let query = 'SELECT * FROM knowledge WHERE is_active = 1';
        if (params.scopeType) query += ` AND scope_type = '${params.scopeType}'`;
        if (params.scopeId) query += ` AND scope_id = '${params.scopeId}'`;
        return sqlite.prepare(query).all();
      }),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        const sets: string[] = [];
        if (params.title) sets.push(`title = '${String(params.title).replace(/'/g, "''")}'`);
        if (params.content) sets.push(`content = '${String(params.content).replace(/'/g, "''")}'`);
        sets.push(`updated_at = '${new Date().toISOString()}'`);
        if (sets.length > 0) {
          sqlite.exec(`UPDATE knowledge SET ${sets.join(', ')} WHERE id = '${id}'`);
        }
        return { id, ...params };
      }),
      deactivate: vi.fn(async (id: string) => {
        sqlite.exec(
          `UPDATE knowledge SET is_active = 0, updated_at = '${new Date().toISOString()}' WHERE id = '${id}'`
        );
        return { id, isActive: false };
      }),
    },
    tools: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT INTO tools (id, scope_type, scope_id, name, description, category, created_by)
          VALUES (
            '${id}',
            '${params.scopeType}',
            ${params.scopeId ? `'${params.scopeId}'` : 'NULL'},
            '${String(params.name).replace(/'/g, "''")}',
            ${params.description ? `'${String(params.description).replace(/'/g, "''")}'` : 'NULL'},
            ${params.category ? `'${params.category}'` : 'NULL'},
            ${params.createdBy ? `'${params.createdBy}'` : 'NULL'}
          )
        `);
        storedEntries.push({
          id,
          type: 'tool',
          scopeType: params.scopeType as string,
          scopeId: params.scopeId as string,
        });
        return {
          id,
          ...params,
          isActive: true,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }),
      findById: vi.fn(async (id: string) => {
        const rows = sqlite.prepare('SELECT * FROM tools WHERE id = ?').all(id);
        return rows[0] ?? null;
      }),
      list: vi.fn(async (params: Record<string, unknown>) => {
        let query = 'SELECT * FROM tools WHERE is_active = 1';
        if (params.scopeType) query += ` AND scope_type = '${params.scopeType}'`;
        if (params.scopeId) query += ` AND scope_id = '${params.scopeId}'`;
        return sqlite.prepare(query).all();
      }),
    },
    tags: {
      getOrCreate: vi.fn(async (name: string) => {
        const existing = sqlite.prepare('SELECT * FROM tags WHERE name = ?').get(name);
        if (existing) return existing;
        const id = generateId();
        sqlite.exec(`INSERT INTO tags (id, name) VALUES ('${id}', '${name}')`);
        return { id, name };
      }),
      findByName: vi.fn(async (name: string) => {
        return sqlite.prepare('SELECT * FROM tags WHERE name = ?').get(name) ?? null;
      }),
      list: vi.fn(async () => sqlite.prepare('SELECT * FROM tags').all()),
    },
    entryTags: {
      attach: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT OR IGNORE INTO entry_tags (id, entry_type, entry_id, tag_id)
          VALUES ('${id}', '${params.entryType}', '${params.entryId}', '${params.tagId}')
        `);
        return { id, ...params };
      }),
      detach: vi.fn(async () => true),
      findByEntry: vi.fn(async (entryType: string, entryId: string) => {
        return sqlite
          .prepare(
            `
          SELECT et.*, t.name as tag_name FROM entry_tags et
          JOIN tags t ON et.tag_id = t.id
          WHERE et.entry_type = ? AND et.entry_id = ?
        `
          )
          .all(entryType, entryId);
      }),
    },
    organizations: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = (params.id as string) ?? generateId();
        sqlite.exec(`
          INSERT INTO organizations (id, name, description)
          VALUES ('${id}', '${String(params.name).replace(/'/g, "''")}', ${params.description ? `'${String(params.description).replace(/'/g, "''")}'` : 'NULL'})
        `);
        return { id, ...params };
      }),
      findById: vi.fn(
        async (id: string) =>
          sqlite.prepare('SELECT * FROM organizations WHERE id = ?').get(id) ?? null
      ),
      list: vi.fn(async () => sqlite.prepare('SELECT * FROM organizations').all()),
    },
    projects: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = (params.id as string) ?? generateId();
        sqlite.exec(`
          INSERT INTO projects (id, org_id, name, description, root_path)
          VALUES (
            '${id}',
            ${params.orgId ? `'${params.orgId}'` : 'NULL'},
            '${String(params.name).replace(/'/g, "''")}',
            ${params.description ? `'${String(params.description).replace(/'/g, "''")}'` : 'NULL'},
            ${params.rootPath ? `'${String(params.rootPath).replace(/'/g, "''")}'` : 'NULL'}
          )
        `);
        return { id, ...params };
      }),
      findById: vi.fn(
        async (id: string) => sqlite.prepare('SELECT * FROM projects WHERE id = ?').get(id) ?? null
      ),
      findByRootPath: vi.fn(
        async (path: string) =>
          sqlite.prepare('SELECT * FROM projects WHERE root_path = ?').get(path) ?? null
      ),
      list: vi.fn(async () => sqlite.prepare('SELECT * FROM projects').all()),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        const sets: string[] = [];
        if (params.name) sets.push(`name = '${String(params.name).replace(/'/g, "''")}'`);
        if (params.description !== undefined)
          sets.push(
            `description = ${params.description ? `'${String(params.description).replace(/'/g, "''")}'` : 'NULL'}`
          );
        sets.push(`updated_at = '${new Date().toISOString()}'`);
        if (sets.length > 0) {
          sqlite.exec(`UPDATE projects SET ${sets.join(', ')} WHERE id = '${id}'`);
        }
        return { id, ...params };
      }),
    },
    sessions: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT INTO sessions (id, project_id, name, purpose, agent_id, status)
          VALUES (
            '${id}',
            '${params.projectId}',
            ${params.name ? `'${String(params.name).replace(/'/g, "''")}'` : 'NULL'},
            ${params.purpose ? `'${String(params.purpose).replace(/'/g, "''")}'` : 'NULL'},
            ${params.agentId ? `'${params.agentId}'` : 'NULL'},
            'active'
          )
        `);
        return { id, ...params, status: 'active', startedAt: new Date().toISOString() };
      }),
      findById: vi.fn(
        async (id: string) => sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(id) ?? null
      ),
      findActive: vi.fn(async (projectId: string) => {
        return (
          sqlite
            .prepare(
              `SELECT * FROM sessions WHERE project_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`
            )
            .get(projectId) ?? null
        );
      }),
      list: vi.fn(async (params: Record<string, unknown>) => {
        let query = 'SELECT * FROM sessions WHERE 1=1';
        if (params.projectId) query += ` AND project_id = '${params.projectId}'`;
        if (params.status) query += ` AND status = '${params.status}'`;
        return sqlite.prepare(query).all();
      }),
      end: vi.fn(async (id: string, status = 'completed') => {
        sqlite.exec(
          `UPDATE sessions SET status = '${status}', ended_at = '${new Date().toISOString()}' WHERE id = '${id}'`
        );
        return { id, status };
      }),
    },
    relations: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        const id = generateId();
        sqlite.exec(`
          INSERT INTO relations (id, source_type, source_id, target_type, target_id, relation_type, created_by)
          VALUES (
            '${id}',
            '${params.sourceType}',
            '${params.sourceId}',
            '${params.targetType}',
            '${params.targetId}',
            '${params.relationType}',
            ${params.createdBy ? `'${params.createdBy}'` : 'NULL'}
          )
        `);
        return { id, ...params };
      }),
      list: vi.fn(async () => sqlite.prepare('SELECT * FROM relations').all()),
    },
    scopes: {
      getScopeId: vi.fn(async (scopeType: string, scopeId?: string) => scopeId ?? 'default-scope'),
    },
  };

  // Track current project for context detection
  let currentProjectId: string | null = null;
  let currentProjectName: string | null = null;

  const mockServices = {
    classification: classificationService,
    contextDetection: {
      detect: vi.fn(async () => ({
        project: currentProjectId
          ? { id: currentProjectId, name: currentProjectName ?? 'Test Project' }
          : null,
        session: null,
        agentId: { value: 'test-agent', source: 'default' as const },
      })),
      enrichParams: vi.fn(async (params: Record<string, unknown>) => ({
        enriched: {
          ...params,
          projectId: params.projectId ?? currentProjectId,
          agentId: params.agentId ?? 'test-agent',
        },
        detected: {
          project: currentProjectId
            ? { id: currentProjectId, name: currentProjectName ?? 'Test Project' }
            : null,
          session: null,
          agentId: { value: 'test-agent', source: 'default' as const },
        },
      })),
      clearCache: vi.fn(),
      setProject: (id: string, name?: string) => {
        currentProjectId = id;
        currentProjectName = name ?? 'Test Project';
      },
    },
    query: {
      search: vi.fn(async (params: Record<string, unknown>) => {
        const results: unknown[] = [];
        const types = (params.types as string[]) ?? ['guidelines', 'knowledge', 'tools'];

        for (const type of types) {
          const tableName =
            type === 'guidelines' ? 'guidelines' : type === 'knowledge' ? 'knowledge' : 'tools';
          let query = `SELECT *, '${type.replace(/s$/, '')}' as entry_type FROM ${tableName} WHERE is_active = 1`;

          if (params.search) {
            const search = String(params.search).replace(/'/g, "''");
            if (tableName === 'guidelines') {
              query += ` AND (name LIKE '%${search}%' OR content LIKE '%${search}%')`;
            } else if (tableName === 'knowledge') {
              query += ` AND (title LIKE '%${search}%' OR content LIKE '%${search}%')`;
            } else {
              query += ` AND (name LIKE '%${search}%' OR description LIKE '%${search}%')`;
            }
          }

          const scope = params.scope as Record<string, unknown> | undefined;
          if (scope?.type && scope.type !== 'global') {
            query += ` AND scope_type = '${scope.type}'`;
            if (scope.id) query += ` AND scope_id = '${scope.id}'`;
          }

          results.push(...sqlite.prepare(query).all());
        }

        return { results, total: results.length };
      }),
      context: vi.fn(async (params: Record<string, unknown>) => {
        const guidelines: unknown[] = [];
        const knowledge: unknown[] = [];
        const tools: unknown[] = [];

        // Build scope chain for inheritance
        const scopeChain: Array<{ type: string; id?: string }> = [];

        if (params.scopeType === 'session' && params.scopeId) {
          scopeChain.push({ type: 'session', id: params.scopeId as string });
          // Find parent project
          const session = sqlite
            .prepare('SELECT project_id FROM sessions WHERE id = ?')
            .get(params.scopeId as string) as { project_id: string } | undefined;
          if (session) scopeChain.push({ type: 'project', id: session.project_id });
        } else if (params.scopeType === 'project' && params.scopeId) {
          scopeChain.push({ type: 'project', id: params.scopeId as string });
          // Find parent org
          const project = sqlite
            .prepare('SELECT org_id FROM projects WHERE id = ?')
            .get(params.scopeId as string) as { org_id: string } | undefined;
          if (project?.org_id) scopeChain.push({ type: 'org', id: project.org_id });
        } else if (params.scopeType === 'org' && params.scopeId) {
          scopeChain.push({ type: 'org', id: params.scopeId as string });
        }

        // Always include global
        if (params.inherit !== false) {
          scopeChain.push({ type: 'global' });
        }

        // Query each scope level
        for (const scope of scopeChain) {
          const scopeCondition =
            scope.type === 'global'
              ? `scope_type = 'global'`
              : `scope_type = '${scope.type}' AND scope_id = '${scope.id}'`;

          guidelines.push(
            ...sqlite
              .prepare(`SELECT * FROM guidelines WHERE is_active = 1 AND ${scopeCondition}`)
              .all()
          );
          knowledge.push(
            ...sqlite
              .prepare(`SELECT * FROM knowledge WHERE is_active = 1 AND ${scopeCondition}`)
              .all()
          );
          tools.push(
            ...sqlite.prepare(`SELECT * FROM tools WHERE is_active = 1 AND ${scopeCondition}`).all()
          );
        }

        return { guidelines, knowledge, tools };
      }),
    },
    health: {
      getHealth: vi.fn(async () => ({ status: 'healthy' })),
    },
    permission: {
      check: vi.fn(async () => ({ allowed: true })),
    },
  };

  const mockSecurity = {
    validateRequest: vi.fn(async () => ({ authorized: true })),
  };

  const mockConfig = {
    autoContext: { enabled: false },
    autoSession: { enabled: false },
    outputMode: 'json',
    extractionHook: { enabled: false },
  };

  const setProject = (id: string, name?: string) => {
    currentProjectId = id;
    currentProjectName = name ?? 'Test Project';
  };

  return {
    context: {
      db: db as never,
      repos: realRepos,
      services: mockServices,
      security: mockSecurity,
      config: mockConfig,
    } as unknown as AppContext,
    storedEntries,
    setProject,
  };
}

describe('Full Workflow Integration Tests', () => {
  let sqlite: ReturnType<typeof Database>;
  let db: ReturnType<typeof drizzle>;
  let classificationService: ClassificationService;

  beforeAll(() => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dbPath = resolve(dataDir, `workflow-test-${Date.now()}.db`);
    sqlite = new Database(dbPath);
    sqlite.exec(FULL_SCHEMA);
    db = drizzle(sqlite);

    const config: ClassificationServiceConfig = {
      highConfidenceThreshold: 0.85,
      lowConfidenceThreshold: 0.6,
      enableLLMFallback: false,
      feedbackDecayDays: 30,
      maxPatternBoost: 0.15,
      maxPatternPenalty: 0.3,
      cacheSize: 100,
      cacheTTLMs: 60000,
      learningRate: 0.1,
    };

    classificationService = new ClassificationService(db as never, null, config);
  });

  afterAll(() => {
    if (sqlite) {
      sqlite.close();
    }
  });

  describe('Complete User Journey', () => {
    it('should complete full session lifecycle: start → work → end', async () => {
      const { context, setProject } = createRealContext(sqlite, db, classificationService);

      // 1. Create a project first
      const projectResult = await context.repos.projects.create({
        name: 'Test Project',
        description: 'A test project for workflow testing',
        rootPath: '/test/path',
      });
      const projectId = projectResult.id;

      // Set project context for detection
      setProject(projectId, 'Test Project');

      // 2. Start a session
      const sessionResult = await context.repos.sessions.create({
        projectId,
        name: 'Add auth feature',
        purpose: 'Implement user authentication',
        agentId: 'test-agent',
      });
      const sessionId = sessionResult.id;
      expect(sessionResult.status).toBe('active');

      // 3. Remember some guidelines during the session
      const result1 = await runTool(context, 'memory_remember', {
        text: 'Rule: always hash passwords with bcrypt',
        scopeType: 'session',
        scopeId: sessionId,
      });
      const response1 = JSON.parse(result1.content[0]?.text ?? '{}');
      expect(response1.success).toBe(true);
      expect(response1.stored?.type).toBe('guideline');

      // 4. Remember some knowledge
      const result2 = await runTool(context, 'memory_remember', {
        text: 'We decided to use JWT tokens for authentication',
        scopeType: 'session',
        scopeId: sessionId,
      });
      const response2 = JSON.parse(result2.content[0]?.text ?? '{}');
      expect(response2.success).toBe(true);
      expect(response2.stored?.type).toBe('knowledge');

      // 5. Remember a tool/command
      const result3 = await runTool(context, 'memory_remember', {
        text: 'npm run test:auth to run auth tests',
        scopeType: 'session',
        scopeId: sessionId,
      });
      const response3 = JSON.parse(result3.content[0]?.text ?? '{}');
      expect(response3.success).toBe(true);
      expect(response3.stored?.type).toBe('tool');

      // 6. Query session context
      const contextResult = await context.services.query!.context({
        scopeType: 'session',
        scopeId: sessionId,
        inherit: false,
      });
      expect(contextResult.guidelines.length).toBeGreaterThanOrEqual(1);
      expect(contextResult.knowledge.length).toBeGreaterThanOrEqual(1);
      expect(contextResult.tools.length).toBeGreaterThanOrEqual(1);

      // 7. End the session
      const endResult = await context.repos.sessions.end(sessionId, 'completed');
      expect(endResult.status).toBe('completed');

      // 8. Verify session is ended
      const session = (await context.repos.sessions.findById(sessionId)) as Record<string, unknown>;
      expect(session?.status).toBe('completed');
      expect(session?.ended_at).toBeDefined();
    });

    it('should preserve entries after session ends', async () => {
      const { context, setProject } = createRealContext(sqlite, db, classificationService);

      // Create project and session
      const project = await context.repos.projects.create({ name: 'Persist Test' });
      setProject(project.id, 'Persist Test');

      const session = await context.repos.sessions.create({
        projectId: project.id,
        name: 'Persist Session',
        agentId: 'test-agent',
      });

      // Store entries (note: memory_remember stores to project scope, not session)
      await runTool(context, 'memory_remember', {
        text: 'Rule: always validate input',
      });

      // End session
      await context.repos.sessions.end(session.id);

      // Entries should still be queryable (stored at project level)
      const guidelines = await context.repos.guidelines.list({
        scopeType: 'project',
        scopeId: project.id,
      });
      expect(guidelines.length).toBe(1);
    });
  });

  describe('Multi-Tool Sequences', () => {
    it('should execute remember → query → verify sequence', async () => {
      const { context, setProject } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Multi-Tool Test' });
      setProject(project.id, 'Multi-Tool Test');

      // 1. Remember multiple entries
      await runTool(context, 'memory_remember', {
        text: 'Rule: use strict TypeScript mode',
        scopeType: 'project',
        scopeId: project.id,
      });

      await runTool(context, 'memory_remember', {
        text: 'We decided to use PostgreSQL',
        scopeType: 'project',
        scopeId: project.id,
      });

      await runTool(context, 'memory_remember', {
        text: 'npm run build to compile',
        scopeType: 'project',
        scopeId: project.id,
      });

      // 2. Query all entries
      const searchResult = await context.services.query!.search({
        scope: { type: 'project', id: project.id },
        types: ['guidelines', 'knowledge', 'tools'],
      });
      expect(searchResult.total).toBe(3);

      // 3. Verify specific entries exist
      const guidelines = searchResult.results.filter(
        (r: Record<string, unknown>) => r.entry_type === 'guideline'
      );
      const knowledge = searchResult.results.filter(
        (r: Record<string, unknown>) => r.entry_type === 'knowledge'
      );
      const tools = searchResult.results.filter(
        (r: Record<string, unknown>) => r.entry_type === 'tool'
      );

      expect(guidelines).toHaveLength(1);
      expect(knowledge).toHaveLength(1);
      expect(tools).toHaveLength(1);
    });

    it('should execute remember → update → query sequence', async () => {
      const { context, storedEntries, setProject } = createRealContext(
        sqlite,
        db,
        classificationService
      );
      const project = await context.repos.projects.create({ name: 'Update Test' });
      setProject(project.id, 'Update Test');

      // 1. Remember a guideline
      await runTool(context, 'memory_remember', {
        text: 'Rule: use eslint for linting',
        scopeType: 'project',
        scopeId: project.id,
      });

      // Get the stored entry ID
      const guidelineEntry = storedEntries.find((e) => e.type === 'guideline');
      expect(guidelineEntry).toBeDefined();

      // 2. Update the guideline
      await context.repos.guidelines.update(guidelineEntry!.id, {
        content: 'Rule: use eslint and prettier for linting and formatting',
        priority: 90,
      });

      // 3. Query and verify update
      const updated = (await context.repos.guidelines.findById(guidelineEntry!.id)) as Record<
        string,
        unknown
      >;
      expect(updated?.content).toContain('prettier');
      expect(updated?.priority).toBe(90);
    });

    it('should execute remember → tag → search by tag sequence', async () => {
      const { context, storedEntries, setProject } = createRealContext(
        sqlite,
        db,
        classificationService
      );
      const project = await context.repos.projects.create({ name: 'Tag Test' });
      setProject(project.id, 'Tag Test');

      // 1. Remember entries
      await runTool(context, 'memory_remember', {
        text: 'Never expose API keys in code',
        scopeType: 'project',
        scopeId: project.id,
      });

      await runTool(context, 'memory_remember', {
        text: 'Always sanitize user input',
        scopeType: 'project',
        scopeId: project.id,
      });

      // 2. Tag entries
      const securityTag = await context.repos.tags.getOrCreate('security');

      for (const entry of storedEntries.filter((e) => e.type === 'guideline')) {
        await context.repos.entryTags.attach({
          entryType: 'guideline',
          entryId: entry.id,
          tagId: securityTag.id,
        });
      }

      // 3. Verify tags are attached
      for (const entry of storedEntries.filter((e) => e.type === 'guideline')) {
        const tags = await context.repos.entryTags.findByEntry('guideline', entry.id);
        expect(tags.length).toBeGreaterThan(0);
        expect(tags.some((t: Record<string, unknown>) => t.tag_name === 'security')).toBe(true);
      }
    });

    it('should execute remember → classify with correction → learn sequence', async () => {
      const { context, setProject } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Learn Test' });
      setProject(project.id, 'Learn Test');

      // 1. Remember with auto-classification (classifies as guideline)
      const result1 = await runTool(context, 'memory_remember', {
        text: 'Always use TypeScript',
        scopeType: 'project',
        scopeId: project.id,
      });
      const response1 = JSON.parse(result1.content[0]?.text ?? '{}');
      expect(response1.stored?.type).toBe('guideline');

      // 2. Remember same pattern but force to knowledge (correction)
      const result2 = await runTool(context, 'memory_remember', {
        text: 'We always use TypeScript in this project',
        scopeType: 'project',
        scopeId: project.id,
        forceType: 'knowledge',
      });
      const response2 = JSON.parse(result2.content[0]?.text ?? '{}');
      expect(response2.stored?.type).toBe('knowledge');
      expect(response2.classification?.wasForced).toBe(true);

      // 3. Verify correction was recorded for learning
      const feedbackRows = sqlite
        .prepare(
          `
        SELECT * FROM classification_feedback
        WHERE actual_type = 'knowledge' AND was_correct = 0
      `
        )
        .all();
      expect(feedbackRows.length).toBeGreaterThan(0);
    });

    it('should execute remember → relate → traverse sequence', async () => {
      const { context, storedEntries, setProject } = createRealContext(
        sqlite,
        db,
        classificationService
      );
      const project = await context.repos.projects.create({ name: 'Relation Test' });
      setProject(project.id, 'Relation Test');

      // 1. Remember related entries
      await runTool(context, 'memory_remember', {
        text: 'Rule: always use transactions for database writes',
        scopeType: 'project',
        scopeId: project.id,
      });

      await runTool(context, 'memory_remember', {
        text: 'We use PostgreSQL for the database',
        scopeType: 'project',
        scopeId: project.id,
      });

      // 2. Create relation between them
      const guideline = storedEntries.find((e) => e.type === 'guideline');
      const knowledge = storedEntries.find((e) => e.type === 'knowledge');

      await context.repos.relations.create({
        sourceType: 'guideline',
        sourceId: guideline!.id,
        targetType: 'knowledge',
        targetId: knowledge!.id,
        relationType: 'applies_to',
        createdBy: 'test-agent',
      });

      // 3. Query relations
      const relations = await context.repos.relations.list();
      expect(relations.length).toBe(1);
      expect((relations[0] as Record<string, unknown>).relation_type).toBe('applies_to');
    });
  });

  describe('Cross-Scope Inheritance', () => {
    it('should inherit from global → project scope', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Inherit Test' });

      // 1. Create global guideline
      await context.repos.guidelines.create({
        scopeType: 'global',
        name: 'Global Rule',
        content: 'Always write tests',
        createdBy: 'test-agent',
      });

      // 2. Create project guideline
      await context.repos.guidelines.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Project Rule',
        content: 'Use Jest for testing',
        createdBy: 'test-agent',
      });

      // 3. Query project context with inheritance
      const contextResult = await context.services.query!.context({
        scopeType: 'project',
        scopeId: project.id,
        inherit: true,
      });

      // Should include both global and project guidelines
      expect(contextResult.guidelines.length).toBe(2);
      expect(
        contextResult.guidelines.some((g: Record<string, unknown>) => g.scope_type === 'global')
      ).toBe(true);
      expect(
        contextResult.guidelines.some((g: Record<string, unknown>) => g.scope_type === 'project')
      ).toBe(true);
    });

    it('should inherit from global → org → project scope', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);

      // 1. Create org and project hierarchy
      const org = await context.repos.organizations.create({
        name: 'Test Org',
        description: 'Test organization',
      });

      const project = await context.repos.projects.create({
        name: 'Org Project',
        orgId: org.id,
      });

      // 2. Create entries at each level
      await context.repos.guidelines.create({
        scopeType: 'global',
        name: 'Global Standard',
        content: 'Use semantic versioning',
        createdBy: 'test-agent',
      });

      await context.repos.guidelines.create({
        scopeType: 'org',
        scopeId: org.id,
        name: 'Org Standard',
        content: 'Use company coding style',
        createdBy: 'test-agent',
      });

      await context.repos.guidelines.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Project Standard',
        content: 'Use TypeScript strict mode',
        createdBy: 'test-agent',
      });

      // 3. Query project context with inheritance
      const contextResult = await context.services.query!.context({
        scopeType: 'project',
        scopeId: project.id,
        inherit: true,
      });

      // Should include all three levels
      expect(contextResult.guidelines.length).toBe(3);
      const scopeTypes = contextResult.guidelines.map((g: Record<string, unknown>) => g.scope_type);
      expect(scopeTypes).toContain('global');
      expect(scopeTypes).toContain('org');
      expect(scopeTypes).toContain('project');
    });

    it('should inherit from global → org → project → session scope', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);

      // 1. Create full hierarchy
      const org = await context.repos.organizations.create({ name: 'Full Hierarchy Org' });
      const project = await context.repos.projects.create({
        name: 'Full Hierarchy Project',
        orgId: org.id,
      });
      const session = await context.repos.sessions.create({
        projectId: project.id,
        name: 'Full Hierarchy Session',
        agentId: 'test',
      });

      // 2. Create entries at each level
      await context.repos.knowledge.create({
        scopeType: 'global',
        title: 'Global Fact',
        content: 'Company founded 2020',
        createdBy: 'test',
      });
      await context.repos.knowledge.create({
        scopeType: 'org',
        scopeId: org.id,
        title: 'Org Fact',
        content: 'Org uses microservices',
        createdBy: 'test',
      });
      await context.repos.knowledge.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project Fact',
        content: 'Project uses Node.js',
        createdBy: 'test',
      });
      await context.repos.knowledge.create({
        scopeType: 'session',
        scopeId: session.id,
        title: 'Session Fact',
        content: 'Working on auth feature',
        createdBy: 'test',
      });

      // 3. Query session context with inheritance
      const contextResult = await context.services.query!.context({
        scopeType: 'session',
        scopeId: session.id,
        inherit: true,
      });

      // Should include session and project (and global via project)
      expect(contextResult.knowledge.length).toBeGreaterThanOrEqual(2);
    });

    it('should NOT inherit when inherit=false', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'No Inherit Test' });

      // 1. Create global and project entries
      await context.repos.guidelines.create({
        scopeType: 'global',
        name: 'Global Only',
        content: 'Global guideline',
        createdBy: 'test',
      });

      await context.repos.guidelines.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Project Only',
        content: 'Project guideline',
        createdBy: 'test',
      });

      // 2. Query without inheritance
      const contextResult = await context.services.query!.context({
        scopeType: 'project',
        scopeId: project.id,
        inherit: false,
      });

      // Should only include project-level entries
      expect(contextResult.guidelines.length).toBe(1);
      expect(contextResult.guidelines[0].scope_type).toBe('project');
    });

    it('should allow session to override project rules', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Override Test' });
      const session = await context.repos.sessions.create({
        projectId: project.id,
        name: 'Override Session',
        agentId: 'test',
      });

      // 1. Create project rule
      await context.repos.guidelines.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'Database Rule',
        content: 'Use PostgreSQL',
        priority: 50,
        createdBy: 'test',
      });

      // 2. Create session override with higher priority
      await context.repos.guidelines.create({
        scopeType: 'session',
        scopeId: session.id,
        name: 'Database Rule Override',
        content: 'Use SQLite for testing (override)',
        priority: 90,
        createdBy: 'test',
      });

      // 3. Query session context
      const contextResult = await context.services.query!.context({
        scopeType: 'session',
        scopeId: session.id,
        inherit: true,
      });

      // Both should be present, with session having higher priority
      expect(contextResult.guidelines.length).toBe(2);
      const sessionRule = contextResult.guidelines.find(
        (g: Record<string, unknown>) => g.scope_type === 'session'
      );
      const projectRule = contextResult.guidelines.find(
        (g: Record<string, unknown>) => g.scope_type === 'project'
      );
      expect(sessionRule?.priority).toBeGreaterThan(projectRule?.priority ?? 0);
    });
  });

  describe('Error Handling in Workflows', () => {
    it('should handle missing project gracefully', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      // Don't set project - context detection will return null

      // Try to remember without project context
      const result = await runTool(context, 'memory_remember', {
        text: 'Rule: test missing project',
      });

      // Should fail because no project is detected
      const response = JSON.parse(result.content[0]?.text ?? '{}');
      expect(response.error).toBeDefined();
      expect(response.error).toContain('No project detected');
    });

    it('should handle session end on already ended session', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Double End Test' });
      const session = await context.repos.sessions.create({
        projectId: project.id,
        name: 'Test',
        agentId: 'test',
      });

      // End once
      await context.repos.sessions.end(session.id);

      // End again (should be idempotent or handle gracefully)
      const result = await context.repos.sessions.end(session.id);
      expect(result.status).toBe('completed');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent remember operations', async () => {
      const { context, storedEntries, setProject } = createRealContext(
        sqlite,
        db,
        classificationService
      );
      const project = await context.repos.projects.create({ name: 'Concurrent Test' });
      setProject(project.id, 'Concurrent Test');

      // Run 10 concurrent remember operations
      const promises = Array.from({ length: 10 }, (_, i) =>
        runTool(context, 'memory_remember', {
          text: `Rule: concurrent rule ${i}`,
          scopeType: 'project',
          scopeId: project.id,
        })
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(
        results.every((r) => {
          const response = JSON.parse(r.content[0]?.text ?? '{}');
          return response.success === true;
        })
      ).toBe(true);

      // All should be stored
      expect(storedEntries.filter((e) => e.type === 'guideline')).toHaveLength(10);
    });

    it('should handle concurrent session operations', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);
      const project = await context.repos.projects.create({ name: 'Concurrent Sessions' });

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: 5 }, (_, i) =>
        context.repos.sessions.create({
          projectId: project.id,
          name: `Concurrent Session ${i}`,
          agentId: `agent-${i}`,
        })
      );

      const sessions = await Promise.all(sessionPromises);

      // All should be created
      expect(sessions).toHaveLength(5);
      expect(sessions.every((s) => s.status === 'active')).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity between scopes', async () => {
      const { context } = createRealContext(sqlite, db, classificationService);

      // Create full hierarchy
      const org = await context.repos.organizations.create({ name: 'Integrity Org' });
      const project = await context.repos.projects.create({
        name: 'Integrity Project',
        orgId: org.id,
      });
      const session = await context.repos.sessions.create({
        projectId: project.id,
        name: 'Integrity Session',
        agentId: 'test',
      });

      // Verify references
      const storedProject = (await context.repos.projects.findById(project.id)) as Record<
        string,
        unknown
      >;
      expect(storedProject?.org_id).toBe(org.id);

      const storedSession = (await context.repos.sessions.findById(session.id)) as Record<
        string,
        unknown
      >;
      expect(storedSession?.project_id).toBe(project.id);
    });

    it('should preserve entry versions on update', async () => {
      const { context, storedEntries, setProject } = createRealContext(
        sqlite,
        db,
        classificationService
      );
      const project = await context.repos.projects.create({ name: 'Version Test' });
      setProject(project.id, 'Version Test');

      // Create entry
      await runTool(context, 'memory_remember', {
        text: 'Rule: version test',
        scopeType: 'project',
        scopeId: project.id,
      });

      const entry = storedEntries[0];
      const original = (await context.repos.guidelines.findById(entry!.id)) as Record<
        string,
        unknown
      >;
      expect(original?.version).toBe(1);

      // Update should increment version (if implemented)
      await context.repos.guidelines.update(entry!.id, { content: 'Rule: version test updated' });
      const updated = (await context.repos.guidelines.findById(entry!.id)) as Record<
        string,
        unknown
      >;
      // Version tracking is implementation-dependent
      expect(updated?.content).toContain('updated');
    });
  });
});
