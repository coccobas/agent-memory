/**
 * Integration Test for Coarse-to-Fine Retrieval
 *
 * Demonstrates the complete workflow with mock data.
 * Can be used as a template for actual tests.
 *
 * NOTE: Console output is intentional for test feedback.
 */

/* eslint-disable no-console */

import { eq } from 'drizzle-orm';
import type { AppDb } from '../../../core/types.js';
import { summaries, summaryMembers } from '../../../db/schema.js';
import { CoarseToFineRetriever } from './coarse-to-fine.js';
import type { EmbeddingService } from '../../embedding.service.js';

/**
 * Mock data structure for testing
 */
interface MockHierarchy {
  domains: Array<{ id: string; title: string; embedding: number[] }>;
  topics: Array<{ id: string; parentId: string; title: string; embedding: number[] }>;
  chunks: Array<{ id: string; parentId: string; title: string; embedding: number[] }>;
  entries: Array<{ id: string; chunkId: string; type: string }>;
}

/**
 * Create mock hierarchical summaries for testing
 */
export async function setupMockHierarchy(db: AppDb): Promise<MockHierarchy> {
  const projectId = 'test-project';
  const now = new Date().toISOString();

  // Create mock embeddings (simplified 3D vectors for testing)
  const mockEmbeddings = {
    security: [1.0, 0.0, 0.0],
    auth: [0.9, 0.1, 0.0],
    jwt: [0.8, 0.2, 0.0],
    backend: [0.0, 1.0, 0.0],
    database: [0.0, 0.9, 0.1],
    migrations: [0.0, 0.8, 0.2],
  };

  // Level 2: Domain summaries
  const domains = [
    {
      id: 'domain-security',
      title: 'Security',
      embedding: mockEmbeddings.security,
    },
    {
      id: 'domain-backend',
      title: 'Backend Development',
      embedding: mockEmbeddings.backend,
    },
  ];

  for (const domain of domains) {
    db.insert(summaries)
      .values({
        id: domain.id,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 2,
        parentSummaryId: null,
        title: domain.title,
        content: `High-level summary of ${domain.title}`,
        memberCount: 0,
        embedding: domain.embedding,
        embeddingDimension: 3,
        isActive: true,
        needsRegeneration: false,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      })
      .run();
  }

  // Level 1: Topic summaries
  const topics = [
    {
      id: 'topic-auth',
      parentId: 'domain-security',
      title: 'Authentication',
      embedding: mockEmbeddings.auth,
    },
    {
      id: 'topic-database',
      parentId: 'domain-backend',
      title: 'Database',
      embedding: mockEmbeddings.database,
    },
  ];

  for (const topic of topics) {
    db.insert(summaries)
      .values({
        id: topic.id,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 1,
        parentSummaryId: topic.parentId,
        title: topic.title,
        content: `Topic summary for ${topic.title}`,
        memberCount: 0,
        embedding: topic.embedding,
        embeddingDimension: 3,
        isActive: true,
        needsRegeneration: false,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      })
      .run();

    // Link topic to parent domain
    db.insert(summaryMembers)
      .values({
        id: `member-${topic.id}`,
        summaryId: topic.parentId,
        memberType: 'summary',
        memberId: topic.id,
        contributionScore: 0.9,
        displayOrder: 0,
        createdAt: now,
      })
      .run();
  }

  // Level 0: Chunk summaries
  const chunks = [
    {
      id: 'chunk-jwt',
      parentId: 'topic-auth',
      title: 'JWT Tokens',
      embedding: mockEmbeddings.jwt,
    },
    {
      id: 'chunk-migrations',
      parentId: 'topic-database',
      title: 'Database Migrations',
      embedding: mockEmbeddings.migrations,
    },
  ];

  for (const chunk of chunks) {
    db.insert(summaries)
      .values({
        id: chunk.id,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        parentSummaryId: chunk.parentId,
        title: chunk.title,
        content: `Chunk summary for ${chunk.title}`,
        memberCount: 0,
        embedding: chunk.embedding,
        embeddingDimension: 3,
        isActive: true,
        needsRegeneration: false,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      })
      .run();

    // Link chunk to parent topic
    db.insert(summaryMembers)
      .values({
        id: `member-${chunk.id}`,
        summaryId: chunk.parentId,
        memberType: 'summary',
        memberId: chunk.id,
        contributionScore: 0.85,
        displayOrder: 0,
        createdAt: now,
      })
      .run();
  }

  // Base entries
  const entries = [
    { id: 'guideline-jwt-1', chunkId: 'chunk-jwt', type: 'guideline' as const },
    { id: 'guideline-jwt-2', chunkId: 'chunk-jwt', type: 'guideline' as const },
    { id: 'knowledge-migration-1', chunkId: 'chunk-migrations', type: 'knowledge' as const },
  ];

  for (const entry of entries) {
    db.insert(summaryMembers)
      .values({
        id: `member-${entry.id}`,
        summaryId: entry.chunkId,
        memberType: entry.type,
        memberId: entry.id,
        contributionScore: 0.8,
        displayOrder: 0,
        createdAt: now,
      })
      .run();
  }

  return { domains, topics, chunks, entries };
}

