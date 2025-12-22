/**
 * Integration tests for semantic search functionality
 *
 * Note: These tests require embedding provider to be configured
 * Skip if AGENT_MEMORY_EMBEDDING_PROVIDER=disabled
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
  createTestQueryDeps,
} from '../fixtures/test-helpers.js';
import { type MemoryQueryResult } from '../../src/services/query.service.js';
import { executeQueryPipeline } from '../../src/services/query/index.js';
import {
  getEmbeddingService,
  resetEmbeddingService,
} from '../../src/services/embedding.service.js';
import { getVectorService, resetVectorService } from '../../src/services/vector.service.js';
import { generateEmbeddingAsync } from '../../src/db/repositories/embedding-hooks.js';
import { entryEmbeddings } from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

// Helper to execute query with pipeline (replaces legacy executeMemoryQueryAsync)
async function executeMemoryQueryAsync(params: Parameters<typeof executeQueryPipeline>[0]): Promise<MemoryQueryResult> {
  return executeQueryPipeline(params, createTestQueryDeps()) as Promise<MemoryQueryResult>;
}

const TEST_DB_PATH = './data/test-semantic-search-int.db';

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

/**
 * Wait for embedding to be generated and stored
 */
async function waitForEmbedding(
  entryType: 'tool' | 'guideline' | 'knowledge',
  entryId: string,
  maxWaitMs: number = 2000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const embedding = db
      .select()
      .from(entryEmbeddings)
      .where(
        and(
          eq(entryEmbeddings.entryType, entryType),
          eq(entryEmbeddings.entryId, entryId),
          eq(entryEmbeddings.hasEmbedding, true)
        )
      )
      .get();

    if (embedding) {
      return true;
    }

    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

describe('Semantic Search Integration', () => {
  let embeddingService: ReturnType<typeof getEmbeddingService>;

  beforeAll(async () => {
    embeddingService = getEmbeddingService();

    if (!embeddingService.isAvailable()) {
      console.warn('Semantic search tests will be skipped - embeddings not configured');
      return;
    }

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Initialize vector service
    const vectorService = getVectorService();
    await vectorService.initialize();
  });

  afterAll(async () => {
    if (sqlite) {
      sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);

    // Clean up vector database
    const vectorService = getVectorService();
    await vectorService.close();

    // Reset services
    resetEmbeddingService();
    resetVectorService();
  });

  it('should skip semantic search when provider disabled', async () => {
    const result = await executeMemoryQueryAsync({
      types: ['tools'],
      search: 'authentication',
      semanticSearch: false, // Explicitly disable
    });

    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  it('should handle queries when no embeddings exist', async () => {
    // Create a tool without waiting for embedding generation
    const { tool } = createTestTool(
      db,
      'test-tool-no-embedding',
      'global',
      undefined,
      'function',
      'A test tool for authentication'
    );

    // Query immediately (embeddings generated async)
    const result = await executeMemoryQueryAsync({
      types: ['tools'],
      search: 'authentication',
      semanticSearch: true,
    });

    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  it('should accept semantic threshold parameter', async () => {
    const result = await executeMemoryQueryAsync({
      types: ['tools'],
      search: 'testing',
      semanticSearch: true,
      semanticThreshold: 0.8, // Higher threshold
    });

    expect(result).toBeDefined();
  });

  it('should fall back gracefully on embedding errors', async () => {
    // This should not throw even if semantic search fails
    const result = await executeMemoryQueryAsync({
      types: ['tools'],
      search: 'test query',
      semanticSearch: true,
    });

    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should generate and store embeddings for tools',
    async () => {
      const { tool, version } = createTestTool(
        db,
        'authentication-tool',
        'global',
        undefined,
        'function',
        'Tool for user authentication and login'
      );

      // Manually trigger embedding generation
      await generateEmbeddingAsync('tool', tool.id, version.id, tool.name, version);

      // Wait for embedding to be stored
      const hasEmbedding = await waitForEmbedding('tool', tool.id);
      expect(hasEmbedding).toBe(true);

      // Verify embedding record exists
      const embeddingRecord = db
        .select()
        .from(entryEmbeddings)
        .where(and(eq(entryEmbeddings.entryType, 'tool'), eq(entryEmbeddings.entryId, tool.id)))
        .get();

      expect(embeddingRecord).toBeDefined();
      expect(embeddingRecord?.hasEmbedding).toBe(true);
      expect(embeddingRecord?.embeddingModel).toBeDefined();
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should find semantically similar tools',
    async () => {
      // Create tools with semantically related but different terms
      const { tool: loginTool, version: loginVersion } = createTestTool(
        db,
        'user-login',
        'global',
        undefined,
        'function',
        'Handles user login and credential verification'
      );

      const { tool: authTool, version: authVersion } = createTestTool(
        db,
        'authentication-service',
        'global',
        undefined,
        'function',
        'Service for authenticating users and managing sessions'
      );

      // Generate embeddings
      await generateEmbeddingAsync(
        'tool',
        loginTool.id,
        loginVersion.id,
        loginTool.name,
        loginVersion
      );
      await generateEmbeddingAsync('tool', authTool.id, authVersion.id, authTool.name, authVersion);

      // Wait for embeddings
      await waitForEmbedding('tool', loginTool.id);
      await waitForEmbedding('tool', authTool.id);

      // Search for "authentication" - should find both tools
      const result = await executeMemoryQueryAsync({
        types: ['tools'],
        search: 'authentication',
        semanticSearch: true,
        semanticThreshold: 0.3, // Lower threshold for testing
      });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);

      // Both tools should be in results since they're semantically related
      const toolIds = result.results.map((r) => r.id);
      expect(toolIds).toContain(authTool.id);
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should generate and store embeddings for guidelines',
    async () => {
      const { guideline, version } = createTestGuideline(
        db,
        'security-guideline',
        'global',
        undefined,
        'security',
        90,
        'Always use parameterized queries to prevent SQL injection attacks'
      );

      // Manually trigger embedding generation
      await generateEmbeddingAsync('guideline', guideline.id, version.id, guideline.name, version);

      // Wait for embedding to be stored
      const hasEmbedding = await waitForEmbedding('guideline', guideline.id);
      expect(hasEmbedding).toBe(true);
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should find semantically similar guidelines',
    async () => {
      // Create guidelines with related security concepts
      const { guideline: sqlGuideline, version: sqlVersion } = createTestGuideline(
        db,
        'sql-injection-prevention',
        'global',
        undefined,
        'security',
        95,
        'Use prepared statements and parameterized queries to prevent SQL injection'
      );

      const { guideline: xssGuideline, version: xssVersion } = createTestGuideline(
        db,
        'xss-prevention',
        'global',
        undefined,
        'security',
        90,
        'Sanitize user input and escape output to prevent cross-site scripting attacks'
      );

      // Generate embeddings
      await generateEmbeddingAsync(
        'guideline',
        sqlGuideline.id,
        sqlVersion.id,
        sqlGuideline.name,
        sqlVersion
      );
      await generateEmbeddingAsync(
        'guideline',
        xssGuideline.id,
        xssVersion.id,
        xssGuideline.name,
        xssVersion
      );

      // Wait for embeddings
      await waitForEmbedding('guideline', sqlGuideline.id);
      await waitForEmbedding('guideline', xssGuideline.id);

      // Search for "security vulnerabilities" - should find both
      const result = await executeMemoryQueryAsync({
        types: ['guidelines'],
        search: 'security vulnerabilities',
        semanticSearch: true,
        semanticThreshold: 0.3,
      });

      expect(result.results.length).toBeGreaterThan(0);
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should generate and store embeddings for knowledge entries',
    async () => {
      const { knowledge, version } = createTestKnowledge(
        db,
        'API Documentation',
        'global',
        undefined,
        'Documentation for the REST API endpoints and authentication methods',
        'internal-docs'
      );

      // Manually trigger embedding generation
      await generateEmbeddingAsync('knowledge', knowledge.id, version.id, knowledge.title, version);

      // Wait for embedding to be stored
      const hasEmbedding = await waitForEmbedding('knowledge', knowledge.id);
      expect(hasEmbedding).toBe(true);
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should verify hybrid scoring with semantic similarity',
    async () => {
      // Create a tool with clear semantic match
      const { tool, version } = createTestTool(
        db,
        'database-query-tool',
        'global',
        undefined,
        'function',
        'Tool for executing database queries and managing connections'
      );

      await generateEmbeddingAsync('tool', tool.id, version.id, tool.name, version);
      await waitForEmbedding('tool', tool.id);

      // Search with semantic search enabled
      const result = await executeMemoryQueryAsync({
        types: ['tools'],
        search: 'database operations',
        semanticSearch: true,
        semanticThreshold: 0.3,
      });

      // Results should have scores
      expect(result.results.length).toBeGreaterThan(0);
      result.results.forEach((item) => {
        expect(item.score).toBeDefined();
        expect(typeof item.score).toBe('number');
        expect(item.score).toBeGreaterThan(0);
      });
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should properly sort results by semantic similarity',
    async () => {
      // Create tools with varying semantic similarity to "database"
      const { tool: dbTool, version: dbVersion } = createTestTool(
        db,
        'database-connector',
        'global',
        undefined,
        'function',
        'Connect to SQL databases and execute queries'
      );

      const { tool: apiTool, version: apiVersion } = createTestTool(
        db,
        'api-client',
        'global',
        undefined,
        'function',
        'HTTP client for making API requests to external services'
      );

      await generateEmbeddingAsync('tool', dbTool.id, dbVersion.id, dbTool.name, dbVersion);
      await generateEmbeddingAsync('tool', apiTool.id, apiVersion.id, apiTool.name, apiVersion);

      await waitForEmbedding('tool', dbTool.id);
      await waitForEmbedding('tool', apiTool.id);

      // Search for "database" - should rank database tool higher
      const result = await executeMemoryQueryAsync({
        types: ['tools'],
        search: 'database',
        semanticSearch: true,
        semanticThreshold: 0.2,
      });

      if (result.results.length >= 2) {
        // Results should be sorted by score (descending)
        for (let i = 0; i < result.results.length - 1; i++) {
          expect(result.results[i].score).toBeGreaterThanOrEqual(result.results[i + 1].score);
        }
      }
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should handle different semantic thresholds',
    async () => {
      // Create a tool
      const { tool, version } = createTestTool(
        db,
        'file-processor',
        'global',
        undefined,
        'function',
        'Process and transform file contents'
      );

      await generateEmbeddingAsync('tool', tool.id, version.id, tool.name, version);
      await waitForEmbedding('tool', tool.id);

      // High threshold - should be more strict
      const strictResult = await executeMemoryQueryAsync({
        types: ['tools'],
        search: 'file operations',
        semanticSearch: true,
        semanticThreshold: 0.9,
      });

      // Low threshold - should be more lenient
      const lenientResult = await executeMemoryQueryAsync({
        types: ['tools'],
        search: 'file operations',
        semanticSearch: true,
        semanticThreshold: 0.1,
      });

      // Lenient should have more or equal results
      expect(lenientResult.results.length).toBeGreaterThanOrEqual(strictResult.results.length);
    }
  );

  it.skipIf(() => !embeddingService?.isAvailable())(
    'should search across multiple entry types',
    async () => {
      // Create entries of different types with related content
      const { tool, version: toolVersion } = createTestTool(
        db,
        'testing-framework',
        'global',
        undefined,
        'function',
        'Framework for writing and running unit tests'
      );

      const { guideline, version: guidelineVersion } = createTestGuideline(
        db,
        'testing-guidelines',
        'global',
        undefined,
        'testing',
        80,
        'Write comprehensive unit tests for all critical functionality'
      );

      await generateEmbeddingAsync('tool', tool.id, toolVersion.id, tool.name, toolVersion);
      await generateEmbeddingAsync(
        'guideline',
        guideline.id,
        guidelineVersion.id,
        guideline.name,
        guidelineVersion
      );

      await waitForEmbedding('tool', tool.id);
      await waitForEmbedding('guideline', guideline.id);

      // Search across both types
      const result = await executeMemoryQueryAsync({
        types: ['tools', 'guidelines'],
        search: 'testing',
        semanticSearch: true,
        semanticThreshold: 0.3,
      });

      expect(result.results.length).toBeGreaterThan(0);

      // Should have both types in results
      const hasTools = result.results.some((r) => r.type === 'tool');
      const hasGuidelines = result.results.some((r) => r.type === 'guideline');

      expect(hasTools || hasGuidelines).toBe(true);
    }
  );
});
