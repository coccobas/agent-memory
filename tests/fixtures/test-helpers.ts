import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';
import { generateId } from '../../src/db/repositories/base.js';

// Re-export schema for use in tests
export { schema };

export interface TestDb {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle>;
  path: string;
}

/**
 * Setup an isolated test database
 */
export function setupTestDb(dbPath: string): TestDb {
  // Ensure data directory exists
  if (!existsSync('./data')) {
    mkdirSync('./data', { recursive: true });
  }

  // Clean up any existing test database
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${dbPath}${suffix}`;
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  // Create test database
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Run migrations
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

  return { sqlite, db, path: dbPath };
}

/**
 * Clean up test database files
 */
export function cleanupTestDb(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${dbPath}${suffix}`;
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }
}

/**
 * Seed predefined tags (same as tagRepo.seedPredefined)
 */
export function seedPredefinedTags(db: ReturnType<typeof drizzle>): void {
  const predefinedTags = [
    // Languages
    {
      id: 'tag-lang-python',
      name: 'python',
      category: 'language' as const,
      description: 'Python programming language',
    },
    {
      id: 'tag-lang-typescript',
      name: 'typescript',
      category: 'language' as const,
      description: 'TypeScript programming language',
    },
    {
      id: 'tag-lang-javascript',
      name: 'javascript',
      category: 'language' as const,
      description: 'JavaScript programming language',
    },
    {
      id: 'tag-lang-sql',
      name: 'sql',
      category: 'language' as const,
      description: 'SQL query language',
    },
    // Domains
    {
      id: 'tag-domain-web',
      name: 'web',
      category: 'domain' as const,
      description: 'Web development',
    },
    {
      id: 'tag-domain-cli',
      name: 'cli',
      category: 'domain' as const,
      description: 'Command-line interfaces',
    },
    {
      id: 'tag-domain-database',
      name: 'database',
      category: 'domain' as const,
      description: 'Database design and operations',
    },
    {
      id: 'tag-domain-security',
      name: 'security',
      category: 'domain' as const,
      description: 'Security practices',
    },
    // Categories
    {
      id: 'tag-cat-behavior',
      name: 'behavior',
      category: 'category' as const,
      description: 'Agent behavior rules',
    },
    // Meta
    {
      id: 'tag-meta-required',
      name: 'required',
      category: 'meta' as const,
      description: 'Required/mandatory',
    },
    {
      id: 'tag-meta-deprecated',
      name: 'deprecated',
      category: 'meta' as const,
      description: 'Deprecated, should not be used',
    },
  ];

  for (const tag of predefinedTags) {
    db.insert(schema.tags)
      .values({
        id: tag.id,
        name: tag.name,
        category: tag.category,
        isPredefined: true,
        description: tag.description,
      })
      .run();
  }
}

/**
 * Create a test organization
 */
export function createTestOrg(
  db: ReturnType<typeof drizzle>,
  name: string = 'Test Org',
  metadata?: Record<string, unknown>
): schema.Organization {
  const id = generateId();
  db.insert(schema.organizations)
    .values({
      id,
      name,
      metadata,
    })
    .run();
  return db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).get()!;
}

/**
 * Create a test project
 */
export function createTestProject(
  db: ReturnType<typeof drizzle>,
  name: string = 'Test Project',
  orgId?: string,
  description?: string,
  rootPath?: string,
  metadata?: Record<string, unknown>
): schema.Project {
  const id = generateId();
  db.insert(schema.projects)
    .values({
      id,
      orgId,
      name,
      description,
      rootPath,
      metadata,
    })
    .run();
  return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()!;
}

/**
 * Create a test session
 */
export function createTestSession(
  db: ReturnType<typeof drizzle>,
  projectId?: string,
  name?: string,
  purpose?: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): schema.Session {
  const id = generateId();
  db.insert(schema.sessions)
    .values({
      id,
      projectId,
      name,
      purpose,
      agentId,
      status: 'active',
      metadata,
    })
    .run();
  return db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()!;
}

/**
 * Create a test tool with version
 */
export function createTestTool(
  db: ReturnType<typeof drizzle>,
  name: string,
  scopeType: 'global' | 'org' | 'project' | 'session' = 'global',
  scopeId?: string,
  category: 'mcp' | 'cli' | 'function' | 'api' = 'function',
  description?: string
): { tool: schema.Tool; version: schema.ToolVersion } {
  const toolId = generateId();
  const versionId = generateId();

  db.insert(schema.tools)
    .values({
      id: toolId,
      scopeType,
      scopeId,
      name,
      category,
      isActive: true,
    })
    .run();

  db.insert(schema.toolVersions)
    .values({
      id: versionId,
      toolId,
      versionNum: 1,
      description: description || `Test tool: ${name}`,
      changeReason: 'Initial version',
    })
    .run();

  db.update(schema.tools)
    .set({ currentVersionId: versionId })
    .where(eq(schema.tools.id, toolId))
    .run();

  return {
    tool: db.select().from(schema.tools).where(eq(schema.tools.id, toolId)).get()!,
    version: db
      .select()
      .from(schema.toolVersions)
      .where(eq(schema.toolVersions.id, versionId))
      .get()!,
  };
}