/**
 * Test hierarchical search
 */
export async function testHierarchicalSearch(
  db: AppDb,
  embeddingService: EmbeddingService
): Promise<void> {
  console.log('Setting up mock hierarchy...');
  const hierarchy = await setupMockHierarchy(db);
  console.log(
    `Created ${hierarchy.domains.length} domains, ${hierarchy.topics.length} topics, ${hierarchy.chunks.length} chunks`
  );

  const retriever = new CoarseToFineRetriever(db, embeddingService);

  // Test 1: Search for authentication-related content
  console.log('\nTest 1: Searching for "authentication"...');
  const authResult = await retriever.retrieve({
    query: 'authentication security',
    scopeType: 'project',
    scopeId: 'test-project',
    queryEmbedding: [0.85, 0.15, 0.0], // Similar to auth embedding
    maxResults: 5,
  });

  console.log(`Found ${authResult.entries.length} entries in ${authResult.totalTimeMs}ms`);
  console.log('Steps:', authResult.steps);
  console.log('Entries:', authResult.entries);

  // Test 2: Browse top-level
  console.log('\nTest 2: Browsing top-level summaries...');
  const topLevel = await retriever.getTopLevel('project', 'test-project');
  console.log(`Found ${topLevel.length} top-level summaries:`);
  topLevel.forEach((s) => console.log(`  - ${s.title} (level ${s.hierarchyLevel})`));

  // Test 3: Drill down
  console.log('\nTest 3: Drilling down into Security domain...');
  const drillDown = await retriever.drillDown('domain-security');
  console.log(`Summary: ${drillDown.summary.title}`);
  console.log(`Children: ${drillDown.children.length}`);
  console.log(`Members: ${drillDown.members.length}`);

  // Cleanup
  console.log('\nCleaning up...');
  db.delete(summaries).where(eq(summaries.scopeId, 'test-project')).run();
  db.delete(summaryMembers).run(); // Clean all for simplicity
  console.log('Test complete!');
}

/**
 * Test performance characteristics
 */
export async function testPerformance(
  db: AppDb,
  embeddingService: EmbeddingService
): Promise<void> {
  console.log('Performance test...');
  await setupMockHierarchy(db); // Sets up test data
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  const queries = [
    { query: 'JWT authentication', embedding: [0.9, 0.1, 0.0] },
    { query: 'database migrations', embedding: [0.0, 0.85, 0.15] },
    { query: 'security practices', embedding: [0.95, 0.05, 0.0] },
  ];

  const results = [];

  for (const q of queries) {
    const start = Date.now();
    const result = await retriever.retrieve({
      query: q.query,
      scopeType: 'project',
      scopeId: 'test-project',
      queryEmbedding: q.embedding,
    });
    const elapsed = Date.now() - start;

    results.push({
      query: q.query,
      entries: result.entries.length,
      timeMs: elapsed,
      steps: result.steps.length,
    });
  }

  console.log('\nPerformance Results:');
  console.table(results);

  // Cleanup
  db.delete(summaries).where(eq(summaries.scopeId, 'test-project')).run();
  db.delete(summaryMembers).run();
}
