import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';
import { generateId } from '../../src/db/repositories/base.js';
import { applyMigrations } from './migration-loader.js';
import { cleanupDbFiles, ensureDataDirectory, cleanupVectorDb, cleanupTestVectorDbs } from './db-utils.js';
import {
  registerDatabase,
  resetContainer,
  clearPreparedStatementCache,
  getDb,
  getPreparedStatement,
  getSqlite,
} from '../../src/db/connection.js';
import {
  registerRuntime,
  isRuntimeRegistered,
  getRuntime,
  registerContext,
} from '../../src/core/container.js';
import { createRuntime, type Runtime } from '../../src/core/runtime.js';
import { createAppContext } from '../../src/core/factory.js';
import type { AppContext } from '../../src/core/context.js';
import type { DatabaseDeps } from '../../src/core/types.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { buildConfig, type Config } from '../../src/config/index.js';
import {
  createDependencies,
  type PipelineDependencies,
  wireQueryCacheInvalidation,
} from '../../src/services/query/index.js';
import { createComponentLogger } from '../../src/utils/logger.js';
import { SecurityService } from '../../src/services/security.service.js';
// Repository factory imports
import {
  createTagRepository,
  createEntryTagRepository,
  createEntryRelationRepository,
} from '../../src/db/repositories/tags.js';
import {
  createOrganizationRepository,
  createProjectRepository,
  createSessionRepository,
} from '../../src/db/repositories/scopes.js';
import { createFileLockRepository } from '../../src/db/repositories/file_locks.js';
import { createGuidelineRepository } from '../../src/db/repositories/guidelines.js';
import { createKnowledgeRepository } from '../../src/db/repositories/knowledge.js';
import { createToolRepository } from '../../src/db/repositories/tools.js';
import { createConversationRepository } from '../../src/db/repositories/conversations.js';
import { createConflictRepository } from '../../src/db/repositories/conflicts.js';
import { createExperienceRepository } from '../../src/db/repositories/experiences.js';
import { PermissionService } from '../../src/services/permission.service.js';
import { VerificationService } from '../../src/services/verification.service.js';
import type { AppContextServices } from '../../src/core/context.js';

// Re-export schema for use in tests
export { schema };

/**
 * Create repositories for unit tests that don't need full AppContext.
 * Uses the factory pattern with injected database dependencies.
 *
 * @param testDb - The test database from setupTestDb()
 * @returns All repositories with injected dependencies
 */
export function createTestRepositories(testDb: TestDb): Repositories {
  const db = testDb.db as unknown as AppContext['db'];
  const dbDeps: DatabaseDeps = { db, sqlite: testDb.sqlite };

  const tagRepo = createTagRepository(dbDeps);
  const toolRepo = createToolRepository(dbDeps);
  return {
    tags: tagRepo,
    entryTags: createEntryTagRepository(dbDeps, tagRepo),
    entryRelations: createEntryRelationRepository(dbDeps),
    organizations: createOrganizationRepository(dbDeps),
    projects: createProjectRepository(dbDeps),
    sessions: createSessionRepository(dbDeps),
    fileLocks: createFileLockRepository(dbDeps),
    guidelines: createGuidelineRepository(dbDeps),
    knowledge: createKnowledgeRepository(dbDeps),
    tools: toolRepo,
    conversations: createConversationRepository(dbDeps),
    conflicts: createConflictRepository(dbDeps),
    experiences: createExperienceRepository({ ...dbDeps, toolRepo }),
  };
}

// Re-export container functions for test cleanup
export { registerDatabase, resetContainer, clearPreparedStatementCache };

// Re-export vector cleanup utilities
export { cleanupVectorDb, cleanupTestVectorDbs };

// Re-export runtime functions for test setup
export { registerRuntime, isRuntimeRegistered, getRuntime };

// Re-export container's registerContext and getContext for tests
export { registerContext };
import { getContext } from '../../src/core/container.js';
export { getContext };

/**
 * Get the test context. Must call registerTestContext first.
 * @throws Error if context not registered
 */
export function getTestContext(): AppContext {
  return getContext();
}

// Re-export query dependencies factory
export { createDependencies, type PipelineDependencies };

/**
 * Create query pipeline dependencies for tests.
 * Uses the test runtime's query cache.
 *
 * @returns PipelineDependencies for use with executeQueryPipeline
 */
export function createTestQueryDeps(): PipelineDependencies {
  const runtime = getRuntime();
  const logger = createComponentLogger('query-pipeline-test');
  return createDependencies({
    getDb: () => getDb(),
    getPreparedStatement: (sql: string) => getPreparedStatement(sql),
    cache: runtime.queryCache.cache,
    perfLog: false,
    logger,
  });
}

/**
 * Get the test runtime's query cache.
 * Useful for tests that need to check cache state.
 */
export function getTestQueryCache() {
  const runtime = getRuntime();
  return runtime.queryCache.cache;
}

/**
 * Clear the test runtime's query cache.
 */
export function clearTestQueryCache(): void {
  const runtime = getRuntime();
  runtime.queryCache.cache.clear();
}

/**
 * Create a minimal test runtime configuration
 */
function createTestRuntimeConfig() {
  return {
    cache: {
      totalLimitMB: 100,
      pressureThreshold: 0.9,
    },
    memory: {
      checkIntervalMs: 60000,
    },
    rateLimit: {
      enabled: false,
      perAgent: { maxRequests: 100, windowMs: 60000 },
      global: { maxRequests: 1000, windowMs: 60000 },
      burst: { maxRequests: 50, windowMs: 1000 },
    },
    queryCache: {
      maxSize: 100,
      maxMemoryMB: 10,
      ttlMs: 5 * 60 * 1000,
    },
  };
}