/**
 * Create a test guideline with version
 */
export function createTestGuideline(
  db: ReturnType<typeof drizzle>,
  name: string,
  scopeType: 'global' | 'org' | 'project' | 'session' = 'global',
  scopeId?: string,
  category?: string,
  priority: number = 50,
  content?: string
): { guideline: schema.Guideline; version: schema.GuidelineVersion } {
  const guidelineId = generateId();
  const versionId = generateId();

  db.insert(schema.guidelines)
    .values({
      id: guidelineId,
      scopeType,
      scopeId,
      name,
      category,
      priority,
      isActive: true,
    })
    .run();

  db.insert(schema.guidelineVersions)
    .values({
      id: versionId,
      guidelineId,
      versionNum: 1,
      content: content || `Test guideline: ${name}`,
      changeReason: 'Initial version',
    })
    .run();

  db.update(schema.guidelines)
    .set({ currentVersionId: versionId })
    .where(eq(schema.guidelines.id, guidelineId))
    .run();

  return {
    guideline: db
      .select()
      .from(schema.guidelines)
      .where(eq(schema.guidelines.id, guidelineId))
      .get()!,
    version: db
      .select()
      .from(schema.guidelineVersions)
      .where(eq(schema.guidelineVersions.id, versionId))
      .get()!,
  };
}

/**
 * Create a test knowledge entry with version
 */
export function createTestKnowledge(
  db: ReturnType<typeof drizzle>,
  title: string,
  scopeType: 'global' | 'org' | 'project' | 'session' = 'global',
  scopeId?: string,
  content?: string,
  source?: string
): { knowledge: schema.Knowledge; version: schema.KnowledgeVersion } {
  const knowledgeId = generateId();
  const versionId = generateId();

  db.insert(schema.knowledge)
    .values({
      id: knowledgeId,
      scopeType,
      scopeId,
      title,
      source,
      isActive: true,
    })
    .run();

  db.insert(schema.knowledgeVersions)
    .values({
      id: versionId,
      knowledgeId,
      versionNum: 1,
      content: content || `Test knowledge: ${title}`,
      changeReason: 'Initial version',
    })
    .run();

  db.update(schema.knowledge)
    .set({ currentVersionId: versionId })
    .where(eq(schema.knowledge.id, knowledgeId))
    .run();

  return {
    knowledge: db
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.id, knowledgeId))
      .get()!,
    version: db
      .select()
      .from(schema.knowledgeVersions)
      .where(eq(schema.knowledgeVersions.id, versionId))
      .get()!,
  };
}

/**
 * Create a test conversation
 */
export function createTestConversation(
  db: ReturnType<typeof drizzle>,
  sessionId?: string,
  projectId?: string,
  agentId?: string,
  title?: string,
  status: 'active' | 'completed' | 'archived' = 'active',
  metadata?: Record<string, unknown>
): schema.Conversation {
  const id = generateId();
  db.insert(schema.conversations)
    .values({
      id,
      sessionId,
      projectId,
      agentId,
      title: title || 'Test Conversation',
      status,
      metadata,
    })
    .run();
  return db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get()!;
}

/**
 * Create a test conversation message
 */
export function createTestMessage(
  db: ReturnType<typeof drizzle>,
  conversationId: string,
  role: 'user' | 'agent' | 'system' = 'user',
  content: string = 'Test message',
  messageIndex: number = 0,
  contextEntries?: Array<{ type: 'tool' | 'guideline' | 'knowledge'; id: string }>,
  toolsUsed?: string[],
  metadata?: Record<string, unknown>
): schema.ConversationMessage {
  const id = generateId();
  db.insert(schema.conversationMessages)
    .values({
      id,
      conversationId,
      role,
      content,
      messageIndex,
      contextEntries,
      toolsUsed,
      metadata,
    })
    .run();
  return db
    .select()
    .from(schema.conversationMessages)
    .where(eq(schema.conversationMessages.id, id))
    .get()!;
}

/**
 * Create a test conversation context link
 */
export function createTestContextLink(
  db: ReturnType<typeof drizzle>,
  conversationId: string,
  entryType: 'tool' | 'guideline' | 'knowledge',
  entryId: string,
  messageId?: string,
  relevanceScore?: number
): schema.ConversationContext {
  const id = generateId();
  db.insert(schema.conversationContext)
    .values({
      id,
      conversationId,
      messageId,
      entryType,
      entryId,
      relevanceScore,
    })
    .run();
  return db
    .select()
    .from(schema.conversationContext)
    .where(eq(schema.conversationContext.id, id))
    .get()!;
}