/**
 * Ensure a test runtime is registered.
 * Creates one if not already registered.
 */
export function ensureTestRuntime(): Runtime {
  if (!isRuntimeRegistered()) {
    const runtime = createRuntime(createTestRuntimeConfig());
    registerRuntime(runtime);
    return runtime;
  }
  // Return a placeholder - actual runtime is in container
  return {} as Runtime;
}

/**
 * Create a full AppContext for integration testing.
 *
 * This creates a complete context with all services wired up,
 * suitable for testing service-level code that requires the full context.
 *
 * @param testDb - The test database from setupTestDb()
 * @returns Fully initialized AppContext
 */
export async function createTestContext(testDb: TestDb): Promise<AppContext> {
  ensureTestRuntime();
  const baseConfig = buildConfig();
  const config = {
    ...baseConfig,
    database: { ...baseConfig.database, path: testDb.path },
  };
  return createAppContext(config);
}

export interface TestDb {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle>;
  path: string;
}

/**
 * Register a minimal test context for handler tests.
 * This creates and registers an AppContext that handlers can use via getContext().
 * Also wires up cache invalidation for the query cache.
 *
 * @param testDb - The test database from setupTestDb()
 * @returns The registered AppContext
 */
export function registerTestContext(testDb: TestDb): AppContext {
  ensureTestRuntime();
  const config = buildConfig();
  const logger = createComponentLogger('test');
  const queryDeps = createTestQueryDeps();
  const security = new SecurityService(config);
  const runtime = getRuntime();

  // Wire up cache invalidation if not already done
  if (!runtime.queryCache.unsubscribe) {
    runtime.queryCache.unsubscribe = wireQueryCacheInvalidation(
      runtime.queryCache.cache,
      createComponentLogger('query-cache-test')
    );
  }

  // Create database dependencies for repository injection
  const db = testDb.db as unknown as AppContext['db'];
  const dbDeps: DatabaseDeps = { db, sqlite: testDb.sqlite };

  // Create all repositories with injected dependencies
  const tagRepo = createTagRepository(dbDeps);
  const toolRepo = createToolRepository(dbDeps);
  const repos: Repositories = {
    tags: tagRepo,
    entryTags: createEntryTagRepository(dbDeps, tagRepo),
    entryRelations: createEntryRelationRepository(dbDeps),
    organizations: createOrganizationRepository(dbDeps),
    projects: createProjectRepository(dbDeps),
    sessions: createSessionRepository(dbDeps),
    fileLocks: createFileLockRepository(dbDeps),
    guidelines: createGuidelineRepository(dbDeps),
    knowledge: createKnowledgeRepository(dbDeps),
    tools: toolRepo,
    conversations: createConversationRepository(dbDeps),
    conflicts: createConflictRepository(dbDeps),
    experiences: createExperienceRepository({ ...dbDeps, toolRepo }),
  };

  // Create services including permission service (required for handlers)
  const services: AppContextServices = {
    permission: new PermissionService(db, runtime.memoryCoordinator),
    verification: new VerificationService(db),
  };

  const context: AppContext = {
    config,
    db,
    sqlite: testDb.sqlite,
    logger,
    queryDeps,
    security,
    runtime,
    repos,
    services,
  };

  registerContext(context);
  return context;
}

/**
 * Setup an isolated test database and register with container
 */
export function setupTestDb(dbPath: string): TestDb {
  // Ensure data directory exists
  ensureDataDirectory();

  // Clean up any existing test database
  cleanupDbFiles(dbPath);

  // Ensure a runtime is registered for tests
  ensureTestRuntime();

  // Create test database
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Register with container so getDb()/getSqlite() work
  registerDatabase(db, sqlite);

  // Run migrations (dynamically discovered)
  applyMigrations(sqlite);

  return { sqlite, db, path: dbPath };
}

/**
 * Clean up test database and reset container
 */
export function cleanupTestDb(dbPath: string): void {
  clearPreparedStatementCache();
  resetContainer();
  cleanupDbFiles(dbPath);
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

/**
 * Create a test experience with version
 */
export function createTestExperience(
  db: ReturnType<typeof drizzle>,
  title: string,
  scopeType: 'global' | 'org' | 'project' | 'session' = 'global',
  scopeId?: string,
  level: 'case' | 'strategy' = 'case',
  category?: string,
  content?: string,
  scenario?: string
): { experience: schema.Experience; version: schema.ExperienceVersion } {
  const experienceId = generateId();
  const versionId = generateId();

  db.insert(schema.experiences)
    .values({
      id: experienceId,
      scopeType,
      scopeId,
      title,
      level,
      category,
      isActive: true,
    })
    .run();

  db.insert(schema.experienceVersions)
    .values({
      id: versionId,
      experienceId,
      versionNum: 1,
      content: content || `Test experience: ${title}`,
      scenario: scenario || 'Test scenario',
      outcome: 'success',
      source: 'user',
      changeReason: 'Initial version',
    })
    .run();

  db.update(schema.experiences)
    .set({ currentVersionId: versionId })
    .where(eq(schema.experiences.id, experienceId))
    .run();

  return {
    experience: db
      .select()
      .from(schema.experiences)
      .where(eq(schema.experiences.id, experienceId))
      .get()!,
    version: db
      .select()
      .from(schema.experienceVersions)
      .where(eq(schema.experienceVersions.id, versionId))
      .get()!,
  };
}
